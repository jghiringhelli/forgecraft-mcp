/**
 * generate_instructions tool handler.
 *
 * Generates instruction files for AI assistants (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 * Replaces the former generate_claude_md tool with multi-target support.
 */

import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ALL_TAGS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, OutputTarget } from "../shared/types.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile } from "../registry/renderer.js";
import { detectLanguage } from "../analyzers/language-detector.js";

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
    .default(false)
    .describe("If true, merge with existing instruction files instead of replacing."),
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
  const context = {
    projectName: args.project_name,
    language: detectedLang,
    tags,
  };

  const filesWritten: string[] = [];
  const targetSummaries: string[] = [];

  for (const target of targets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];
    let content = renderInstructionFile(composed.instructionBlocks, context, target);

    // Handle merge with existing
    if (args.merge_with_existing && args.project_dir) {
      const existingPath = resolveTargetPath(args.project_dir, target);
      if (existsSync(existingPath)) {
        const existing = readFileSync(existingPath, "utf-8");
        content = mergeInstructionFile(existing, content);
      }
    }

    // Write to disk if project_dir provided
    if (args.project_dir) {
      const targetPath = resolveTargetPath(args.project_dir, target);
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, content, "utf-8");
      filesWritten.push(targetPath);
      targetSummaries.push(`- **${targetConfig.displayName}**: \`${targetConfig.directory ? targetConfig.directory + "/" : ""}${targetConfig.filename}\``);
    }
  }

  if (args.project_dir && filesWritten.length > 0) {
    return {
      content: [
        {
          type: "text",
          text: `# Instruction Files Generated\n\n**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n**Blocks:** ${composed.instructionBlocks.length}\n\n## Files Written\n${targetSummaries.join("\n")}\n\n⚠️ Restart may be required to pick up changes.`,
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

/**
 * Merge generated instruction file with existing one.
 * Keeps any custom sections from the existing file.
 */
function mergeInstructionFile(existing: string, generated: string): string {
  const existingLines = existing.split("\n");
  const generatedLines = generated.split("\n");

  // Find custom sections (sections not in generated)
  const generatedHeaders = new Set(
    generatedLines
      .filter((l) => l.startsWith("## ") || l.startsWith("### "))
      .map((l) => l.trim()),
  );

  const customSections: string[] = [];
  let inCustomSection = false;
  let currentSection: string[] = [];

  for (const line of existingLines) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      if (inCustomSection && currentSection.length > 0) {
        customSections.push(currentSection.join("\n"));
      }
      inCustomSection = !generatedHeaders.has(line.trim());
      currentSection = inCustomSection ? [line] : [];
    } else if (inCustomSection) {
      currentSection.push(line);
    }
  }

  if (inCustomSection && currentSection.length > 0) {
    customSections.push(currentSection.join("\n"));
  }

  // Append custom sections to generated content
  if (customSections.length > 0) {
    return (
      generated +
      "\n\n<!-- Custom Sections (preserved from previous file) -->\n\n" +
      customSections.join("\n\n")
    );
  }

  return generated;
}
