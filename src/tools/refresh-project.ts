/**
 * refresh_project tool handler.
 *
 * Re-analyzes an existing project that has forgecraft.yaml,
 * detects drift (new tags, changed scope), and proposes updates.
 * Can optionally apply updates to config and CLAUDE.md.
 */

import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import { ALL_TAGS, CONTENT_TIERS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, ContentTier, ForgeCraftConfig, OutputTarget } from "../shared/types.js";
import { analyzeProject } from "../analyzers/package-json.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile } from "../registry/renderer.js";
import { detectLanguage } from "../analyzers/language-detector.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/refresh-project");

/** Minimum confidence to suggest a new tag. */
const SUGGEST_THRESHOLD = 0.5;

// ── Schema ───────────────────────────────────────────────────────────

export const refreshProjectSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
  apply: z
    .boolean()
    .default(false)
    .describe("If true, apply recommended changes to forgecraft.yaml and CLAUDE.md."),
  tier: z
    .enum(CONTENT_TIERS as unknown as [string, ...string[]])
    .optional()
    .describe("Override tier level. If omitted, uses current config value."),
  add_tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Explicitly add these tags during refresh."),
  remove_tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Explicitly remove these tags during refresh."),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .optional()
    .describe("Override output targets. If omitted, uses current config value or defaults to ['claude']."),
});

// ── Types ────────────────────────────────────────────────────────────

interface DriftReport {
  readonly currentTags: Tag[];
  readonly newTagSuggestions: Array<{ tag: Tag; confidence: number; evidence: string[] }>;
  readonly droppedTagCandidates: Tag[];
  readonly completenessGaps: string[];
  readonly completenessFixed: string[];
  readonly tierChange: { from: ContentTier; to: ContentTier } | null;
  readonly blockCountDelta: { before: number; after: number };
}

// ── Handler ──────────────────────────────────────────────────────────

export async function refreshProjectHandler(
  args: z.infer<typeof refreshProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = args.project_dir;

  logger.info("Refresh project starting", { projectDir, apply: args.apply });

  // ── Step 1: Load current config ────────────────────────────────
  const existingConfig = loadUserOverrides(projectDir);
  if (!existingConfig) {
    return {
      content: [{
        type: "text",
        text: buildNoConfigOutput(projectDir),
      }],
    };
  }

  // ── Step 2: Re-analyze project ─────────────────────────────────
  const drift = analyzeDrift(projectDir, existingConfig, args);

  // ── Step 3: Build updated config ───────────────────────────────
  const updatedTags = computeUpdatedTags(
    drift.currentTags,
    drift.newTagSuggestions,
    args.add_tags as Tag[] | undefined,
    args.remove_tags as Tag[] | undefined,
  );
  const updatedTier = args.tier ?? existingConfig.tier ?? "recommended";

  const updatedConfig: ForgeCraftConfig = {
    ...existingConfig,
    tags: updatedTags,
    tier: updatedTier as ContentTier,
  };

  // ── Step 4: Compose with updated config ────────────────────────
  const allTemplates = await loadAllTemplatesWithExtras(
    undefined,
    updatedConfig.templateDirs,
  );
  const composed = composeTemplates(updatedTags, allTemplates, { config: updatedConfig });

  // ── Step 5: Apply or preview ───────────────────────────────────
  if (!args.apply) {
    return {
      content: [{
        type: "text",
        text: buildPreviewOutput(drift, updatedTags, updatedConfig, composed, updatedTier as ContentTier),
      }],
    };
  }

  // Write updated config
  const configYaml = yaml.dump(updatedConfig, { lineWidth: 100, noRefs: true });
  writeFileSync(join(projectDir, "forgecraft.yaml"), configYaml, "utf-8");

  // Regenerate instruction files for all targets
  const outputTargets = (args.output_targets ?? updatedConfig.outputTargets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];
  const context = {
    projectName: updatedConfig.projectName ?? inferProjectName(projectDir),
    language: detectLanguage(projectDir),
    tags: updatedTags,
  };

  for (const target of outputTargets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];
    const content = renderInstructionFile(composed.instructionBlocks, context, target);
    const outputPath = targetConfig.directory
      ? join(projectDir, targetConfig.directory, targetConfig.filename)
      : join(projectDir, targetConfig.filename);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content, "utf-8");
  }

  return {
    content: [{
      type: "text",
      text: buildAppliedOutput(drift, updatedTags, updatedConfig, composed, updatedTier as ContentTier),
    }],
  };
}

// ── Drift Analysis ───────────────────────────────────────────────────

/**
 * Analyze how the project has drifted from its current config.
 */
function analyzeDrift(
  projectDir: string,
  config: ForgeCraftConfig,
  args: z.infer<typeof refreshProjectSchema>,
): DriftReport {
  const currentTags: Tag[] = config.tags ?? ["UNIVERSAL"];
  const currentTier: ContentTier = (config.tier ?? "recommended") as ContentTier;
  const requestedTier = (args.tier ?? currentTier) as ContentTier;

  // Re-detect tags from code
  const detections = analyzeProject(projectDir);
  const newTagSuggestions: Array<{ tag: Tag; confidence: number; evidence: string[] }> = [];
  const detectedTagSet = new Set<Tag>();

  for (const d of detections) {
    detectedTagSet.add(d.tag);
    if (d.confidence >= SUGGEST_THRESHOLD && !currentTags.includes(d.tag)) {
      newTagSuggestions.push({ tag: d.tag, confidence: d.confidence, evidence: d.evidence });
    }
  }

  // Tags in config that code analysis no longer supports
  const droppedTagCandidates = currentTags.filter(
    (t) => t !== "UNIVERSAL" && !detectedTagSet.has(t),
  );

  // Completeness re-check
  const completeness = checkCompleteness(projectDir, currentTags);
  const completenessGaps = completeness.failing.map((f) => f.check);
  const completenessFixed = completeness.passing.map((p) => p.check);

  // Tier change
  const tierChange = requestedTier !== currentTier
    ? { from: currentTier, to: requestedTier }
    : null;

  // Block count comparison (before vs after)
  const allTemplates = loadAllTemplatesWithExtras(undefined, config.templateDirs);
  const beforeComposed = composeTemplates(currentTags, allTemplates, { config });
  const proposedTags = computeUpdatedTags(
    currentTags,
    newTagSuggestions,
    args.add_tags as Tag[] | undefined,
    args.remove_tags as Tag[] | undefined,
  );
  const afterConfig = { ...config, tags: proposedTags, tier: requestedTier };
  const afterComposed = composeTemplates(proposedTags, allTemplates, { config: afterConfig });

  return {
    currentTags,
    newTagSuggestions,
    droppedTagCandidates,
    completenessGaps,
    completenessFixed,
    tierChange,
    blockCountDelta: {
      before: beforeComposed.claudeMdBlocks.length,
      after: afterComposed.claudeMdBlocks.length,
    },
  };
}

// ── Tag Computation ──────────────────────────────────────────────────

/**
 * Compute the updated tag set from current tags, suggestions, and explicit adds/removes.
 */
function computeUpdatedTags(
  currentTags: Tag[],
  suggestions: Array<{ tag: Tag; confidence: number }>,
  addTags?: Tag[],
  removeTags?: Tag[],
): Tag[] {
  const tagSet = new Set<Tag>(currentTags);

  // Add high-confidence suggestions
  for (const s of suggestions) {
    if (s.confidence >= 0.6) {
      tagSet.add(s.tag);
    }
  }

  // Explicit adds
  if (addTags) {
    for (const t of addTags) {
      tagSet.add(t);
    }
  }

  // Explicit removes (never remove UNIVERSAL)
  if (removeTags) {
    for (const t of removeTags) {
      if (t !== "UNIVERSAL") {
        tagSet.delete(t);
      }
    }
  }

  // Ensure UNIVERSAL
  tagSet.add("UNIVERSAL");

  return Array.from(tagSet);
}

// ── Output Formatting ────────────────────────────────────────────────

/**
 * Infer project name from directory path.
 */
function inferProjectName(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

/**
 * Output when no forgecraft.yaml exists.
 */
function buildNoConfigOutput(projectDir: string): string {
  return (
    `# No Configuration Found\n\n` +
    `No forgecraft.yaml or .forgecraft.json found in \`${projectDir}\`.\n\n` +
    `Run \`setup_project\` first to initialize your project configuration.\n`
  );
}

/**
 * Build the preview (dry-run) output for proposed changes.
 */
function buildPreviewOutput(
  drift: DriftReport,
  updatedTags: Tag[],
  _config: ForgeCraftConfig,
  composed: ReturnType<typeof composeTemplates>,
  tier: ContentTier,
): string {
  let text = `# Refresh Preview\n\n`;
  text += `**Current Tags:** ${drift.currentTags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Proposed Tags:** ${updatedTags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Tier:** ${tier}\n\n`;

  // New tag suggestions
  if (drift.newTagSuggestions.length > 0) {
    text += `## New Tags Detected\n`;
    for (const s of drift.newTagSuggestions) {
      const marker = s.confidence >= 0.6 ? "✅ auto-add" : "💡 suggest";
      text += `- **[${s.tag}]** (${Math.round(s.confidence * 100)}%) — ${marker}: ${s.evidence.join(", ")}\n`;
    }
    text += "\n";
  }

  // Dropped tag candidates
  if (drift.droppedTagCandidates.length > 0) {
    text += `## Tags No Longer Detected\n`;
    text += `_These tags are in your config but not detected in code. Consider removing if no longer relevant._\n`;
    text += drift.droppedTagCandidates.map((t) => `- [${t}]`).join("\n");
    text += "\n\n";
  }

  // Tier change
  if (drift.tierChange) {
    text += `## Tier Change\n`;
    text += `${drift.tierChange.from} → ${drift.tierChange.to}\n\n`;
  }

  // Block delta
  text += `## Content Impact\n`;
  text += `- Instruction blocks: ${drift.blockCountDelta.before} → ${drift.blockCountDelta.after}\n`;
  text += `- Total available: ${composed.instructionBlocks.length} blocks, ${composed.nfrBlocks.length} NFRs, ${composed.hooks.length} hooks\n\n`;

  // Gaps
  if (drift.completenessGaps.length > 0) {
    text += `## Remaining Gaps\n`;
    text += drift.completenessGaps.map((g) => `- ${g}`).join("\n");
    text += "\n\n";
  }

  text += `_Run again with apply=true to write changes._`;
  return text;
}

/**
 * Build the output after applying changes.
 */
function buildAppliedOutput(
  drift: DriftReport,
  updatedTags: Tag[],
  config: ForgeCraftConfig,
  composed: ReturnType<typeof composeTemplates>,
  tier: ContentTier,
): string {
  const configYaml = yaml.dump(config, { lineWidth: 100, noRefs: true });

  let text = `# Project Refreshed\n\n`;
  text += `**Tags:** ${updatedTags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Tier:** ${tier}\n\n`;

  text += `## Changes Applied\n`;
  text += `- forgecraft.yaml — updated\n`;
  text += `- Instruction files — regenerated (${composed.instructionBlocks.length} blocks)\n\n`;

  if (drift.newTagSuggestions.length > 0) {
    const added = drift.newTagSuggestions.filter((s) => s.confidence >= 0.6);
    if (added.length > 0) {
      text += `## New Tags Added\n`;
      text += added.map((s) => `- [${s.tag}] — ${s.evidence.join(", ")}`).join("\n");
      text += "\n\n";
    }
  }

  text += `## Updated Config\n`;
  text += `\`\`\`yaml\n${configYaml}\`\`\`\n\n`;

  text += `⚠️ **Restart required** to pick up CLAUDE.md changes.`;
  return text;
}
