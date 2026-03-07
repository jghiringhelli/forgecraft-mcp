/**
 * Filesystem safety utilities.
 *
 * Provides safe file writing (skip existing), git status checks,
 * and instruction file merging for tools that modify the user's project directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { createLogger } from "./logger/index.js";

const logger = createLogger("shared/filesystem");

/** Result of a safe file write operation. */
export type WriteResult = "created" | "skipped" | "overwritten";

/**
 * Write a file only if it does not already exist.
 * Creates parent directories as needed.
 *
 * @param filePath - Absolute path to write
 * @param content - File content
 * @param force - If true, overwrite existing files
 * @returns Write status
 */
export function writeFileIfMissing(
  filePath: string,
  content: string,
  force = false,
): WriteResult {
  const exists = existsSync(filePath);

  if (exists && !force) {
    logger.debug("Skipping existing file", { filePath });
    return "skipped";
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");

  const result: WriteResult = exists ? "overwritten" : "created";
  logger.debug("File written", { filePath, result });
  return result;
}

/**
 * Check if the project directory has uncommitted git changes.
 * Returns a warning message if dirty, null if clean or not a git repo.
 *
 * @param projectDir - Absolute path to project root
 * @returns Warning string or null
 */
export function checkGitSafety(projectDir: string): string | null {
  try {
    const output = execSync("git status --porcelain", {
      cwd: projectDir,
      timeout: 5_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (output.length > 0) {
      const lines = output.split("\n").length;
      return `${lines} uncommitted change${lines === 1 ? "" : "s"} detected. Consider committing or stashing before scaffolding.`;
    }

    return null;
  } catch {
    // Not a git repo or git not available — no warning needed
    return null;
  }
}

/**
 * Block represents a single header + body pair parsed from a Markdown file.
 * The preamble (content before the first header) uses an empty string as header.
 */
type Block = { header: string; body: string };

/**
 * Parse a Markdown file into sequential Block objects.
 * Each `## ` or `### ` heading starts a new block.
 *
 * @param text - Raw Markdown content
 * @returns Ordered array of blocks
 */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let header = "";
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      blocks.push({ header, body: bodyLines.join("\n") });
      header = line.trim();
      bodyLines.length = 0;
    } else {
      bodyLines.push(line);
    }
  }
  blocks.push({ header, body: bodyLines.join("\n") });
  return blocks;
}

/**
 * Merge a generated instruction file with an existing one.
 *
 * **Merge direction**: the existing file always wins.
 * - All sections present in the existing file are kept as-is.
 * - Sections present only in the generated output (genuinely new additions)
 *   are appended at the end.
 * - Sections present only in the existing file (user-written custom content)
 *   are preserved unchanged.
 *
 * This ensures a handwritten CLAUDE.md is never overwritten by template prose.
 *
 * @param existing - Current file content (user-owned, takes priority)
 * @param generated - Newly generated content from ForgeCraft (provides new sections only)
 * @returns Merged content where existing always wins
 */
export function mergeInstructionFiles(
  existing: string,
  generated: string,
): string {
  const existingBlocks = parseBlocks(existing);
  const generatedBlocks = parseBlocks(generated);

  const existingHeaders = new Set(existingBlocks.map((b) => b.header));

  // Start from the full existing content
  const parts: string[] = existingBlocks.map((b) =>
    b.header ? `${b.header}\n${b.body}`.trimEnd() : b.body.trimEnd(),
  );

  // Append only sections that are genuinely new (not present in existing)
  const newSections = generatedBlocks.filter(
    (b) => b.header !== "" && !existingHeaders.has(b.header),
  );

  if (newSections.length > 0) {
    logger.info("Adding new sections from template during merge", {
      sectionCount: newSections.length,
      headers: newSections.map((s) => s.header),
    });
    for (const section of newSections) {
      parts.push(`${section.header}\n${section.body}`.trimEnd());
    }
  }

  return parts
    .filter((p) => p.trim().length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Write an instruction file, merging with the existing file if present.
 * Always preserves user-added custom sections.
 *
 * @param filePath - Absolute path to the instruction file
 * @param content - New generated content
 */
export function writeInstructionFileWithMerge(
  filePath: string,
  content: string,
): void {
  mkdirSync(dirname(filePath), { recursive: true });

  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    const merged = mergeInstructionFiles(existing, content);
    writeFileSync(filePath, merged, "utf-8");
    logger.debug("Instruction file merged", { filePath });
  } else {
    writeFileSync(filePath, content, "utf-8");
    logger.debug("Instruction file created", { filePath });
  }
}
