/**
 * scaffold-cascade: Cascade decisions management and dry-run plan for scaffold_project.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { Tag, ForgeCraftConfig, CascadeDecision } from "../shared/types.js";
import type { composeTemplates } from "../registry/composer.js";
import { deriveDefaultCascadeDecisions } from "./cascade-defaults.js";

/** Canonical artifact path for each cascade step (for display). */
export const STEP_ARTIFACT_DISPLAY: Record<string, string> = {
  functional_spec: "PRD.md",
  architecture_diagrams: "c4-context.md",
  constitution: "CLAUDE.md",
  adrs: "docs/adrs/",
  behavioral_contracts: "use-cases.md",
};

/**
 * Write cascade.steps to forgecraft.yaml in the project directory.
 * Never overwrites existing decisions — only writes when cascade.steps is absent.
 *
 * @param projectDir - Absolute project root path
 * @param tags - Project tags used for deriving defaults
 * @param projectName - Human-readable project name
 * @param existingConfig - Already-loaded user config (avoids double-read)
 * @returns The cascade decisions that were written (or already existed)
 */
export function writeCascadeDecisions(
  projectDir: string,
  tags: readonly Tag[],
  projectName: string,
  existingConfig: ForgeCraftConfig | null,
): CascadeDecision[] {
  const yamlPath = join(projectDir, "forgecraft.yaml");

  const existing = existingConfig?.cascade?.steps;
  if (existing && existing.length > 0) {
    return existing as CascadeDecision[];
  }

  const decisions = deriveDefaultCascadeDecisions(tags, projectName);

  const configBase: Record<string, unknown> = existingConfig
    ? (existingConfig as unknown as Record<string, unknown>)
    : { projectName, tags: [...tags] };

  const updated = { ...configBase, cascade: { steps: decisions } };
  writeFileSync(yamlPath, yaml.dump(updated, { lineWidth: 120 }), "utf-8");

  return decisions;
}

/**
 * Render the Cascade Decisions (Step 0) section for the scaffold output.
 *
 * @param decisions - The cascade decisions to display
 * @returns Formatted Markdown section
 */
export function renderCascadeDecisionsSection(
  decisions: readonly CascadeDecision[],
): string {
  let text = `\n\n## Cascade Decisions (Step 0)\n\n`;
  text += `The following spec artifacts have been assessed for this project:\n\n`;

  for (const decision of decisions) {
    const icon = decision.required ? "✓" : "○";
    const artifact = STEP_ARTIFACT_DISPLAY[decision.step] ?? decision.step;
    const label = decision.required
      ? `required (${artifact})`
      : `optional — ${decision.rationale.split(".")[0]}`;
    text += `  ${icon} ${decision.step} — ${label}\n`;
  }

  text += `\nReview these decisions. To revise: use \`set_cascade_requirement\` or edit\n`;
  text += `forgecraft.yaml under \`cascade.steps\`. These decisions determine which\n`;
  text += `artifacts are gated before implementation can begin.\n`;
  return text;
}

/**
 * Build a dry-run plan without writing files.
 *
 * @param composed - Composed template result
 * @param tags - Project classification tags
 * @returns Formatted dry-run plan text
 */
export function buildDryRunPlan(
  composed: ReturnType<typeof composeTemplates>,
  tags: Tag[],
): string {
  let text = `# Scaffold Plan (Dry Run)\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n\n`;

  text += `## Directories to Create\n`;
  const dirs = composed.structureEntries.filter((e) => e.type === "directory");
  text += dirs.map((d) => `- \`${d.path}/\`${d.description ? ` — ${d.description}` : ""}`).join("\n");

  text += `\n\n## Files to Generate\n`;
  text += `- CLAUDE.md (~50-line sentinel)\n`;
  text += `- .claude/standards/*.md (domain files — ForgeCraft-managed)\n`;
  text += `- .claude/standards/project-specific.md (YOUR file — ForgeCraft never overwrites)\n`;
  text += `- Status.md\n`;
  text += `- docs/PRD.md (skeleton)\n`;
  text += `- docs/TechSpec.md (skeleton with ${composed.nfrBlocks.length} NFR sections)\n`;
  text += `- docs/adrs/README.md (ADR directory bootstrap — Auditable signal)\n`;
  text += `- .env.example\n`;
  text += `- .gitignore\n`;

  text += `\n## Hooks to Install (${composed.hooks.length})\n`;
  text += composed.hooks.map((h) => `- \`${h.filename}\` (${h.trigger}) — ${h.description}`).join("\n");

  if (composed.skills.length > 0) {
    text += `\n\n## Skills to Install (${composed.skills.length})\n`;
    text += composed.skills.map((s) => `- \`/project:${s.filename.replace(".md", "")}\` — ${s.description}`).join("\n");
  }

  text += `\n\n_Run again with dry_run=false to write files._`;
  return text;
}
