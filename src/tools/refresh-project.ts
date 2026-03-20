/**
 * refresh_project tool handler.
 *
 * Re-analyzes an existing project that has forgecraft.yaml,
 * detects drift (new tags, changed scope), and proposes updates.
 * Can optionally apply updates to config and CLAUDE.md.
 */

import { z } from "zod";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import {
  ALL_TAGS,
  CONTENT_TIERS,
  ALL_OUTPUT_TARGETS,
  OUTPUT_TARGET_CONFIGS,
  DEFAULT_OUTPUT_TARGET,
} from "../shared/types.js";
import type {
  Tag,
  ContentTier,
  ForgeCraftConfig,
  OutputTarget,
} from "../shared/types.js";
import { analyzeProject } from "../analyzers/package-json.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import {
  loadAllTemplatesWithExtras,
  loadUserOverrides,
} from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile } from "../registry/renderer.js";
import { renderSentinelTree } from "../registry/sentinel-renderer.js";
import { writeInstructionFileWithMerge } from "../shared/filesystem.js";
import { detectLanguage } from "../analyzers/language-detector.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";
import { pullRegistryGates, formatRefreshResult } from "./registry-refresh.js";
import { detectCntDrift } from "../shared/cnt-health.js";
import type { CntDriftResult } from "../shared/cnt-health.js";

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
    .describe(
      "If true, apply recommended changes to forgecraft.yaml and CLAUDE.md.",
    ),
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
    .describe(
      "Override output targets. If omitted, uses current config value or defaults to ['claude'].",
    ),
  sentinel: z
    .boolean()
    .default(true)
    .describe(
      "If true (default), generate a sentinel CLAUDE.md + .claude/standards/ domain files. Set to false to regenerate the traditional monolithic CLAUDE.md.",
    ),
  release_phase: z
    .enum(["development", "pre-release", "release-candidate", "production"])
    .optional()
    .describe(
      "Override current release cycle phase. If omitted, uses value from forgecraft.yaml or defaults to 'development'.",
    ),
});

// ── Types ────────────────────────────────────────────────────────────

interface DriftReport {
  readonly currentTags: Tag[];
  readonly newTagSuggestions: Array<{
    tag: Tag;
    confidence: number;
    evidence: string[];
  }>;
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
      content: [
        {
          type: "text",
          text: buildNoConfigOutput(projectDir),
        },
      ],
    };
  }

  // ── Step 2: Sync registry gates ───────────────────────────────────
  const registryResult = await pullRegistryGates(
    projectDir,
    existingConfig.tags ?? ["UNIVERSAL"],
    existingConfig.gates_registry_url,
  );

  // ── Step 2.5: CNT drift check ─────────────────────────────────────
  const cntDrift = detectCntDrift(projectDir);

  // ── Step 3: Re-analyze project ─────────────────────────────────
  const drift = analyzeDrift(projectDir, existingConfig, args);

  // ── Step 4: Build updated config ───────────────────────────────
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
    releasePhase: (args.release_phase ??
      existingConfig.releasePhase ??
      "development") as ForgeCraftConfig["releasePhase"],
  };

  // ── Step 5: Compose with updated config ────────────────────────
  const allTemplates = await loadAllTemplatesWithExtras(
    undefined,
    updatedConfig.templateDirs,
  );
  const composed = composeTemplates(updatedTags, allTemplates, {
    config: updatedConfig,
  });

  // ── Step 6: Apply or preview ───────────────────────────────────
  if (!args.apply) {
    return {
      content: [
        {
          type: "text",
          text:
            buildPreviewOutput(
              drift,
              updatedTags,
              updatedConfig,
              composed,
              updatedTier as ContentTier,
            ) +
            "\n\n" +
            formatRefreshResult(registryResult) +
            formatCntDriftSection(cntDrift),
        },
      ],
    };
  }

  // Write updated config
  const configYaml = yaml.dump(updatedConfig, { lineWidth: 100, noRefs: true });
  writeFileSync(join(projectDir, "forgecraft.yaml"), configYaml, "utf-8");

  // Regenerate instruction files for all targets
  const outputTargets = (args.output_targets ??
    updatedConfig.outputTargets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];
  const releasePhase =
    args.release_phase ?? updatedConfig.releasePhase ?? "development";
  const context = {
    ...detectProjectContext(
      projectDir,
      updatedConfig.projectName ?? inferProjectName(projectDir),
      detectLanguage(projectDir),
      updatedTags,
    ),
    releasePhase,
  };

  let migrationWarning: string | undefined;

  for (const target of outputTargets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];

    // For claude target: use sentinel tree (default) or monolithic file
    if (target === "claude" && args.sentinel !== false) {
      const sentinelFiles = renderSentinelTree(
        composed.instructionBlocks,
        context,
      );

      // Detect migration: does the existing CLAUDE.md look like a monolithic ForgeCraft file?
      const claudeMdPath = join(projectDir, "CLAUDE.md");
      if (existsSync(claudeMdPath)) {
        const existing = readFileSync(claudeMdPath, "utf-8");
        const lineCount = existing.split("\n").length;
        const isSentinel = existing.includes("ForgeCraft sentinel");
        const isForgeCraftGenerated =
          existing.includes("ForgeCraft |") || isSentinel;

        if (!isSentinel && lineCount > 100) {
          // Large non-sentinel CLAUDE.md: extract custom content to project-specific.md
          migrationWarning = extractCustomContent(
            projectDir,
            existing,
            isForgeCraftGenerated,
          );
        }
      }

      // Replace all sentinel files (don't merge — they're always ForgeCraft-generated)
      for (const file of sentinelFiles) {
        const fullPath = join(projectDir, file.relativePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, file.content, "utf-8");
      }

      // Ensure project-specific.md exists (never overwrite — user-owned)
      ensureProjectSpecific(projectDir);
    } else {
      const content = renderInstructionFile(
        composed.instructionBlocks,
        context,
        target,
        { compact: updatedConfig.compact },
      );
      const outputPath = targetConfig.directory
        ? join(projectDir, targetConfig.directory, targetConfig.filename)
        : join(projectDir, targetConfig.filename);
      writeInstructionFileWithMerge(outputPath, content);
    }
  }

  return {
    content: [
      {
        type: "text",
        text:
          buildAppliedOutput(
            drift,
            updatedTags,
            updatedConfig,
            composed,
            updatedTier as ContentTier,
            args.sentinel !== false,
            migrationWarning,
          ) +
          "\n\n" +
          formatRefreshResult(registryResult) +
          formatCntDriftSection(cntDrift),
      },
    ],
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
  const currentTier: ContentTier = (config.tier ??
    "recommended") as ContentTier;
  const requestedTier = (args.tier ?? currentTier) as ContentTier;

  // Re-detect tags from code
  const detections = analyzeProject(projectDir);
  const newTagSuggestions: Array<{
    tag: Tag;
    confidence: number;
    evidence: string[];
  }> = [];
  const detectedTagSet = new Set<Tag>();

  for (const d of detections) {
    detectedTagSet.add(d.tag);
    if (d.confidence >= SUGGEST_THRESHOLD && !currentTags.includes(d.tag)) {
      newTagSuggestions.push({
        tag: d.tag,
        confidence: d.confidence,
        evidence: d.evidence,
      });
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
  const tierChange =
    requestedTier !== currentTier
      ? { from: currentTier, to: requestedTier }
      : null;

  // Block count comparison (before vs after)
  const allTemplates = loadAllTemplatesWithExtras(
    undefined,
    config.templateDirs,
  );
  const beforeComposed = composeTemplates(currentTags, allTemplates, {
    config,
  });
  const proposedTags = computeUpdatedTags(
    currentTags,
    newTagSuggestions,
    args.add_tags as Tag[] | undefined,
    args.remove_tags as Tag[] | undefined,
  );
  const afterConfig = { ...config, tags: proposedTags, tier: requestedTier };
  const afterComposed = composeTemplates(proposedTags, allTemplates, {
    config: afterConfig,
  });

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
    `Run setup first to initialize your project configuration:\n` +
    `  npx forgecraft-mcp setup ${projectDir}\n`
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
  text += `- Total available: ${composed.instructionBlocks.length} blocks, ${composed.nfrBlocks.length} NFRs, ${composed.hooks.length} hooks, ${composed.skills.length} skills\n\n`;

  // Gaps
  if (drift.completenessGaps.length > 0) {
    text += `## Remaining Gaps\n`;
    text += drift.completenessGaps.map((g) => `- ${g}`).join("\n");
    text += "\n\n";
  }

  text += `_Run with --apply to write changes: \`npx forgecraft-mcp refresh <project_dir> --apply\`_`;
  return text;
}

const PROJECT_SPECIFIC_PLACEHOLDER = `# Project-Specific Rules
<!-- This file is owned by YOU. ForgeCraft will never overwrite it. -->
<!-- Add project-specific rules, framework choices, conventions, and custom corrections here. -->
<!-- The sentinel CLAUDE.md links here for any AI reading your project. -->

## Framework & Stack Choices
<!-- e.g. We use Prisma for ORM. Deploy target is Railway. -->

## Custom Corrections
<!-- Log corrections here so the AI learns from them. -->
<!-- Format: - YYYY-MM-DD: [description of correction] -->

## Project-Specific Gates
<!-- Add any quality rules specific to this project that don't belong in universal standards. -->
`;

/**
 * Ensures .claude/standards/project-specific.md exists.
 * Never overwrites an existing file — this file is user-owned.
 */
function ensureProjectSpecific(projectDir: string): void {
  const filePath = join(
    projectDir,
    ".claude",
    "standards",
    "project-specific.md",
  );
  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, PROJECT_SPECIFIC_PLACEHOLDER, "utf-8");
  }
}

/**
 * Migrates content from a large monolithic CLAUDE.md to project-specific.md.
 * Extracts sections that look like user-added content (not ForgeCraft template output).
 * Returns a migration warning message.
 */
function extractCustomContent(
  projectDir: string,
  existingContent: string,
  isForgeCraftGenerated: boolean,
): string {
  const projectSpecificPath = join(
    projectDir,
    ".claude",
    "standards",
    "project-specific.md",
  );

  if (existsSync(projectSpecificPath)) {
    const existing = readFileSync(projectSpecificPath, "utf-8");
    if (!existing.includes(PROJECT_SPECIFIC_PLACEHOLDER.slice(0, 40))) {
      // User has already edited project-specific.md — don't touch it
      return isForgeCraftGenerated
        ? "Your existing CLAUDE.md was a ForgeCraft-generated monolithic file. It has been replaced with a sentinel. Custom content was NOT migrated because `.claude/standards/project-specific.md` already contains your edits."
        : "Your existing CLAUDE.md appears to be custom. It has been replaced with the sentinel. Back up any custom rules you need into `.claude/standards/project-specific.md`.";
    }
  }

  // Extract sections that look custom (not standard ForgeCraft headers)
  const forgecraftHeaders = new Set([
    "Code Standards",
    "Production Code Standards",
    "SOLID Principles",
    "Zero Hardcoded Values",
    "Zero Mocks in Application Code",
    "Interfaces First",
    "Dependency Injection",
    "Error Handling",
    "Modular from Day One",
    "Layered Architecture",
    "Clean Code Principles",
    "CI/CD",
    "Testing Pyramid",
    "Data Guardrails",
    "Commit Protocol",
    "MCP-Powered Tooling",
    "Engineering Preferences",
    "Library / Package Standards",
    "CLI Standards",
    "API Standards",
    "Security",
    "Graceful Shutdown",
    "Project Identity",
  ]);

  const lines = existingContent.split("\n");
  const customSections: string[] = [];
  let inCustomSection = false;
  let currentSection: string[] = [];
  let currentHeader = "";

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      if (inCustomSection && currentSection.length > 2) {
        customSections.push(currentSection.join("\n").trim());
      }
      currentHeader = headerMatch[1].trim();
      inCustomSection = !Array.from(forgecraftHeaders).some((h) =>
        currentHeader.toLowerCase().includes(h.toLowerCase()),
      );
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }
  if (inCustomSection && currentSection.length > 2) {
    customSections.push(currentSection.join("\n").trim());
  }

  if (customSections.length > 0) {
    const extracted = `# Project-Specific Rules
<!-- Migrated from monolithic CLAUDE.md by ForgeCraft sentinel upgrade -->
<!-- Review and clean up — some content below may have been incorrectly classified as custom -->

${customSections.join("\n\n")}
`;
    mkdirSync(dirname(projectSpecificPath), { recursive: true });
    writeFileSync(projectSpecificPath, extracted, "utf-8");
    return `Your CLAUDE.md (${existingContent.split("\n").length} lines) has been converted to a sentinel. ${customSections.length} custom section(s) were extracted to \`.claude/standards/project-specific.md\` — please review that file and clean it up.`;
  }

  ensureProjectSpecific(projectDir);
  return `Your CLAUDE.md (${existingContent.split("\n").length} lines) has been converted to a sentinel. No custom sections were detected. Review \`.claude/standards/project-specific.md\` and add any project-specific rules you need.`;
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
  usedSentinel = true,
  migrationWarning?: string,
): string {
  const configYaml = yaml.dump(config, { lineWidth: 100, noRefs: true });

  let text = `# Project Refreshed\n\n`;
  text += `**Tags:** ${updatedTags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Tier:** ${tier}\n\n`;

  text += `## Changes Applied\n`;
  text += `- forgecraft.yaml — updated\n`;
  if (usedSentinel) {
    text += `- CLAUDE.md — replaced with sentinel (~50 lines)\n`;
    text += `- .claude/standards/*.md — domain files generated (${composed.instructionBlocks.length} blocks distributed)\n`;
    text += `- .claude/standards/project-specific.md — preserved (user-owned, never overwritten)\n\n`;
  } else {
    text += `- Instruction files — regenerated (${composed.instructionBlocks.length} blocks)\n\n`;
  }

  if (migrationWarning) {
    text += `## Migration Notice\n`;
    text += migrationWarning + "\n\n";
  }

  if (drift.newTagSuggestions.length > 0) {
    const added = drift.newTagSuggestions.filter((s) => s.confidence >= 0.6);
    if (added.length > 0) {
      text += `## New Tags Added\n`;
      text += added
        .map((s) => `- [${s.tag}] — ${s.evidence.join(", ")}`)
        .join("\n");
      text += "\n\n";
    }
  }

  text += `## What refresh does NOT create\n`;
  text += `Run \`scaffold .\` (without --force) to create any missing artifacts:\n`;
  text += `Status.md, docs/PRD.md, docs/TechSpec.md, docs/adrs/, .env.example, hooks, skills, .gitignore\n\n`;

  text += `## Updated Config\n`;
  text += `\`\`\`yaml\n${configYaml}\`\`\`\n\n`;

  text += `> **Tip:** Remove ForgeCraft from your MCP servers to save tokens (setup is done).\n`;
  text += `> Re-add it when needed: \`claude mcp add forgecraft -- npx -y forgecraft-mcp\`\n\n`;
  text += `⚠️ **Restart required** to pick up CLAUDE.md changes.`;
  return text;
}

/**
 * Format the CNT drift section for refresh output.
 *
 * @param drift - The CNT drift detection result
 * @returns Formatted section string (empty string if no CNT or no drift)
 */
function formatCntDriftSection(drift: CntDriftResult): string {
  if (!drift.hasCnt) return "";

  const lines: string[] = ["", "## CNT Drift"];

  if (drift.staleNodes.length === 0 && drift.uncoveredModules.length === 0) {
    lines.push("✅ CNT tree is in sync with src/ modules.");
    return lines.join("\n");
  }

  if (drift.staleNodes.length > 0) {
    lines.push(
      `**Stale nodes** (no matching src/ module): ${drift.staleNodes.join(", ")}`,
    );
  }

  if (drift.uncoveredModules.length > 0) {
    lines.push(
      `**Uncovered modules** (no CNT node): ${drift.uncoveredModules.join(", ")}`,
    );
    lines.push(`Run \`cnt_add_node\` to add nodes for uncovered modules.`);
  }

  return lines.join("\n");
}
