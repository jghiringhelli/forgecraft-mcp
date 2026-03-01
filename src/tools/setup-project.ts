/**
 * setup_project tool handler.
 *
 * Unified entry point that analyzes a project, detects tags,
 * loads/creates a forgecraft.yaml config, and orchestrates scaffolding.
 * Works for both new and existing projects.
 */

import { z } from "zod";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import { ALL_TAGS, CONTENT_TIERS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, ContentTier, ForgeCraftConfig, OutputTarget } from "../shared/types.js";
import { analyzeProject, analyzeDescription } from "../analyzers/package-json.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile } from "../registry/renderer.js";
import { detectLanguage } from "../analyzers/language-detector.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/setup-project");

/** Minimum confidence to auto-suggest a tag from code analysis. */
const AUTO_SUGGEST_THRESHOLD = 0.6;

// ── Schema ───────────────────────────────────────────────────────────

export const setupProjectSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
  project_name: z
    .string()
    .optional()
    .describe("Human-readable project name. Inferred from directory name if omitted."),
  description: z
    .string()
    .optional()
    .describe("Natural language project description for better tag detection."),
  tier: z
    .enum(CONTENT_TIERS as unknown as [string, ...string[]])
    .default("recommended")
    .describe(
      "Content depth: 'core' = essentials only, 'recommended' = core + best practices (default), 'optional' = everything including advanced patterns.",
    ),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Override detected tags. If omitted, tags are auto-detected from project analysis."),
  dry_run: z
    .boolean()
    .default(false)
    .describe("If true, return the setup plan and generated config without writing files."),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .default(["claude"])
    .describe("AI assistant targets to generate instruction files for. Options: claude, cursor, copilot, windsurf, cline, aider. Defaults to ['claude']."),
});

// ── Types ────────────────────────────────────────────────────────────

interface SetupAnalysis {
  readonly isNewProject: boolean;
  readonly detectedTags: Tag[];
  readonly tagEvidence: Record<string, string[]>;
  readonly existingConfig: ForgeCraftConfig | null;
  readonly completenessGaps: string[];
  readonly hasInstructionFile: boolean;
  readonly hasStatusMd: boolean;
  readonly hasHooks: boolean;
}

// ── Handler ──────────────────────────────────────────────────────────

export async function setupProjectHandler(
  args: z.infer<typeof setupProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = args.project_dir;
  const projectName = args.project_name ?? inferProjectName(projectDir);
  const tier = (args.tier ?? "recommended") as ContentTier;
  const outputTargets = (args.output_targets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];

  logger.info("Setup project starting", { projectDir, tier, dryRun: args.dry_run });

  // ── Step 1: Analyze project state ──────────────────────────────
  const analysis = analyzeProjectState(projectDir, args.description);

  // ── Step 2: Determine final tags ───────────────────────────────
  const finalTags = determineTags(args.tags as Tag[] | undefined, analysis);

  // ── Step 3: Load or build config ───────────────────────────────
  const config = buildConfig(analysis.existingConfig, finalTags, tier, projectName);

  // ── Step 4: Load templates (with community dirs if configured) ─
  const allTemplates = await loadAllTemplatesWithExtras(
    undefined,
    config.templateDirs,
  );

  // ── Step 5: Compose with tier filtering ────────────────────────
  const composed = composeTemplates(finalTags, allTemplates, { config });

  // ── Step 6: Format response ────────────────────────────────────
  const configYaml = yaml.dump(config, { lineWidth: 100, noRefs: true });

  if (args.dry_run) {
    return { content: [{ type: "text", text: buildDryRunOutput(analysis, finalTags, composed, configYaml, tier, outputTargets) }] };
  }

  // ── Step 7: Write config file ──────────────────────────────────
  const configPath = join(projectDir, "forgecraft.yaml");
  writeFileSync(configPath, configYaml, "utf-8");

  // ── Step 8: Generate instruction files for all targets ─────────
  const context = detectProjectContext(projectDir, projectName, detectLanguage(projectDir), finalTags, args.description);
  const filesWritten: string[] = [];

  for (const target of outputTargets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];
    const outputPath = targetConfig.directory
      ? join(projectDir, targetConfig.directory, targetConfig.filename)
      : join(projectDir, targetConfig.filename);

    if (existsSync(outputPath)) {
      // Preserve existing instruction files
      continue;
    }

    const content = renderInstructionFile(composed.instructionBlocks, context, target);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content, "utf-8");
    filesWritten.push(`${targetConfig.directory ? targetConfig.directory + "/" : ""}${targetConfig.filename}`);
  }

  const output = buildSetupOutput(analysis, finalTags, composed, configYaml, tier, filesWritten, outputTargets);
  return { content: [{ type: "text", text: output }] };
}

// ── Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze the current state of a project directory.
 */
function analyzeProjectState(
  projectDir: string,
  description?: string,
): SetupAnalysis {
  const hasPkgJson = existsSync(join(projectDir, "package.json"));
  // Check for any known instruction file
  const hasInstructionFile =
    existsSync(join(projectDir, "CLAUDE.md")) ||
    existsSync(join(projectDir, ".cursorrules")) ||
    existsSync(join(projectDir, ".cursor", "rules")) ||
    existsSync(join(projectDir, ".github", "copilot-instructions.md")) ||
    existsSync(join(projectDir, ".windsurfrules")) ||
    existsSync(join(projectDir, ".clinerules")) ||
    existsSync(join(projectDir, "CONVENTIONS.md"));
  const hasStatusMd = existsSync(join(projectDir, "Status.md"));
  const hasHooks = existsSync(join(projectDir, ".claude", "hooks"));
  const hasSrcDir = existsSync(join(projectDir, "src"));
  const isNewProject = !hasPkgJson && !hasSrcDir;

  const detectedTags: Tag[] = ["UNIVERSAL"];
  const tagEvidence: Record<string, string[]> = {};

  // Code analysis
  if (!isNewProject) {
    const detections = analyzeProject(projectDir);
    for (const d of detections) {
      if (d.confidence >= AUTO_SUGGEST_THRESHOLD && !detectedTags.includes(d.tag)) {
        detectedTags.push(d.tag);
      }
      tagEvidence[d.tag] = d.evidence;
    }
  }

  // Description analysis
  if (description) {
    const detections = analyzeDescription(description);
    for (const d of detections) {
      if (d.confidence >= AUTO_SUGGEST_THRESHOLD && !detectedTags.includes(d.tag)) {
        detectedTags.push(d.tag);
      }
      if (!tagEvidence[d.tag]) {
        tagEvidence[d.tag] = d.evidence;
      }
    }
  }

  // Completeness gaps
  const completenessGaps: string[] = [];
  if (!isNewProject) {
    const completeness = checkCompleteness(projectDir, detectedTags);
    for (const fail of completeness.failing) {
      completenessGaps.push(fail.check);
    }
  }

  // Existing config
  const existingConfig = loadUserOverrides(projectDir);

  return {
    isNewProject,
    detectedTags,
    tagEvidence,
    existingConfig,
    completenessGaps,
    hasInstructionFile,
    hasStatusMd,
    hasHooks,
  };
}

// ── Tag Resolution ───────────────────────────────────────────────────

/**
 * Determine final tags from explicit override or analysis results.
 * Merges existing config tags with newly detected ones.
 */
function determineTags(
  explicitTags: Tag[] | undefined,
  analysis: SetupAnalysis,
): Tag[] {
  if (explicitTags && explicitTags.length > 0) {
    const tags = explicitTags.includes("UNIVERSAL")
      ? explicitTags
      : ["UNIVERSAL" as Tag, ...explicitTags];
    return tags;
  }

  // Merge: existing config tags + newly detected
  const merged = new Set<Tag>(analysis.detectedTags);
  if (analysis.existingConfig?.additionalTags) {
    for (const t of analysis.existingConfig.additionalTags) {
      merged.add(t);
    }
  }

  return Array.from(merged);
}

// ── Config Builder ───────────────────────────────────────────────────

/**
 * Build a ForgeCraftConfig from analysis results and user preferences.
 * Preserves existing config fields when present.
 */
function buildConfig(
  existing: ForgeCraftConfig | null,
  tags: Tag[],
  tier: ContentTier,
  projectName: string,
): ForgeCraftConfig {
  return {
    projectName: existing?.projectName ?? projectName,
    tags: tags,
    tier,
    templateDirs: existing?.templateDirs,
    include: existing?.include,
    exclude: existing?.exclude,
    variables: existing?.variables ?? {},
  };
}

// ── Output Formatting ────────────────────────────────────────────────

/**
 * Infer project name from the directory path.
 */
function inferProjectName(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

/**
 * Build the dry-run preview output.
 */
function buildDryRunOutput(
  analysis: SetupAnalysis,
  tags: Tag[],
  composed: ReturnType<typeof composeTemplates>,
  configYaml: string,
  tier: ContentTier,
  outputTargets: OutputTarget[],
): string {
  let text = `# Setup Plan (Dry Run)\n\n`;
  text += analysis.isNewProject
    ? `**Project Type:** New project\n`
    : `**Project Type:** Existing project\n`;
  text += `**Content Tier:** ${tier}\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Output Targets:** ${outputTargets.map((t) => OUTPUT_TARGET_CONFIGS[t].displayName).join(", ")}\n\n`;

  // Evidence
  if (Object.keys(analysis.tagEvidence).length > 0) {
    text += `## Tag Detection Evidence\n`;
    for (const [tag, evidence] of Object.entries(analysis.tagEvidence)) {
      text += `- **${tag}**: ${evidence.join(", ")}\n`;
    }
    text += "\n";
  }

  // Template summary
  text += `## What Would Be Generated\n`;
  text += `- Instruction blocks: ${composed.instructionBlocks.length}\n`;
  text += `- Structure entries: ${composed.structureEntries.length}\n`;
  text += `- NFR sections: ${composed.nfrBlocks.length}\n`;
  text += `- Hooks: ${composed.hooks.length}\n`;
  text += `- Review checklist blocks: ${composed.reviewBlocks.length}\n`;
  text += `- Output targets: ${outputTargets.map((t) => OUTPUT_TARGET_CONFIGS[t].displayName).join(", ")}\n\n`;

  // Tier breakdown
  text += `## Content by Tier\n`;
  const coreMd = composed.instructionBlocks.filter((b) => (b.tier ?? "core") === "core").length;
  const recMd = composed.instructionBlocks.filter((b) => b.tier === "recommended").length;
  const optMd = composed.instructionBlocks.filter((b) => b.tier === "optional").length;
  text += `- Instruction blocks: ${coreMd} core, ${recMd} recommended, ${optMd} optional\n`;

  const coreNfr = composed.nfrBlocks.filter((b) => (b.tier ?? "core") === "core").length;
  const recNfr = composed.nfrBlocks.filter((b) => b.tier === "recommended").length;
  const optNfr = composed.nfrBlocks.filter((b) => b.tier === "optional").length;
  text += `- NFRs: ${coreNfr} core, ${recNfr} recommended, ${optNfr} optional\n\n`;

  // Config preview
  text += `## Generated Config (forgecraft.yaml)\n`;
  text += `\`\`\`yaml\n${configYaml}\`\`\`\n\n`;

  // Gaps
  if (analysis.completenessGaps.length > 0) {
    text += `## Current Gaps\n`;
    text += analysis.completenessGaps.map((g) => `- ${g}`).join("\n");
    text += "\n\n";
  }

  text += `_Run again with dry_run=false to write forgecraft.yaml and generate files._`;
  return text;
}

/**
 * Build the final setup output after writing files.
 */
function buildSetupOutput(
  analysis: SetupAnalysis,
  tags: Tag[],
  composed: ReturnType<typeof composeTemplates>,
  configYaml: string,
  tier: ContentTier,
  filesWritten: string[],
  outputTargets: OutputTarget[],
): string {
  let text = `# Project Setup Complete\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Content Tier:** ${tier}\n`;
  text += `**Targets:** ${outputTargets.map((t) => OUTPUT_TARGET_CONFIGS[t].displayName).join(", ")}\n\n`;

  text += `## Files Written\n`;
  text += `- forgecraft.yaml — project configuration\n`;
  for (const f of filesWritten) {
    text += `- ${f} — created\n`;
  }
  if (filesWritten.length === 0) {
    text += `- (instruction files preserved — use generate_instructions with merge_with_existing to update)\n`;
  }
  text += "\n";

  text += `## Template Summary\n`;
  text += `- ${composed.instructionBlocks.length} instruction blocks applied\n`;
  text += `- ${composed.nfrBlocks.length} NFR sections available\n`;
  text += `- ${composed.hooks.length} hooks available\n`;
  text += `- ${composed.reviewBlocks.length} review checklist blocks available\n\n`;

  text += `## Config (forgecraft.yaml)\n`;
  text += `\`\`\`yaml\n${configYaml}\`\`\`\n\n`;

  // Next steps - adapt based on what exists
  text += `## Next Steps\n`;
  const steps: string[] = [];

  if (!analysis.hasHooks) {
    steps.push("Run `scaffold_project` to generate folder structure and hooks");
  }
  if (analysis.completenessGaps.includes("prd_exists")) {
    steps.push("Create docs/PRD.md with your project requirements");
  }
  steps.push("Adjust forgecraft.yaml to add/exclude specific content blocks");
  steps.push("Use `refresh_project` later if project scope changes");
  steps.push("Add more output targets in forgecraft.yaml (cursor, copilot, windsurf, cline, aider)");

  if (tier === "core") {
    steps.push("Upgrade tier to 'recommended' when ready for more patterns: edit forgecraft.yaml");
  }

  text += steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  text += `\n\n⚠️ **Restart may be required** to pick up instruction file changes.`;

  return text;
}
