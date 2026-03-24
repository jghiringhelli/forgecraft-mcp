/**
 * Verifiable scorer: tests present, pass, and most source files have coverage.
 */

import type { GsPropertyScore, MissingTestFile } from "../../shared/types.js";
import { gs, isSourceCodeFile, isTestOrFixtureFile, isConfigOrDeclaration } from "./scorer-utils.js";

/**
 * Score the Verifiable GS property.
 * 2 = tests pass + ≤ 20% missing, 1 = tests exist (pass or fail) + > 20% missing, 0 = no tests.
 */
export function scoreVerifiable(
  testsPassed: boolean,
  missingTestFiles: MissingTestFile[],
  allFiles: string[],
): GsPropertyScore {
  const testFiles = allFiles.filter(isTestOrFixtureFile);

  if (testFiles.length === 0) {
    return gs("verifiable", 0, ["No test files found in project"]);
  }

  const sourceCount = allFiles.filter(
    (f) => isSourceCodeFile(f) && !isTestOrFixtureFile(f) && !isConfigOrDeclaration(f),
  ).length;

  const missingCount = missingTestFiles.length;
  const missingPct = sourceCount > 0 ? missingCount / sourceCount : 0;
  const coveredPct = Math.round((1 - missingPct) * 100);

  if (testsPassed && missingPct <= 0.2) {
    return gs("verifiable", 2, [
      `Tests passed — ${testFiles.length} test file(s) found`,
      `${coveredPct}% of source modules have test counterparts`,
    ]);
  }

  const evidence: string[] = [`${testFiles.length} test file(s) found`];
  if (!testsPassed) evidence.push("Test suite did not pass");
  if (missingPct > 0.2) {
    evidence.push(`${coveredPct}% of source modules have tests (target ≥ 80%)`);
    evidence.push(`${missingCount} module(s) without tests`);
  }

  return gs("verifiable", 1, evidence);
}
