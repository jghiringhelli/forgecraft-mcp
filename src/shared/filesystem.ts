/**
 * Filesystem safety utilities.
 *
 * Provides safe file writing (skip existing) and git status checks
 * for tools that modify the user's project directory.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
