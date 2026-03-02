/**
 * generate_instructions tool handler.
 *
 * Generates instruction files for AI assistants (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 * Replaces the former generate_claude_md tool with multi-target support.
 * Always merges with existing files by default to preserve user custom sections.
 */

import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ALL_TAGS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, OutputTarget } from "../shared/types.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile } from "../registry/renderer.js";
import { writeInstructionFileWithMerge } from "../shared/filesystem.js";
import { detectLanguage } from "../analyzers/language-detector.js";
import { detectProjectContext } from "../analyzers/project-context.js";

// ── Schema ───────────────────────────────────────────────────────────

export const generateInstructionsSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Project classification tags."),
  project_dir: z
    .string()
    .optional()
    .describe("Absolute path to project. If provided, writes instruction files to disk."),
  project_name: z
    .string()
    .default("My Project")
    .describe("Project name for variable substitution."),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .default(["claude"])
    .describe("AI assistant targets to generate for. Defaults to ['claude']. Options: claude, cursor, copilot, windsurf, cline, aider."),
  merge_with_existing: z
    .boolean()
    .default(true)
    .describe("If true, merge with existing instruction files instead of replacing. Preserves custom sections added by the user. Default: true."),
});

/** @deprecated Use generateInstructionsSchema instead. */
export const generateClaudeMdSchema = generateInstructionsSchema;

// ── Handler ──────────────────────────────────────────────────────────

export async function generateInstructionsHandler(
  args: z.infer<typeof generateInstructionsSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  const targets = (args.output_targets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];

  const userConfig = args.project_dir ? loadUserOverrides(args.project_dir) : null;
  const templateSets = await loadAllTemplatesWithExtras(
    undefined,
    userConfig?.templateDirs,
  );
  const composed = composeTemplates(tags, templateSets, {
    config: userConfig ?? undefined,
  });

  const detectedLang = args.project_dir ? detectLanguage(args.project_dir) : "typescript";
  const context = args.project_dir
    ? detectProjectContext(args.project_dir, args.project_name, detectedLang, tags)
    : { projectName: args.project_name, language: detectedLang, tags };

  const filesWritten: string[] = [];
  const targetSummaries: string[] = [];

  for (const target of targets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];
    const content = renderInstructionFile(composed.instructionBlocks, context, target);

    // Write to disk if project_dir provided
    if (args.project_dir) {
      const targetPath = resolveTargetPath(args.project_dir, target);

      if (args.merge_with_existing) {
        writeInstructionFileWithMerge(targetPath, content);
      } else {
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content, "utf-8");
      }

      filesWritten.push(targetPath);
      targetSummaries.push(`- **${targetConfig.displayName}**: \`${targetConfig.directory ? targetConfig.directory + "/" : ""}${targetConfig.filename}\``);
    }
  }

  if (args.project_dir && filesWritten.length > 0) {
    const mergeNote = args.merge_with_existing
      ? "\n\n> Custom sections from existing files have been preserved."
      : "";
    return {
      content: [
        {
          type: "text",
          text: `# Instruction Files Generated\n\n**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n**Blocks:** ${composed.instructionBlocks.length}\n\n## Files Written\n${targetSummaries.join("\n")}${mergeNote}\n\n⚠️ Restart may be required to pick up changes.`,
        },
      ],
    };
  }

  // Return content for first target only (when no project_dir)
  const content = renderInstructionFile(composed.instructionBlocks, context, targets[0]!);
  return {
    content: [
      {
        type: "text",
        text: content,
      },
    ],
  };
}

/** @deprecated Use generateInstructionsHandler instead. */
export const generateClaudeMdHandler = generateInstructionsHandler;

/**
 * Resolve the full file path for an output target.
 */
function resolveTargetPath(projectDir: string, target: OutputTarget): string {
  const config = OUTPUT_TARGET_CONFIGS[target];
  if (config.directory) {
    return join(projectDir, config.directory, config.filename);
  }
  return join(projectDir, config.filename);
}
