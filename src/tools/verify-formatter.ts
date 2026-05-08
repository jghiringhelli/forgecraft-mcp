/**
 * Verify output formatter: converts a VerifyResult into a Markdown report.
 */

import type { VerifyResult, GsPropertyScore } from "../shared/types.js";

/**
 * Format the full verify result as a human-readable Markdown report.
 *
 * @param result - Completed verification result
 * @param threshold - Minimum score required to pass
 * @returns Formatted Markdown string
 */
export function formatReport(result: VerifyResult, threshold: number): string {
  const lines: string[] = [];

  const badge = result.overallPass ? "✅ PASS" : "❌ FAIL";
  const tierBadge = `Tier ${result.maturityTier.tier} — ${result.maturityTier.name}`;
  lines.push(`# ForgeCraft Verify — ${badge}`);
  lines.push("");
  lines.push(
    `**GS Maturity: ${tierBadge}** · ${result.maturityTier.description}`,
  );
  lines.push("");

  // Test suite section
  lines.push("## Test Suite");
  const testBadge = result.testSuite.passed ? "✅ PASS" : "❌ FAIL";
  const secs = (result.testSuite.durationMs / 1000).toFixed(1);
  lines.push(
    `**${testBadge}** exit code ${result.testSuite.exitCode} · ${secs}s · \`${result.testSuite.command}\``,
  );
  if (result.testSuite.output) {
    const truncated = truncateLines(result.testSuite.output, 30);
    lines.push("");
    lines.push("```");
    lines.push(truncated);
    lines.push("```");
  }
  lines.push("");

  // GS property scores
  lines.push("## §4.3 GS Property Scores");
  lines.push("");
  const maxScore = result.propertyScores.length * 2;
  lines.push(
    `**Total: ${result.totalScore}/${maxScore}** (pass threshold: ${threshold})`,
  );
  lines.push("");
  lines.push("| Property | Score | Evidence |");
  lines.push("|---|---|---|");
  for (const p of result.propertyScores) {
    const scoreCell = scoreEmoji(p.score) + ` ${p.score}/2`;
    const evidenceCell = p.evidence[0] ?? "";
    lines.push(`| ${formatPropertyName(p)} | ${scoreCell} | ${evidenceCell} |`);
    for (const e of p.evidence.slice(1)) {
      lines.push(`| | | ${e} |`);
    }
  }
  lines.push("");

  // Layer violations
  lines.push("## Bounded Violations — Direct DB Calls in Routes");
  if (result.layerViolations.length === 0) {
    lines.push("✅ None detected");
  } else {
    lines.push(`❌ ${result.layerViolations.length} violation(s):`);
    lines.push("");
    for (const v of result.layerViolations) {
      lines.push(
        `- \`${v.file}:${v.line}\` — \`${v.snippet.trim().slice(0, 100)}\``,
      );
    }
  }
  lines.push("");

  // Missing test files
  lines.push("## Verifiable Gaps — Source Modules Without Tests");
  if (result.missingTestFiles.length === 0) {
    lines.push("✅ All source modules have test counterparts");
  } else {
    lines.push(
      `⚠️  ${result.missingTestFiles.length} module(s) without tests:`,
    );
    lines.push("");
    for (const m of result.missingTestFiles.slice(0, 20)) {
      lines.push(`- \`${m.sourceFile}\` → expected \`${m.expectedTestFile}\``);
    }
    if (result.missingTestFiles.length > 20) {
      lines.push(`- … and ${result.missingTestFiles.length - 20} more`);
    }
  }
  lines.push("");

  // Tier progression
  const nextTierThreshold = [4, 7, 11, 14, 14];
  const currentTier = result.maturityTier.tier;
  if (currentTier < 5) {
    const next = nextTierThreshold[currentTier - 1]!;
    const gap = next - result.totalScore;
    const nextNames = ["Grounded", "Specified", "Verified", "Orchestrated"];
    lines.push(`## GS Maturity Progression`);
    lines.push(
      `Current: **Tier ${currentTier} — ${result.maturityTier.name}** · ${gap} point(s) to Tier ${currentTier + 1} — ${nextNames[currentTier - 1]}`,
    );
    lines.push("");
  }

  // Summary
  lines.push("---");
  const maxScoreSummary = result.propertyScores.length * 2;
  lines.push(
    `**Overall: ${result.overallPass ? "✅ PASS" : "❌ FAIL"}** · Score ${result.totalScore}/${maxScoreSummary} · Threshold ${threshold}/${maxScoreSummary} · **Tier ${currentTier} — ${result.maturityTier.name}**`,
  );

  return lines.join("\n");
}

/** Return emoji for a 0–2 score. */
function scoreEmoji(score: 0 | 1 | 2): string {
  return score === 2 ? "✅" : score === 1 ? "⚠️" : "❌";
}

/** Format property name with §4.3 label and title case. */
function formatPropertyName(p: GsPropertyScore): string {
  const label = p.property
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  return `**${label}**`;
}

/** Truncate output to a max number of lines, appending a truncation notice. */
function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [
    ...lines.slice(0, maxLines),
    `… (${lines.length - maxLines} more lines)`,
  ].join("\n");
}
