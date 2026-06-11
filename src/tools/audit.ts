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
import { auditCntHealth } from "../shared/cnt-health.js";
import type { CntAuditResult } from "../shared/cnt-health.js";
import { auditHookInstallation } from "../shared/hook-installer.js";
import { loadUserOverrides } from "../registry/loader.js";
import { getEnvironmentActivatedGateIds } from "../shared/project-gates-helpers.js";
import { getRegistryGates } from "../shared/project-gates-folder.js";

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

  // Run CNT health audit
  const cntAudit = auditCntHealth(args.project_dir);

  // Run hook installation audit
  const hookAudit = auditHookInstallation(args.project_dir);

  // Combine results
  const allPassing = [
    ...completeness.passing,
    ...antiPatternWarnings.filter((w) => !w.severity),
  ];
  const allFailing = [
    ...completeness.failing,
    ...antiPatternViolations,
    ...antiPatternWarnings.filter((w) => w.severity),
  ];

  // Add CNT issues as completeness items when CNT is present
  if (cntAudit.hasCnt) {
    for (const issue of cntAudit.issues) {
      allFailing.push({
        check: "cnt_health",
        message: issue,
        severity: "warning" as const,
      });
    }
  }

  // Add hook installation issues — always checked (hooks are the Defended property)
  if (hookAudit.allInstalled) {
    allPassing.push({
      check: "hook_installation",
      message: `Git hooks installed (${hookAudit.installedGitHooks.join(", ")})`,
    });
  } else {
    for (const issue of hookAudit.issues) {
      allFailing.push({
        check: "hook_installation",
        message: issue,
        severity: "error" as const,
      });
    }
  }

  // Calculate score
  const totalChecks = allPassing.length + allFailing.length;
  const score =
    totalChecks > 0 ? Math.round((allPassing.length / totalChecks) * 100) : 0;

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
    score >= 90
      ? "A"
      : score >= 80
        ? "B"
        : score >= 70
          ? "C"
          : score >= 60
            ? "D"
            : "F";
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
        const icon =
          f.severity === "error"
            ? "🔴"
            : f.severity === "warning"
              ? "🟡"
              : "🔵";
        return `- ${icon} **${f.check}**: ${f.message}`;
      })
      .join("\n");
    text += "\n\n";
  }

  if (result.recommendations.length > 0) {
    text += `## Recommendations\n`;
    text += result.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
    text += "\n\n";
  }

  if (cntAudit.hasCnt) {
    text += formatCntAuditSection(cntAudit);
  }

  // Environment-activated gates — surface which registry gates the declared
  // deployment environments pull in. This makes getEnvironmentActivatedGateIds
  // observable: declaring externallyAccessible/containsPii/prd now visibly
  // tightens the gate set the project is held to.
  const envSection = formatEnvironmentGatesSection(args.project_dir);
  if (envSection) text += envSection;

  return { content: [{ type: "text", text }] };
}

/**
 * Format the environment-activated gate section.
 *
 * Reads deployment.environments from forgecraft.yaml, computes the gate IDs
 * those environment properties activate, and lists them with their titles
 * (resolved from the installed registry when available).
 *
 * @param projectDir - Absolute path to the project root
 * @returns Markdown section, or null when no environments are declared
 */
export function formatEnvironmentGatesSection(projectDir: string): string | null {
  const config = loadUserOverrides(projectDir);
  const environments = config?.deployment?.environments;
  if (!environments || Object.keys(environments).length === 0) return null;

  const activatedIds = getEnvironmentActivatedGateIds(environments);
  if (activatedIds.length === 0) return null;

  // Resolve gate titles from the installed registry (best-effort).
  const registry = getRegistryGates(projectDir);
  const titleById = new Map(registry.map((g) => [g.id, g.title]));
  const installedIds = new Set(registry.map((g) => g.id));

  let text = `\n## Environment-Activated Gates\n`;
  text += `Declared environments: ${Object.keys(environments)
    .map((n) => `\`${n}\``)
    .join(", ")}\n\n`;
  text += `These gates apply because of the declared environment properties:\n`;
  for (const id of activatedIds) {
    const title = titleById.get(id);
    const installed = installedIds.has(id) ? "" : " — ⚠️ not installed in .forgecraft/gates/registry/";
    text += `- \`${id}\`${title ? ` — ${title}` : ""}${installed}\n`;
  }
  text += "\n";
  return text;
}

/**
 * Generate actionable recommendations from failing checks.
 */
function generateRecommendations(failing: AuditResult["failing"]): string[] {
  const recommendations: string[] = [];

  const failingChecks = new Set(failing.map((f) => f.check));

  if (failingChecks.has("instruction_file_exists")) {
    recommendations.push(
      "Run `npx forgecraft-mcp generate .` to create instruction files for your AI assistant.",
    );
  }

  if (
    failingChecks.has("status_md_exists") ||
    failingChecks.has("status_md_current")
  ) {
    recommendations.push(
      "Create/update Status.md — update it at the end of each coding session.",
    );
  }

  if (failingChecks.has("hooks_installed")) {
    recommendations.push(
      "Run `npx forgecraft-mcp scaffold .` to generate project structure and install quality gate hooks.",
    );
  }

  if (
    failingChecks.has("hardcoded_url") ||
    failingChecks.has("hardcoded_credential")
  ) {
    recommendations.push(
      "Move hardcoded values to config module or environment variables.",
    );
  }

  if (failingChecks.has("mock_in_source")) {
    recommendations.push(
      "Remove mock/stub/fake data from production source files. Move to test fixtures.",
    );
  }

  if (
    failingChecks.has("prd_exists") ||
    failingChecks.has("tech_spec_exists")
  ) {
    recommendations.push(
      "Create project documentation in docs/ — PRD.md and TechSpec.md.",
    );
  }

  return recommendations;
}

/**
 * Format CNT health audit results as a markdown section.
 *
 * @param cntAudit - The CNT audit result
 * @returns Formatted markdown string
 */
function formatCntAuditSection(cntAudit: CntAuditResult): string {
  let text = `### CNT Health\n`;
  text += `**Score:** ${cntAudit.score}/100\n\n`;

  if (cntAudit.issues.length === 0 && cntAudit.leafViolations.length === 0) {
    text += "✅ All CNT structural constraints pass.\n";
    return text;
  }

  if (cntAudit.issues.length > 0) {
    text += "**Issues:**\n";
    text += cntAudit.issues.map((i) => `- 🟡 ${i}`).join("\n");
    text += "\n\n";
  }

  if (cntAudit.leafViolations.length > 0) {
    text += "**Leaf node violations (>30 lines):**\n";
    text += cntAudit.leafViolations
      .map((v) => `- ${v.file}: ${v.lines} lines`)
      .join("\n");
    text += "\n";
  }

  return text;
}
