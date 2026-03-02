/**
 * audit_project tool handler.
 *
 * Scans a project against template standards and reports violations.
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag, AuditResult } from "../shared/types.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import { scanAntiPatterns } from "../analyzers/anti-pattern.js";

// ── Schema ───────────────────────────────────────────────────────────

export const auditProjectSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Active project tags to audit against."),
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
  include_anti_patterns: z
    .boolean()
    .default(true)
    .describe("Whether to scan source files for anti-patterns."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function auditProjectHandler(
  args: z.infer<typeof auditProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  // Run completeness checks
  const completeness = checkCompleteness(args.project_dir, tags);

  // Run anti-pattern scan
  let antiPatternViolations: typeof completeness.failing = [];
  let antiPatternWarnings: typeof completeness.passing = [];

  if (args.include_anti_patterns) {
    const antiPatterns = scanAntiPatterns(args.project_dir);
    antiPatternViolations = antiPatterns.violations;
    antiPatternWarnings = antiPatterns.warnings;
  }

  // Combine results
  const allPassing = [...completeness.passing, ...antiPatternWarnings.filter((w) => !w.severity)];
  const allFailing = [
    ...completeness.failing,
    ...antiPatternViolations,
    ...antiPatternWarnings.filter((w) => w.severity),
  ];

  // Calculate score
  const totalChecks = allPassing.length + allFailing.length;
  const score = totalChecks > 0 ? Math.round((allPassing.length / totalChecks) * 100) : 0;

  // Generate recommendations
  const recommendations = generateRecommendations(allFailing);

  const result: AuditResult = {
    score,
    passing: allPassing,
    failing: allFailing,
    recommendations,
  };

  // Format output
  let text = `# Project Audit Report\n\n`;
  text += `**Score:** ${result.score}/100\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n\n`;

  // Grade
  const grade =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  text += `**Grade:** ${grade}\n\n`;

  if (result.passing.length > 0) {
    text += `## Passing (${result.passing.length})\n`;
    text += result.passing.map((p) => `- ${p.message}`).join("\n");
    text += "\n\n";
  }

  if (result.failing.length > 0) {
    text += `## Failing (${result.failing.length})\n`;
    text += result.failing
      .map((f) => {
        const icon = f.severity === "error" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
        return `- ${icon} **${f.check}**: ${f.message}`;
      })
      .join("\n");
    text += "\n\n";
  }

  if (result.recommendations.length > 0) {
    text += `## Recommendations\n`;
    text += result.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
  }

  return { content: [{ type: "text", text }] };
}

/**
 * Generate actionable recommendations from failing checks.
 */
function generateRecommendations(
  failing: AuditResult["failing"],
): string[] {
  const recommendations: string[] = [];

  const failingChecks = new Set(failing.map((f) => f.check));

  if (failingChecks.has("instruction_file_exists")) {
    recommendations.push(
      "Run `forgecraft` with action='generate' to create instruction files for your AI assistant.",
    );
  }

  if (failingChecks.has("status_md_exists") || failingChecks.has("status_md_current")) {
    recommendations.push(
      "Create/update Status.md — update it at the end of each coding session.",
    );
  }

  if (failingChecks.has("hooks_installed")) {
    recommendations.push(
      "Run `forgecraft` with action='scaffold' or action='add_hook' to install quality gate hooks.",
    );
  }

  if (failingChecks.has("hardcoded_url") || failingChecks.has("hardcoded_credential")) {
    recommendations.push(
      "Move hardcoded values to config module or environment variables.",
    );
  }

  if (failingChecks.has("mock_in_source")) {
    recommendations.push(
      "Remove mock/stub/fake data from production source files. Move to test fixtures.",
    );
  }

  if (failingChecks.has("prd_exists") || failingChecks.has("tech_spec_exists")) {
    recommendations.push(
      "Create project documentation in docs/ — PRD.md and TechSpec.md.",
    );
  }

  return recommendations;
}
