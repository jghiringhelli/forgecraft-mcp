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
 * Merge a generated instruction file with an existing one.
 * Preserves any custom sections (## or ###) from the existing file
 * that are not present in the generated output.
 *
 * @param existing - Current file content with possible user-added sections
 * @param generated - Newly generated content from ForgeCraft
 * @returns Merged content with custom sections appended
 */
export function mergeInstructionFiles(
  existing: string,
  generated: string,
): string {
  const existingLines = existing.split("\n");
  const generatedLines = generated.split("\n");

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

  if (customSections.length > 0) {
    logger.info("Preserving custom sections during merge", {
      sectionCount: customSections.length,
    });
    return (
      generated +
      "\n\n<!-- Custom Sections (preserved from previous file) -->\n\n" +
      customSections.join("\n\n")
    );
  }

  return generated;
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
