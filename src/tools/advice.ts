/**
 * advice tool handler.
 *
 * Returns a tag-tailored quality cycle: ordered steps, tool stack, and
 * example Playwright smoke config — so developers know exactly what to
 * build and when to run it.
 */

import { z } from "zod";
import { resolve } from "node:path";
import { loadUserOverrides } from "../registry/loader.js";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";

// ── Schema ─────────────────────────────────────────────────────────────

export const adviceSchema = z.object({
  project_dir: z
    .string()
    .optional()
    .describe(
      "Absolute path to the project root. When provided, tags are read from " +
      "forgecraft.yaml unless overridden by the `tags` parameter.",
    ),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Override tags — skip auto-detection from forgecraft.yaml."),
});

export type AdviceInput = z.infer<typeof adviceSchema>;

// ── Tag-specific tool registry ─────────────────────────────────────────

interface TagAdvice {
  readonly tools: Array<{ layer: string; tools: string }>;
  readonly cycleAdditions: string[];
  readonly smokeNote: string;
}

const TAG_ADVICE: Partial<Record<Tag, TagAdvice>> = {
  API: {
    tools: [
      { layer: "Contract (CDC)", tools: "Pact, Spring Cloud Contract" },
      { layer: "Subcutaneous / API", tools: "Supertest (Node), httpx (Python)" },
      { layer: "Smoke", tools: "Playwright `APIRequestContext` — no browser overhead" },
      { layer: "Security DAST", tools: "OWASP ZAP (staging, pre-prod)" },
    ],
    cycleAdditions: [
      "PR gate: Contract / CDC provider verification (Pact broker)",
      "PR gate: Subcutaneous suite — every endpoint × happy/sad/auth/edge",
      "PR gate: Rate-limit behavior covered in integration suite",
      "Staging: OWASP ZAP active DAST scan (blocking on High findings)",
      "Staging: k6 performance baseline (compare to previous deploy)",
    ],
    smokeNote:
      "API smoke uses `APIRequestContext` — no browser. Covers: health, auth, primary read/write, 404 shape.",
  },
  "WEB-REACT": {
    tools: [
      { layer: "Component / Unit", tools: "@testing-library/react + @testing-library/user-event" },
      { layer: "Visual Regression", tools: "Chromatic or Percy (per Storybook story)" },
      { layer: "a11y", tools: "axe-core + @axe-core/playwright" },
      { layer: "Smoke", tools: "Playwright (full browser)" },
    ],
    cycleAdditions: [
      "PR gate: Storybook stories for every component state",
      "PR gate: Chromatic visual regression (0% diff threshold for exact-match surfaces)",
      "PR gate: axe automated a11y on all routes via Playwright",
      "PR gate: Playwright E2E — auth flow, primary write, multi-step wizard",
      "PR gate: Expose store to window (`window.__store`) for chain verification tests",
      "Staging: Playwright browser smoke — page loads, auth wall, a11y baseline",
    ],
    smokeNote:
      "React smoke uses full browser Playwright. Covers: page load + console errors, auth redirect, critical a11y.",
  },
  "WEB-STATIC": {
    tools: [
      { layer: "Smoke", tools: "Playwright (full browser)" },
      { layer: "Performance", tools: "Lighthouse CI (PR + staging baseline)" },
    ],
    cycleAdditions: [
      "PR gate: Lighthouse CI performance score gate (≥90 performance, ≥95 a11y)",
      "PR gate: Broken link scan (Playwright or linkinator)",
      "Staging: Playwright browser smoke — key pages, broken assets, 404 shape, HTTPS redirect",
    ],
    smokeNote:
      "Static smoke uses full browser Playwright. Covers: key pages load, no broken assets, 404 page, HTTPS.",
  },
  GAME: {
    tools: [
      { layer: "Headless Unit (Tier 1)", tools: "Vitest / Jest — zero browser, pre-commit" },
      { layer: "Browser Smoke (Tier 2)", tools: "Playwright (full browser — canvas, WebGL)" },
      { layer: "Perf Smoke (Tier 3)", tools: "Playwright + CDP (`Performance.getMetrics` FPS floor)" },
      { layer: "Visual QA Gate", tools: "Playwright screenshots + PCA silhouette checks" },
    ],
    cycleAdditions: [
      "Pre-commit: Headless unit — state machines, physics, scoring, save/load round-trip",
      "PR gate: All headless unit + integration suites",
      "Staging: Tier 2 browser smoke — canvas visible, WebGL context, no JS errors",
      "Staging: Tier 3 perf smoke — FPS ≥ floor declared in spec.md (default 30 FPS)",
      "RC: MCP-mediated visual/scene inspection for judgment-requiring defects",
    ],
    smokeNote:
      "Game smoke is three-tier: headless logic (pre-commit), browser canvas check (staging), FPS floor check (staging).",
  },
  "DATA-PIPELINE": {
    tools: [
      { layer: "Data Quality", tools: "Great Expectations, dbt tests, Soda" },
      { layer: "Schema Drift", tools: "dbt schema tests + CI assertions" },
    ],
    cycleAdditions: [
      "Pre-commit: Schema validation on sample data",
      "PR gate: Row count and null rate assertions on test fixtures",
      "PR gate: Schema contract tests (no unexpected column drops or type changes)",
      "Staging: Full pipeline run on staging data with quality gate thresholds",
    ],
    smokeNote: "Pipeline smoke: run the pipeline end-to-end on a small staging dataset, assert row counts and key column non-null rates.",
  },
  ML: {
    tools: [
      { layer: "Model Evaluation", tools: "pytest + metrics assertions (accuracy, F1, AUC floors)" },
      { layer: "Drift Detection", tools: "Evidently AI, Alibi Detect" },
    ],
    cycleAdditions: [
      "PR gate: Model evaluation on held-out test set — block if metric drops below floor",
      "PR gate: Bias and fairness audit on protected attributes",
      "Staging: Shadow deployment — compare new model predictions to baseline",
      "RC: A/B significance test before full traffic cut-over",
    ],
    smokeNote: "ML smoke: inference latency p99 within SLA, prediction schema validates, no NaN outputs on reference inputs.",
  },
  CLI: {
    tools: [
      { layer: "Subprocess Integration", tools: "execa, child_process, subprocess.run" },
    ],
    cycleAdditions: [
      "PR gate: Subprocess integration tests — spawns real CLI binary, asserts stdout/stderr/exit code",
      "PR gate: Exit code contract tests (0=success, 1=error, 2=usage error)",
      "PR gate: `--help` and `--version` always succeed",
      "RC: Test against minimum supported Node/Python version",
    ],
    smokeNote: "CLI smoke: `npx <package> --version` exits 0 with semver output; `--help` exits 0.",
  },
  LIBRARY: {
    tools: [
      { layer: "Public API Tests", tools: "Test against exported surface only (not internals)" },
      { layer: "Multi-version", tools: "Matrix test against peer dependency version range" },
    ],
    cycleAdditions: [
      "PR gate: Test only against the public API surface (barrel exports)",
      "PR gate: Peer dependency matrix — test with min and max supported versions",
      "PR gate: Type-level tests (`tsd`, `expect-type`) for TypeScript libraries",
      "RC: Bundle size audit — `bundlephobia` or `size-limit` gate",
    ],
    smokeNote: "Library smoke: `require()` / `import` the built package in a clean install; call each exported function once.",
  },
  REALTIME: {
    tools: [
      { layer: "WebSocket / SSE", tools: "ws (test client), EventSource, Socket.IO mock" },
    ],
    cycleAdditions: [
      "PR gate: Reconnect and message ordering tests",
      "PR gate: Backpressure behavior under slow consumer",
      "Staging: Load test with sustained concurrent connections (k6 WebSocket scenario)",
    ],
    smokeNote: "Realtime smoke: WebSocket handshake completes, heartbeat received within timeout, disconnect handled cleanly.",
  },
  FINTECH: {
    tools: [
      { layer: "Precision", tools: "Decimal arithmetic — never IEEE 754 floats for currency" },
      { layer: "Audit Log", tools: "Assert every mutation event is logged (completeness test)" },
    ],
    cycleAdditions: [
      "PR gate: Financial precision tests — decimal arithmetic, rounding mode asserted",
      "PR gate: Idempotency tests on all payment/transfer mutations",
      "PR gate: Audit log completeness — every state change produces an immutable log entry",
      "RC: Reconciliation test — sum of ledger entries equals expected balance",
    ],
    smokeNote: "Fintech smoke: health + auth + primary read path. No write operations in smoke — no production money movement.",
  },
  HEALTHCARE: {
    tools: [
      { layer: "PHI Access Control", tools: "Integration tests asserting role-based PHI visibility" },
    ],
    cycleAdditions: [
      "PR gate: PHI field access control — assert non-authorized roles cannot read PHI fields",
      "PR gate: Audit log coverage — every PHI access and mutation is logged",
      "PR gate: De-identification tests — exported data contains no identifying fields",
      "RC: HIPAA compliance review before deploy",
    ],
    smokeNote: "Healthcare smoke: health + auth. Never include real PHI in smoke credentials or fixtures.",
  },
};

// ── Base quality cycle ─────────────────────────────────────────────────

const BASE_TOOLS = [
  { layer: "Unit (Solitary)", tools: "Vitest / Jest (JS/TS), pytest (Python)" },
  { layer: "Unit (Sociable)", tools: "Same runner — allow real, fast non-I/O collaborators" },
  { layer: "Integration (DB)", tools: "Testcontainers, SQLite in-process, pg-mem" },
  { layer: "Integration (External)", tools: "msw (HTTP stubs), WireMock" },
  { layer: "SAST", tools: "npm audit, Semgrep, ESLint security plugins, Snyk" },
];

const BASE_CYCLE = [
  "**File save (background)**: type-check (`tsc --noEmit`), lint",
  "**Pre-commit**: unit tests (solitary + sociable) — must be < 30s",
  "**PR gate**: full unit suite + coverage gate (≥ 80% overall, ≥ 90% on changed code)",
  "**PR gate**: integration tests (DB layer + external service stubs)",
  "**PR gate**: SAST — `npm audit --audit-level=high`, Semgrep, dependency scan",
  "**PR gate**: regression gate — all prior layers must be green, no exceptions",
  "**Staging (post-deploy)**: smoke suite — `npx playwright test --grep @smoke`",
  "**RC gate**: mutation score ≥ 80% on changed code (Stryker / mutmut)",
  "**RC gate**: full a11y audit where applicable (WCAG 2.1 AA)",
];

// ── Playwright config example ──────────────────────────────────────────

function smokeConfigExample(tags: Tag[]): string {
  const hasBrowser = tags.some(t => ["WEB-REACT", "WEB-STATIC", "GAME"].includes(t));
  const hasApi = tags.includes("API");

  if (!hasBrowser && !hasApi) return "";

  const projects: string[] = [];
  if (hasBrowser) {
    projects.push(
      "    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }",
    );
  }
  if (hasApi) {
    projects.push(
      "    // API smoke uses APIRequestContext — no browser project needed",
    );
  }

  return `
## Example: playwright.smoke.config.ts

\`\`\`typescript
import { defineConfig${hasBrowser ? ", devices" : ""} } from '@playwright/test';

export default defineConfig({
  testMatch: '**/*.smoke.ts',
  retries: 1,          // one retry — smoke fail = broken deploy
  timeout: 15_000,
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    // Never run smoke against localhost in CI — use staging URL
  },${hasBrowser ? `\n  projects: [\n${projects.join(",\n")}\n  ],` : ""}
});
\`\`\`

Run with: \`npx playwright test --config playwright.smoke.config.ts\`
`;
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Return a tag-tailored quality cycle: ordered steps, tool stack table,
 * and example smoke config.
 *
 * @param args - Validated input matching `adviceSchema`
 * @returns MCP-style content array with a single formatted markdown report
 */
export async function adviceHandler(
  args: AdviceInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags = resolveAdviceTags(args);
  const report = buildAdviceReport(tags);
  return { content: [{ type: "text", text: report }] };
}

// ── Internal helpers ───────────────────────────────────────────────────

/**
 * Resolve tags from explicit input or forgecraft.yaml.
 *
 * @param args - Handler input
 * @returns Resolved tag list (always includes UNIVERSAL)
 */
function resolveAdviceTags(args: AdviceInput): Tag[] {
  if (args.tags && args.tags.length > 0) return args.tags as Tag[];
  if (args.project_dir) {
    const config = loadUserOverrides(resolve(args.project_dir));
    if (config?.tags && config.tags.length > 0) return config.tags;
  }
  return ["UNIVERSAL"];
}

/**
 * Build the full advice markdown report for the given tags.
 *
 * @param tags - Project tags to generate advice for
 * @returns Markdown-formatted report string
 */
function buildAdviceReport(tags: Tag[]): string {
  const tagLabel = tags.join(", ");

  // Aggregate tools
  const toolRows = [...BASE_TOOLS];
  for (const tag of tags) {
    const advice = TAG_ADVICE[tag];
    if (advice) toolRows.push(...advice.tools);
  }

  // Deduplicate by layer label
  const seenLayers = new Set<string>();
  const dedupedTools = toolRows.filter(row => {
    if (seenLayers.has(row.layer)) return false;
    seenLayers.add(row.layer);
    return true;
  });

  // Aggregate cycle steps
  const cycleSteps = [...BASE_CYCLE];
  for (const tag of tags) {
    const advice = TAG_ADVICE[tag];
    if (advice) cycleSteps.push(...advice.cycleAdditions);
  }

  // Smoke notes per tag
  const smokeNotes: string[] = [];
  for (const tag of tags) {
    const advice = TAG_ADVICE[tag];
    if (advice?.smokeNote) smokeNotes.push(`- **${tag}**: ${advice.smokeNote}`);
  }

  const toolTable =
    "| Layer | Tooling |\n|---|---|\n" +
    dedupedTools.map(r => `| ${r.layer} | ${r.tools} |`).join("\n");

  const smokeSection =
    smokeNotes.length > 0
      ? `\n## Smoke Testing Notes\n${smokeNotes.join("\n")}\n`
      : "";

  const configSection = smokeConfigExample(tags);

  return [
    `# Quality Cycle Advice — ${tagLabel}`,
    "",
    "## Recommended Tool Stack",
    toolTable,
    "",
    "## Quality Cycle (Ordered Gates)",
    cycleSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    smokeSection,
    configSection,
    "---",
    "> Generated by `forgecraft advice`. Run `forgecraft refresh` if your project's tags have changed.",
  ].join("\n");
}
