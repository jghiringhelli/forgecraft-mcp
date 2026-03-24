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
import {
  analyzeDrift,
  computeUpdatedTags,
  inferProjectName,
} from "./refresh-analyzer.js";
import {
  buildNoConfigOutput,
  buildPreviewOutput,
  buildAppliedOutput,
  formatCntDriftSection,
  ensureProjectSpecific,
  extractCustomContent,
} from "./refresh-output.js";

export type { DriftReport } from "./refresh-analyzer.js";
export {
  analyzeDrift,
  computeUpdatedTags,
  inferProjectName,
} from "./refresh-analyzer.js";
export {
  PROJECT_SPECIFIC_PLACEHOLDER,
  ensureProjectSpecific,
  extractCustomContent,
  buildNoConfigOutput,
  buildPreviewOutput,
  buildAppliedOutput,
  formatCntDriftSection,
} from "./refresh-output.js";

const logger = createLogger("tools/refresh-project");

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
  sentinel: z
    .boolean()
    .default(true)
    .describe("If true (default), generate a sentinel CLAUDE.md + .claude/standards/ domain files."),
  release_phase: z
    .enum(["development", "pre-release", "release-candidate", "production"])
    .optional()
    .describe("Override current release cycle phase. If omitted, uses value from forgecraft.yaml."),
});

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Handle the refresh_project tool call.
 *
 * @param args - Validated refresh args
 * @returns MCP-style tool result with text content
 */
export async function refreshProjectHandler(
  args: z.infer<typeof refreshProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = args.project_dir;

  logger.info("Refresh project starting", { projectDir, apply: args.apply });

  const existingConfig = loadUserOverrides(projectDir);
  if (!existingConfig) {
    return { content: [{ type: "text", text: buildNoConfigOutput(projectDir) }] };
  }

  const registryResult = await pullRegistryGates(
    projectDir,
    existingConfig.tags ?? ["UNIVERSAL"],
    existingConfig.gates_registry_url,
  );

  const cntDrift = detectCntDrift(projectDir);
  const drift = analyzeDrift(projectDir, existingConfig, args);

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
    releasePhase: (args.release_phase ?? existingConfig.releasePhase ?? "development") as ForgeCraftConfig["releasePhase"],
  };

  const allTemplates = await loadAllTemplatesWithExtras(undefined, updatedConfig.templateDirs);
  const composed = composeTemplates(updatedTags, allTemplates, { config: updatedConfig });

  if (!args.apply) {
    return {
      content: [{
        type: "text",
        text: buildPreviewOutput(drift, updatedTags, updatedConfig, composed, updatedTier as ContentTier) +
          "\n\n" + formatRefreshResult(registryResult) + formatCntDriftSection(cntDrift),
      }],
    };
  }

  const configYaml = yaml.dump(updatedConfig, { lineWidth: 100, noRefs: true });
  writeFileSync(join(projectDir, "forgecraft.yaml"), configYaml, "utf-8");

  const outputTargets = (args.output_targets ?? updatedConfig.outputTargets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];
  const releasePhase = args.release_phase ?? updatedConfig.releasePhase ?? "development";
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

    if (target === "claude" && args.sentinel !== false) {
      const sentinelFiles = renderSentinelTree(composed.instructionBlocks, context);

      const claudeMdPath = join(projectDir, "CLAUDE.md");
      if (existsSync(claudeMdPath)) {
        const existing = readFileSync(claudeMdPath, "utf-8");
        const lineCount = existing.split("\n").length;
        const isSentinel = existing.includes("ForgeCraft sentinel");
        const isForgeCraftGenerated = existing.includes("ForgeCraft |") || isSentinel;

        if (!isSentinel && lineCount > 100) {
          migrationWarning = extractCustomContent(projectDir, existing, isForgeCraftGenerated);
        }
      }

      for (const file of sentinelFiles) {
        const fullPath = join(projectDir, file.relativePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, file.content, "utf-8");
      }

      ensureProjectSpecific(projectDir);
    } else {
      const content = renderInstructionFile(
        composed.instructionBlocks, context, target,
        { compact: updatedConfig.compact },
      );
      const outputPath = targetConfig.directory
        ? join(projectDir, targetConfig.directory, targetConfig.filename)
        : join(projectDir, targetConfig.filename);
      writeInstructionFileWithMerge(outputPath, content);
    }
  }

  return {
    content: [{
      type: "text",
      text: buildAppliedOutput(drift, updatedTags, updatedConfig, composed, updatedTier as ContentTier, args.sentinel !== false, migrationWarning) +
        "\n\n" + formatRefreshResult(registryResult) + formatCntDriftSection(cntDrift),
    }],
  };
}
