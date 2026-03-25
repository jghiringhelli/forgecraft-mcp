/**
 * GS Property Scorer (§4.3).
 *
 * Orchestrator: scores a project against the seven GS properties defined in §4.3.
 * Each property scorer lives in scorers/ and is re-exported for backward compatibility.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import { listAllFiles } from "./folder-structure.js";
import type {
  GsPropertyScore,
  LayerViolation,
  MissingTestFile,
} from "../shared/types.js";
import {
  isSourceCodeFile,
  isTestOrFixtureFile,
  isConfigOrDeclaration,
  isRouteFile,
  collectDbViolations,
  stripExtension,
  buildExpectedTestPath,
  testFileExists,
} from "./scorers/scorer-utils.js";
import { scoreSelfDescribing } from "./scorers/self-describing-scorer.js";
import { scoreBounded } from "./scorers/bounded-scorer.js";
import { scoreVerifiable } from "./scorers/verifiable-scorer.js";
import { scoreDefended } from "./scorers/defended-scorer.js";
import { scoreAuditable } from "./scorers/auditable-scorer.js";
import { scoreComposable } from "./scorers/composable-scorer.js";
import { scoreExecutable } from "./scorers/executable-scorer.js";

const logger = createLogger("analyzers/gs-scorer");

/**
 * Score all seven GS properties for a project directory.
 *
 * @param projectDir - Absolute path to the project root
 * @param testsPassed - Whether the test suite passed (feeds Verifiable)
 * @param layerViolations - Pre-computed layer violations (feeds Bounded)
 * @param missingTestFiles - Pre-computed missing test files (feeds Verifiable)
 * @returns Array of scored GS properties in canonical §4.3 order (7 properties)
 */
export function scoreGsProperties(
  projectDir: string,
  testsPassed: boolean,
  layerViolations: LayerViolation[],
  missingTestFiles: MissingTestFile[],
): GsPropertyScore[] {
  logger.info("Scoring GS properties", { projectDir });

  const allFiles = listAllFiles(projectDir);

  return [
    scoreSelfDescribing(projectDir),
    scoreBounded(layerViolations),
    scoreVerifiable(testsPassed, missingTestFiles, allFiles),
    scoreDefended(projectDir),
    scoreAuditable(projectDir, allFiles),
    scoreComposable(projectDir, allFiles),
    scoreExecutable(projectDir, testsPassed),
  ];
}

/**
 * Find all direct-DB / ORM calls inside route and controller source files.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of layer violations with file path, line number, and snippet
 */
export function findDirectDbCallsInRoutes(projectDir: string): LayerViolation[] {
  const allFiles = listAllFiles(projectDir);
  const routeFiles = allFiles.filter(
    (f) => isRouteFile(f) && isSourceCodeFile(f) && !isTestOrFixtureFile(f),
  );
  const violations: LayerViolation[] = [];

  for (const relPath of routeFiles) {
    const fullPath = join(projectDir, relPath);
    if (!existsSync(fullPath)) continue;
    try {
      const lines = readFileSync(fullPath, "utf-8").split("\n");
      collectDbViolations(lines, relPath, violations);
    } catch {
      // Skip unreadable files silently
    }
  }

  logger.info("Layer violation scan complete", {
    routeFilesScanned: routeFiles.length,
    violations: violations.length,
  });

  return violations;
}

/**
 * For each non-test source file find whether a corresponding test file exists.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of source files that have no detectable test counterpart
 */
export function findMissingTestFiles(projectDir: string): MissingTestFile[] {
  const allFiles = listAllFiles(projectDir);
  const sourceFiles = allFiles.filter(
    (f) =>
      isSourceCodeFile(f) &&
      !isTestOrFixtureFile(f) &&
      !isConfigOrDeclaration(f),
  );

  const missing: MissingTestFile[] = [];

  for (const sourceFile of sourceFiles) {
    const base = stripExtension(basename(sourceFile));
    const expectedTestFile = buildExpectedTestPath(sourceFile, base);
    const hasTest = testFileExists(base, allFiles);
    if (!hasTest) {
      missing.push({ sourceFile, expectedTestFile });
    }
  }

  return missing;
}
