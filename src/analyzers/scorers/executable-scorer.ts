/**
 * Executable scorer: runtime evidence that generated output satisfies behavioral contracts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs } from "./scorer-utils.js";

/**
 * Read harness-run.json from .forgecraft/harness-run.json.
 * Returns null when file is missing or unparseable.
 */
function readHarnessRun(projectDir: string): {
  passed: number;
  failed: number;
  errors: number;
  notFound: number;
  results: Array<{ ucId: string; status: string; durationMs: number }>;
} | null {
  const runJsonPath = join(projectDir, ".forgecraft", "harness-run.json");
  if (!existsSync(runJsonPath)) return null;
  try {
    const raw = readFileSync(runJsonPath, "utf-8");
    return JSON.parse(raw) as {
      passed: number;
      failed: number;
      errors: number;
      notFound: number;
      results: Array<{ ucId: string; status: string; durationMs: number }>;
    };
  } catch {
    return null;
  }
}

/**
 * Count total use cases in docs/use-cases.md.
 * Returns 0 when file is missing or unparseable.
 */
function countUseCases(projectDir: string): number {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  if (!existsSync(useCasesPath)) return 0;
  try {
    const content = readFileSync(useCasesPath, "utf-8");
    const matches = content.match(/^##\s+UC-\d{3}:/gm);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Score the Executable GS property.
 * 2 = tests passed + CI configured OR verification-state.json with passed steps
 *   OR tests passed + harness-run.json with ≥1 PASS result AND L2 coverage ≥ 50%.
 * 1 = tests passed locally but no CI, no verification state, or harness exists but 0% passing.
 * 0 = tests failed OR no test infrastructure.
 */
export function scoreExecutable(
  projectDir: string,
  testsPassed: boolean,
): GsPropertyScore {
  if (!testsPassed) {
    return gs("executable", 0, [
      "Tests did not pass — implementation does not satisfy its behavioral contracts at runtime",
    ]);
  }

  const verificationState = join(
    projectDir,
    ".forgecraft",
    "verification-state.json",
  );
  if (existsSync(verificationState)) {
    try {
      const raw = readFileSync(verificationState, "utf-8");
      const state = JSON.parse(raw) as {
        aggregate_s?: number;
        summary?: Array<{ passedSteps: number }>;
      };
      const hasPassedSteps =
        state.summary?.some((s) => s.passedSteps > 0) ?? false;
      if (hasPassedSteps) {
        return gs("executable", 2, [
          "Tests passed + verification-state.json records accepted runtime steps",
          `Aggregate S: ${state.aggregate_s?.toFixed(2) ?? "unknown"}`,
        ]);
      }
    } catch {
      // Fall through
    }
  }

  const ciPaths = [
    ".github/workflows",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "Jenkinsfile",
    ".travis.yml",
    "azure-pipelines.yml",
  ];
  const hasCi = ciPaths.some((p) => existsSync(join(projectDir, p)));

  if (hasCi) {
    return gs("executable", 2, [
      "Tests passed + CI pipeline configured (automated runtime execution evidence)",
    ]);
  }

  // Harness evidence path
  const harnessRun = readHarnessRun(projectDir);
  if (harnessRun) {
    const totalUcs = countUseCases(projectDir);
    const l2Coverage = totalUcs > 0 ? harnessRun.passed / totalUcs : 0;
    const pct = Math.round(l2Coverage * 100);
    const evidenceLine =
      pct >= 100
        ? `Harness run: ${harnessRun.passed}/${totalUcs} UCs passing (100% L2 coverage) — behavioral contracts verified`
        : `Harness run: ${harnessRun.passed}/${totalUcs} UCs passing (${pct}% L2 coverage) — run more probes for full coverage`;

    if (harnessRun.passed >= 1 && l2Coverage >= 0.5) {
      return gs("executable", 2, [
        "Tests passed + harness execution evidence recorded",
        evidenceLine,
      ]);
    }

    // Harness exists but insufficient coverage
    return gs("executable", 1, [
      "Tests passed locally but harness coverage below 50% or 0 probes passing",
      evidenceLine,
    ]);
  }

  return gs("executable", 1, [
    "Tests passed locally but no CI configured and no verification-state.json",
    "Local pass is necessary but not sufficient for pre-release — add CI or record_verification steps",
    "No harness-run.json found — run run_harness to generate behavioral execution evidence",
  ]);
}
