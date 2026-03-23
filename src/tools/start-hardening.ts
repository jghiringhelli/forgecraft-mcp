/**
 * start_hardening action handler.
 *
 * Generates hardening session prompts for the three hardening phases:
 *   HARDEN-001: pre-release — security scan, mutation testing, OWASP dependency check
 *   HARDEN-002: rc          — smoke test against deployed environment (Railway or local Docker)
 *   HARDEN-003: load        — optional load test (skip if not specified in NFR)
 *
 * Each phase writes a bound prompt to docs/session-prompts/HARDEN-NNN.md.
 * The prompt lists the active gates for that phase and what "done" means.
 *
 * Gated on: roadmap complete (docs/roadmap.md has no pending items).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";
// findNextRoadmapItem no longer used here — phase-aware check is local
import { getActiveProjectGates } from "../shared/project-gates.js";
import type { ForgeCraftConfig, ProjectGate } from "../shared/types.js";

// ── Types ────────────────────────────────────────────────────────────

export interface StartHardeningInput {
  readonly project_dir: string;
  /** Override deployment URL for smoke test. Default: read from forgecraft.yaml or 'http://localhost:3000' */
  readonly deployment_url?: string;
  /** Skip load test phase (HARDEN-003). Default: true (skip if not in NFR). */
  readonly skip_load_test?: boolean;
}

export interface HardeningPhase {
  readonly id: string;
  readonly name: string;
  readonly gates: string[];
  readonly promptFile: string;
  readonly skipped: boolean;
}

export interface StartHardeningResult {
  readonly phases: HardeningPhase[];
  readonly blockedReason?: string;
  readonly ready: boolean;
}

// ── Default phase gates ──────────────────────────────────────────────

const DEFAULT_PRERELEASE_GATES: ReadonlyArray<string> = [
  "Run `npm audit --audit-level=high` — zero high CVEs",
  "Run mutation testing — score ≥ 80%",
  "Run linter with zero errors",
];

const DEFAULT_RC_GATES: ReadonlyArray<string> = [
  "Deploy to staging environment and run `GET /health` smoke check",
  "Run Playwright smoke test (2-3 critical user journeys)",
];

const DEFAULT_LOAD_GATES: ReadonlyArray<string> = [
  "Run k6 load test — p99 < 500ms at 10 concurrent users for 30s",
];

// ── Config helpers ───────────────────────────────────────────────────

/**
 * Read project classification tags from forgecraft.yaml.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of tag strings, or empty array if none found
 */
function readProjectTags(projectDir: string): ReadonlyArray<string> {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return [];
  try {
    const config = yamlLoad(readFileSync(yamlPath, "utf-8")) as ForgeCraftConfig;
    return Array.isArray(config?.tags) ? config.tags : [];
  } catch {
    return [];
  }
}

/**
 * Read project name from forgecraft.yaml or fall back to directory basename.
 *
 * @param projectDir - Absolute path to project root
 * @returns Human-readable project name
 */
function readProjectName(projectDir: string): string {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const config = yamlLoad(
        readFileSync(yamlPath, "utf-8"),
      ) as ForgeCraftConfig;
      if (config?.projectName) return config.projectName;
    } catch {
      // Fall through
    }
  }
  return projectDir.split(/[\\/]/).pop() ?? "project";
}

/**
 * Read deployment URL from forgecraft.yaml deployment config.
 *
 * @param projectDir - Absolute path to project root
 * @returns Deployment URL or undefined
 */
function readDeploymentUrl(projectDir: string): string | undefined {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return undefined;
  try {
    const config = yamlLoad(
      readFileSync(yamlPath, "utf-8"),
    ) as ForgeCraftConfig;
    const envs = config?.deployment?.environments;
    if (!envs) return undefined;
    const staging =
      envs["staging"] ?? envs["production"] ?? Object.values(envs)[0];
    return staging?.url;
  } catch {
    return undefined;
  }
}

/**
 * Extract use-case titles from docs/use-cases.md (UC-001, UC-002, …).
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of up to 3 use-case titles
 */
function readUseCaseTitles(projectDir: string): ReadonlyArray<string> {
  const paths = ["docs/use-cases.md", "docs/UseCases.md"];
  for (const rel of paths) {
    const full = join(projectDir, rel);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8");
    const titles: string[] = [];
    for (const match of content.matchAll(/##\s*(UC-\d+[^#\n]*)/g)) {
      titles.push(match[1]!.trim());
      if (titles.length >= 3) break;
    }
    if (titles.length > 0) return titles;
  }
  return [];
}

// ── Gate grouping ────────────────────────────────────────────────────

/** Phase names matching the ProjectGate.phase union */
const PRERELEASE_PHASES = new Set(["pre-release"]);
const RC_PHASES = new Set(["rc"]);
const LOAD_PHASES = new Set(["deployment", "continuous"]);

/**
 * Filter active project gates by phase group and return their descriptions.
 *
 * @param gates - All active project gates
 * @param phaseSet - Set of phase names to include
 * @returns Array of gate title + passCriterion strings
 */
function filterGateDescriptions(
  gates: ReadonlyArray<ProjectGate>,
  phaseSet: ReadonlySet<string>,
): string[] {
  return gates
    .filter((g) => phaseSet.has(g.phase))
    .map((g) => `${g.title} — ${g.passCriterion}`);
}

// ── Prompt builders ──────────────────────────────────────────────────

/**
 * Build the HARDEN-001 (pre-release) prompt content.
 *
 * @param projectName - Human-readable project name
 * @param projectGates - Gates specific to the pre-release phase
 * @returns Markdown prompt string
 */
function buildPreReleasePrompt(
  projectName: string,
  projectGates: ReadonlyArray<string>,
): string {
  const gateLines =
    projectGates.length > 0
      ? projectGates.map((g) => `- [ ] ${g}`).join("\n")
      : "_No project-specific pre-release gates configured._";

  return [
    `# Hardening Session: Pre-Release Gate — ${projectName}`,
    "",
    "## Scope",
    "Run all pre-release quality gates before promoting to release candidate.",
    "This session does NOT write new features — it verifies the existing implementation is production-ready.",
    "",
    "## Gates to Pass (pre-release phase)",
    "",
    "### Security",
    "- [ ] `npm audit --audit-level=high` — must exit 0 (zero high/critical CVEs)",
    '- [ ] Check for hardcoded secrets: `git diff main..HEAD | grep -i "password\\|secret\\|token\\|key" | grep "^+"`',
    "- [ ] Dependency governance: no packages with known CVE chains",
    "",
    "### Quality",
    "- [ ] Mutation testing score ≥ 80% (`npx stryker run`)",
    "- [ ] Linter: zero errors (`npm run lint`)",
    "- [ ] Type check: zero errors (`npx tsc --noEmit`)",
    "",
    "### Project-Specific Gates",
    gateLines,
    "",
    "## Acceptance Criteria",
    "- [ ] All commands above exit 0",
    "- [ ] No new anti-patterns introduced since last commit",
    "- [ ] CHANGELOG.md updated with final pre-release entry",
    "",
    "## Next",
    "When complete: run `close_cycle` to check cascade, then proceed to HARDEN-002 (RC smoke test).",
    "",
  ].join("\n");
}

/**
 * Build the Playwright APIRequestContext smoke test scaffold for API-tagged projects.
 *
 * @param deploymentUrl - Target deployment URL
 * @param useCaseTitles - Use-case titles for labelling test stubs
 * @returns Markdown block with playwright.smoke.config.ts and api.smoke.ts stubs
 */
function buildApiPlaywrightScaffold(
  deploymentUrl: string,
  useCaseTitles: ReadonlyArray<string>,
): string {
  const uc1Label =
    useCaseTitles[0] ?? "Critical user journey 1 (see docs/use-cases.md)";
  const uc2Label =
    useCaseTitles[1] ?? "Critical user journey 2 (see docs/use-cases.md)";

  return [
    "## Playwright API Smoke Tests",
    "",
    "This project is tagged `API`. Run smoke tests using Playwright's `APIRequestContext`",
    "(no browser required). Create these files if they don't exist:",
    "",
    "### playwright.smoke.config.ts",
    "```typescript",
    "import { defineConfig } from '@playwright/test';",
    "export default defineConfig({",
    "  testMatch: '**/*.smoke.ts',",
    "  retries: 1,",
    "  timeout: 15_000,",
    "  use: {",
    `    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? '${deploymentUrl}',`,
    "  },",
    "});",
    "```",
    "",
    "### tests/smoke/api.smoke.ts",
    "```typescript",
    "import { test, expect } from '@playwright/test';",
    "",
    "test('health check returns 200', async ({ request }) => {",
    "  const res = await request.get('/health');",
    "  expect(res.status()).toBe(200);",
    "});",
    "",
    `test('${uc1Label}', async ({ request }) => {`,
    "  // TODO: implement smoke assertion for this use case",
    "  const res = await request.get('/health');",
    "  expect(res.ok()).toBe(true);",
    "});",
    "",
    `test('${uc2Label}', async ({ request }) => {`,
    "  // TODO: implement smoke assertion for this use case",
    "  const res = await request.get('/health');",
    "  expect(res.ok()).toBe(true);",
    "});",
    "```",
    "",
    "Run with: `npx playwright test --config playwright.smoke.config.ts`",
    "",
  ].join("\n");
}

/**
 * Build the HARDEN-002 (rc smoke test) prompt content.
 *
 * @param projectName - Human-readable project name
 * @param deploymentUrl - Target deployment URL
 * @param useCaseTitles - Titles of use cases for smoke test steps
 * @param projectGates - Gates specific to the rc phase
 * @param tags - Project classification tags (used to select smoke strategy)
 * @returns Markdown prompt string
 */
function buildRcPrompt(
  projectName: string,
  deploymentUrl: string,
  useCaseTitles: ReadonlyArray<string>,
  projectGates: ReadonlyArray<string>,
  tags: ReadonlyArray<string> = [],
): string {
  const uc1 =
    useCaseTitles[0] ?? "Critical user journey 1 (see docs/use-cases.md)";
  const uc2 =
    useCaseTitles[1] ?? "Critical user journey 2 (see docs/use-cases.md)";

  const gateLines =
    projectGates.length > 0
      ? projectGates.map((g) => `- [ ] ${g}`).join("\n")
      : "_No project-specific RC gates configured._";

  const isApi = tags.includes("API");
  const playwrightSection = isApi
    ? buildApiPlaywrightScaffold(deploymentUrl, useCaseTitles)
    : "";

  return [
    `# Hardening Session: Release Candidate Smoke Test — ${projectName}`,
    "",
    "## Scope",
    "Deploy to staging and verify the critical user journeys work end-to-end.",
    `Target environment: ${deploymentUrl}`,
    "",
    "## Deployment",
    "- [ ] Deploy: `railway up` (or `docker-compose up -d` for local)",
    `- [ ] Verify: \`curl ${deploymentUrl}/health\` returns 200`,
    "",
    ...(isApi ? [playwrightSection] : [
      "## Smoke Tests",
      "- [ ] Health check passes",
      `- [ ] Critical user journey 1: ${uc1}`,
      `- [ ] Critical user journey 2: ${uc2}`,
      "- [ ] No 5xx errors in logs after smoke run",
      "",
    ]),
    "### Project-Specific Gates",
    gateLines,
    "",
    "## Acceptance Criteria",
    "- [ ] All smoke tests pass",
    "- [ ] Error rate < 1% during smoke run",
    "- [ ] No data corruption (check DB state after run)",
    "",
    "## Next",
    "When complete: tag the release `git tag v{next} && git push origin v{next}`, then run `close_cycle`.",
    "",
  ].join("\n");
}

/**
 * Build the HARDEN-003 (load test) prompt content.
 *
 * @param projectName - Human-readable project name
 * @param deploymentUrl - Target deployment URL
 * @param projectGates - Gates specific to the load/deployment phase
 * @returns Markdown prompt string
 */
function buildLoadPrompt(
  projectName: string,
  deploymentUrl: string,
  projectGates: ReadonlyArray<string>,
): string {
  const gateLines =
    projectGates.length > 0
      ? projectGates.map((g) => `- [ ] ${g}`).join("\n")
      : "_No project-specific load gates configured._";

  return [
    `# Hardening Session: Load Test — ${projectName}`,
    "",
    "## Scope",
    "Run load tests against the release candidate to verify performance NFRs.",
    `Target environment: ${deploymentUrl}`,
    "",
    "## Load Test",
    "- [ ] Run k6 load test — p99 < 500ms at 10 concurrent users for 30s",
    "  ```bash",
    `  k6 run --vus 10 --duration 30s scripts/load-test.js --env BASE_URL=${deploymentUrl}`,
    "  ```",
    "- [ ] p99 latency ≤ 500ms",
    "- [ ] Error rate < 1%",
    "- [ ] No memory leaks observed in target process",
    "",
    "### Project-Specific Gates",
    gateLines,
    "",
    "## Acceptance Criteria",
    "- [ ] All load test thresholds pass",
    "- [ ] Results documented in docs/load-test-results.md",
    "",
    "## Next",
    "When complete: run `close_cycle` to finalize the release.",
    "",
  ].join("\n");
}

// ── Prompt file writer ───────────────────────────────────────────────

/**
 * Write a hardening prompt to docs/session-prompts/{id}.md.
 * Creates the directory if absent.
 *
 * @param projectDir - Absolute path to project root
 * @param id - Phase ID, e.g. "HARDEN-001"
 * @param content - Markdown content to write
 */
function writeHardeningPrompt(
  projectDir: string,
  id: string,
  content: string,
): void {
  const dir = join(projectDir, "docs", "session-prompts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), content, "utf-8");
}

// ── Main handler ─────────────────────────────────────────────────────

/**
 * Find pending roadmap items in the current active phase only.
 *
 * The "current phase" is the phase section (## Phase N: ...) that contains
 * at least one `done` item. If no phase has any done items yet, the first
 * phase is current. Future phases (no done items, come after current) are
 * ignored — their pending items do not block hardening.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of pending item IDs/titles in the current phase only
 */
function findPendingItemsInCurrentPhase(
  projectDir: string,
): ReadonlyArray<{ readonly id: string; readonly title: string }> {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return [];

  const content = readFileSync(roadmapPath, "utf-8");

  // Split into phase sections by markdown h2 headings
  const sections = content.split(/(?=^## Phase \d+)/m).filter(Boolean);
  if (sections.length === 0) {
    // No phase headers — treat the whole file as one phase
    return extractPendingItems(content);
  }

  // Find the current phase: the last phase with at least one done item
  let currentSection: string | null = null;
  for (const section of sections) {
    if (/\|\s*done\s*\|/i.test(section)) {
      currentSection = section;
    }
  }
  // If no phase has done items yet, use the first phase
  if (!currentSection) {
    currentSection = sections[0] ?? "";
  }

  return extractPendingItems(currentSection);
}

/**
 * Extract all pending RM-NNN items from a roadmap section text.
 *
 * @param text - Roadmap text (may be a single phase section)
 * @returns Array of pending items with id and title
 */
function extractPendingItems(
  text: string,
): ReadonlyArray<{ readonly id: string; readonly title: string }> {
  const results: Array<{ id: string; title: string }> = [];
  const rowRegex = /\|\s*(RM-\d+)\s*\|\s*([^|]+)\s*\|\s*pending\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(text)) !== null) {
    results.push({ id: match[1]!.trim(), title: match[2]!.trim() });
  }
  return results;
}

/**
 * Generate hardening session prompts for the three hardening phases.
 *
 * @param input - Project directory, optional deployment URL, optional skip_load_test flag
 * @returns Structured result with phase details or a blocked reason
 */
export function startHardening(
  input: StartHardeningInput,
): StartHardeningResult {
  const {
    project_dir: projectDir,
    deployment_url,
    skip_load_test = true,
  } = input;

  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) {
    return {
      phases: [],
      blockedReason: "No roadmap found. Run generate_roadmap first.",
      ready: false,
    };
  }

  // Only block on pending items in the current phase — not future phases.
  // Current phase = the phase that contains at least one done item, or
  // the first phase if nothing is done yet.
  const pendingInCurrentPhase = findPendingItemsInCurrentPhase(projectDir);
  if (pendingInCurrentPhase.length > 0) {
    const ids = pendingInCurrentPhase.map((i) => i.id).join(", ");
    return {
      phases: [],
      blockedReason: `Current phase has pending items: ${ids}. Complete them before hardening.`,
      ready: false,
    };
  }

  const projectName = readProjectName(projectDir);
  const resolvedUrl =
    deployment_url ?? readDeploymentUrl(projectDir) ?? "http://localhost:3000";
  const useCaseTitles = readUseCaseTitles(projectDir);
  const activeGates = getActiveProjectGates(projectDir);
  const projectTags = readProjectTags(projectDir);

  const preReleaseGates = filterGateDescriptions(
    activeGates,
    PRERELEASE_PHASES,
  );
  const rcGates = filterGateDescriptions(activeGates, RC_PHASES);
  const loadGates = filterGateDescriptions(activeGates, LOAD_PHASES);

  const phases: HardeningPhase[] = [];

  // HARDEN-001: pre-release
  const preReleasePrompt = buildPreReleasePrompt(projectName, preReleaseGates);
  writeHardeningPrompt(projectDir, "HARDEN-001", preReleasePrompt);
  phases.push({
    id: "HARDEN-001",
    name: "pre-release",
    gates: [...DEFAULT_PRERELEASE_GATES, ...preReleaseGates],
    promptFile: "docs/session-prompts/HARDEN-001.md",
    skipped: false,
  });

  // HARDEN-002: rc smoke test
  const rcPrompt = buildRcPrompt(
    projectName,
    resolvedUrl,
    useCaseTitles,
    rcGates,
    projectTags,
  );
  writeHardeningPrompt(projectDir, "HARDEN-002", rcPrompt);
  phases.push({
    id: "HARDEN-002",
    name: "rc",
    gates: [...DEFAULT_RC_GATES, ...rcGates],
    promptFile: "docs/session-prompts/HARDEN-002.md",
    skipped: false,
  });

  // HARDEN-003: load test (optional)
  const hasLoadGates = loadGates.length > 0;
  const skipLoad = skip_load_test && !hasLoadGates;
  if (!skipLoad) {
    const loadPrompt = buildLoadPrompt(projectName, resolvedUrl, loadGates);
    writeHardeningPrompt(projectDir, "HARDEN-003", loadPrompt);
  }
  phases.push({
    id: "HARDEN-003",
    name: "load",
    gates: [...DEFAULT_LOAD_GATES, ...loadGates],
    promptFile: "docs/session-prompts/HARDEN-003.md",
    skipped: skipLoad,
  });

  return { phases, ready: true };
}

/**
 * Format the StartHardeningResult as a plain-text MCP response.
 *
 * @param result - The structured start-hardening result
 * @returns Formatted markdown string
 */
export function formatStartHardeningResult(
  result: StartHardeningResult,
): string {
  if (!result.ready) {
    return `## Hardening Blocked\n\n${result.blockedReason ?? "Unknown reason."}`;
  }

  const lines: string[] = [
    "## 🛡️ Hardening Initiated",
    "",
    "Session prompts written for the following phases:",
    "",
  ];

  for (const phase of result.phases) {
    if (phase.skipped) {
      lines.push(`- **${phase.id}** (${phase.name}) — ⏭️ skipped`);
    } else {
      lines.push(`- **${phase.id}** (${phase.name}) — ${phase.promptFile}`);
    }
  }

  const active = result.phases.filter((p) => !p.skipped);
  if (active.length > 0) {
    lines.push(
      "",
      "## Next Steps",
      `1. Load \`${active[0]!.promptFile}\` and run the pre-release gates.`,
      "2. When HARDEN-001 passes, proceed to HARDEN-002 (RC smoke test).",
    );
    if (active.length > 2) {
      lines.push(
        "3. When HARDEN-002 passes, proceed to HARDEN-003 (load test).",
      );
    }
  }

  return lines.join("\n");
}

/**
 * MCP handler for the start_hardening action.
 *
 * @param args - Raw args from the MCP router (project_dir, deployment_url, skip_load_test)
 * @returns MCP-style tool result with text content
 */
export function startHardeningHandler(args: Record<string, unknown>): {
  content: Array<{ type: "text"; text: string }>;
} {
  const projectDir = args["project_dir"] as string | undefined;
  if (!projectDir) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Missing required parameter 'project_dir' for action 'start_hardening'.",
        },
      ],
    };
  }

  const deploymentUrl = args["deployment_url"] as string | undefined;
  const skipLoadTest = (args["skip_load_test"] as boolean | undefined) ?? true;

  const result = startHardening({
    project_dir: projectDir,
    deployment_url: deploymentUrl,
    skip_load_test: skipLoadTest,
  });

  return {
    content: [{ type: "text", text: formatStartHardeningResult(result) }],
  };
}
