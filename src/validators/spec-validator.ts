/**
 * Spec Validator — runs all registered artifact gates and reports results.
 *
 * The SpecValidator is the composition root for verification. It accepts a
 * set of GenerativeSpec artifacts and runs their gates against a project
 * directory, producing a structured pass/fail report.
 *
 * Design: pure function composition — the validator holds no state itself.
 * Each artifact owns its gates; the validator only orchestrates execution.
 */

import type { GenerativeSpec, VerificationResult } from "../core/index.js";

/** Result for a single artifact's full verification run. */
export interface ArtifactValidationResult {
  readonly specId: string;
  readonly specName: string;
  readonly passed: boolean;
  readonly gateResults: ReadonlyArray<{
    readonly gateId: string;
    readonly description: string;
    readonly exitCode: number;
    readonly message: string;
  }>;
  readonly verificationResults: ReadonlyArray<VerificationResult>;
}

/** Aggregate result for the full spec validation run. */
export interface ValidationReport {
  readonly timestamp: string;
  readonly projectDir: string;
  readonly allPassed: boolean;
  readonly artifactResults: ReadonlyArray<ArtifactValidationResult>;
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
  };
}

/**
 * Run all gates and verifications for a set of GenerativeSpec artifacts.
 *
 * @param specs - The registered spec artifacts to validate
 * @param projectDir - Root directory of the project under validation
 * @param targetPaths - Optional specific paths to verify (defaults to spec.covers)
 * @returns Structured validation report
 */
export async function validateSpecs(
  specs: ReadonlyArray<GenerativeSpec>,
  projectDir: string,
  targetPaths?: ReadonlyArray<string>,
): Promise<ValidationReport> {
  const artifactResults: ArtifactValidationResult[] = [];

  for (const spec of specs) {
    // Run quality gates
    const defenseResult = await spec.defend();

    // Run boundary verification for each target path
    const paths = targetPaths ?? [];
    const verificationResults: VerificationResult[] = [];
    for (const path of paths) {
      if (spec.isInScope(path)) {
        const results = await spec.verify(path);
        verificationResults.push(...results);
      }
    }

    const allGatesPassed = defenseResult.allPassed;
    const allVerificationsPassed = verificationResults.every((r) => r.passed);

    artifactResults.push({
      specId: spec.specId,
      specName: spec.name,
      passed: allGatesPassed && allVerificationsPassed,
      gateResults: defenseResult.results.map((r) => ({
        gateId: r.gate.id,
        description: r.gate.description,
        exitCode: r.exitCode,
        message: r.message,
      })),
      verificationResults,
    });
  }

  const passed = artifactResults.filter((r) => r.passed).length;
  const failed = artifactResults.length - passed;

  return {
    timestamp: new Date().toISOString(),
    projectDir,
    allPassed: failed === 0,
    artifactResults,
    summary: {
      total: artifactResults.length,
      passed,
      failed,
    },
  };
}

/**
 * Format a ValidationReport as a human-readable Markdown string.
 * Suitable for outputting in CI logs or MCP tool responses.
 *
 * @param report - The report to format
 * @returns Markdown-formatted validation summary
 */
export function formatValidationReport(report: ValidationReport): string {
  const icon = report.allPassed ? "✅" : "❌";
  const lines: string[] = [
    `# Spec Validation ${icon}`,
    ``,
    `**Project:** ${report.projectDir}`,
    `**Timestamp:** ${report.timestamp}`,
    `**Result:** ${report.summary.passed}/${report.summary.total} artifacts passed`,
    ``,
    `## Artifacts`,
  ];

  for (const artifact of report.artifactResults) {
    const aIcon = artifact.passed ? "✅" : "❌";
    lines.push(``, `### ${aIcon} ${artifact.specName}`);
    for (const gate of artifact.gateResults) {
      const gIcon = gate.exitCode === 0 ? "✅" : "❌";
      lines.push(`- ${gIcon} **${gate.gateId}**: ${gate.message}`);
    }
    for (const vr of artifact.verificationResults) {
      const vIcon = vr.passed ? "✅" : "❌";
      lines.push(`- ${vIcon} ${vr.criterion}${vr.detail ? `: ${vr.detail}` : ""}`);
    }
  }

  return lines.join("\n");
}
