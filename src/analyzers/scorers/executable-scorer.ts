/**
 * Executable scorer: runtime evidence that generated output satisfies behavioral contracts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs } from "./scorer-utils.js";

/**
 * Score the Executable GS property.
 * 2 = tests passed + CI configured OR verification-state.json with passed steps.
 * 1 = tests passed locally but no CI or verification state.
 * 0 = tests failed OR no test infrastructure.
 */
export function scoreExecutable(projectDir: string, testsPassed: boolean): GsPropertyScore {
  if (!testsPassed) {
    return gs("executable", 0, [
      "Tests did not pass — implementation does not satisfy its behavioral contracts at runtime",
    ]);
  }

  const verificationState = join(projectDir, ".forgecraft", "verification-state.json");
  if (existsSync(verificationState)) {
    try {
      const raw = readFileSync(verificationState, "utf-8");
      const state = JSON.parse(raw) as {
        aggregate_s?: number;
        summary?: Array<{ passedSteps: number }>;
      };
      const hasPassedSteps = state.summary?.some((s) => s.passedSteps > 0) ?? false;
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
    ".github/workflows", ".gitlab-ci.yml", ".circleci/config.yml",
    "Jenkinsfile", ".travis.yml", "azure-pipelines.yml",
  ];
  const hasCi = ciPaths.some((p) => existsSync(join(projectDir, p)));

  if (hasCi) {
    return gs("executable", 2, [
      "Tests passed + CI pipeline configured (automated runtime execution evidence)",
    ]);
  }

  return gs("executable", 1, [
    "Tests passed locally but no CI configured and no verification-state.json",
    "Local pass is necessary but not sufficient for pre-release — add CI or record_verification steps",
  ]);
}
