/**
 * Prompt builder functions for the three hardening phases.
 *
 * All functions are pure string generators — no filesystem access.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Prompt builders ──────────────────────────────────────────────────

/**
 * Build the HARDEN-001 (pre-release) prompt content.
 *
 * @param projectName - Human-readable project name
 * @param projectGates - Gates specific to the pre-release phase
 * @returns Markdown prompt string
 */
export function buildPreReleasePrompt(
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
export function buildApiPlaywrightScaffold(
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
export function buildRcPrompt(
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
    ...(isApi
      ? [playwrightSection]
      : [
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
export function buildLoadPrompt(
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
export function writeHardeningPrompt(
  projectDir: string,
  id: string,
  content: string,
): void {
  const dir = join(projectDir, "docs", "session-prompts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), content, "utf-8");
}
