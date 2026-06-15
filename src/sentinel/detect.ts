/**
 * Sentinel detection — find existing AI behavioral instruction files in a repo.
 *
 * Before forgecraft writes any instruction file (CLAUDE.md, AGENTS.md,
 * cursor rules, copilot instructions, ...), it must first see what is
 * already on disk. Multiple sentinels in a single repo is a coordination
 * hazard: silently overwriting one breaks whichever tool was depending on
 * it. Detection is the read-only first half of that contract; the write
 * half lives in `./write.ts`.
 *
 * The priority list below is canonical. Order matters — the first existing
 * entry becomes `primaryFile`. Keep it stable; downstream tools rely on
 * this ordering when deciding which file to map to.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  SentinelDetectionResult,
  SentinelFoundFile,
} from "../shared/types.js";

/**
 * Canonical priority list of sentinel paths, highest priority first.
 * Paths are relative to the repo root and use POSIX separators.
 *
 * Includes both files and directories — `.cursor/rules` is a directory of
 * `.mdc` rule files; everything else is a single markdown/yaml file.
 */
export const SENTINEL_PRIORITY_PATHS: readonly string[] = [
  "CLAUDE.md",
  "agents.md",
  "AGENTS.md",
  ".cursor/rules",
  ".aider.conf.yml",
  ".github/copilot-instructions.md",
  ".windsurf/rules",
  ".clinerules",
  ".kiro/steering",
] as const;

/**
 * Scan `repoPath` for AI instruction files in canonical priority order.
 *
 * @param repoPath Absolute path to the repository root to scan.
 * @returns Detection result enumerating found files and a recommendation.
 *
 * Filesystem semantics:
 * - Files are matched by exact path; their `sizeBytes` is `stat().size`.
 * - Directories (e.g. `.cursor/rules`) are considered present only when
 *   they contain at least one immediate file; `sizeBytes` is the sum of
 *   those immediate files' sizes. This avoids reporting an empty cursor
 *   rules folder as a live sentinel.
 * - Symlinks are followed via `statSync`'s default behaviour.
 * - Errors reading individual entries are swallowed — a permission error
 *   on one path must not mask sentinels at other paths.
 */
export function detectSentinel(repoPath: string): SentinelDetectionResult {
  const foundFiles: SentinelFoundFile[] = [];

  for (const relPath of SENTINEL_PRIORITY_PATHS) {
    const absPath = join(repoPath, relPath);
    if (!existsSync(absPath)) continue;

    const sizeBytes = sizeOfEntry(absPath);
    if (sizeBytes === null) continue;

    foundFiles.push({ path: relPath, sizeBytes });
  }

  const primaryFile = foundFiles.length > 0 ? foundFiles[0]!.path : null;

  let recommendation: SentinelDetectionResult["recommendation"];
  if (foundFiles.length === 0) {
    recommendation = "none-found";
  } else if (foundFiles.length === 1) {
    recommendation = "map";
  } else {
    recommendation = "override-required";
  }

  return { foundFiles, primaryFile, recommendation };
}

/**
 * Return the size in bytes of a sentinel entry — file size for files,
 * sum of immediate file sizes for directories. Returns `null` when the
 * entry should not count as a sentinel (empty directory, unreadable).
 */
function sizeOfEntry(absPath: string): number | null {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(absPath);
  } catch {
    return null;
  }

  if (stats.isFile()) {
    return stats.size;
  }
  if (stats.isDirectory()) {
    return sumImmediateFileSizes(absPath);
  }
  return null;
}

/**
 * Sum sizes of the immediate (non-recursive) files inside a directory.
 * An empty directory returns `null` so callers can treat it as absent.
 */
function sumImmediateFileSizes(dirPath: string): number | null {
  let total = 0;
  let foundAny = false;

  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dirPath, {
      withFileTypes: true,
    }) as import("node:fs").Dirent[];
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      total += statSync(join(dirPath, entry.name)).size;
      foundAny = true;
    } catch {
      // Skip unreadable entries; keep scanning.
    }
  }

  return foundAny ? total : null;
}
