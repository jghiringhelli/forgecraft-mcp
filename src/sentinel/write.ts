/**
 * Sentinel-respecting writer for AI behavioral instruction files.
 *
 * Pairs with `./detect.ts`: detection is the read-only check, this is the
 * gated write. Default behaviour is the safe one — if any sentinel exists
 * (at the target path or anywhere on the canonical priority list), the
 * write is *skipped* and the caller decides what to do.
 *
 * Three opt-ins are available:
 * - `override: true`              → write the target unconditionally.
 * - `appendIfMatchTarget: true`   → append the new content under a dated
 *                                   `## GS Discipline` header, but only
 *                                   when the target file already exists
 *                                   and is itself one of the recognised
 *                                   sentinels. Cross-file appends are not
 *                                   permitted from this helper.
 *
 * This module performs no integration with existing CLAUDE.md generation
 * flows — that wiring is a separate refactor.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { detectSentinel, SENTINEL_PRIORITY_PATHS } from "./detect.js";

export interface WriteWithSentinelRespectOptions {
  /** Absolute path to the repo root used for sentinel scanning. */
  readonly repoPath: string;
  /** Absolute path of the file forgecraft wants to write. */
  readonly targetPath: string;
  /** New content to write. */
  readonly content: string;
  /** Force-write even when sentinels exist. Default `false`. */
  readonly override?: boolean;
  /**
   * If `true` and the target itself is a recognised sentinel that already
   * exists, append the content under a dated header instead of skipping.
   * Has no effect when `override` is `true`.
   */
  readonly appendIfMatchTarget?: boolean;
}

export type WriteWithSentinelRespectResult =
  | { readonly action: "written"; readonly bytesWritten: number }
  | {
      readonly action: "appended";
      readonly existingFile: string;
      readonly bytesWritten: number;
    }
  | {
      readonly action: "skipped";
      readonly reason: string;
      readonly existingFile: string;
    };

/**
 * Write `content` to `targetPath`, respecting any sentinel files already
 * in the repo. See module docstring for the full policy.
 */
export function writeWithSentinelRespect(
  opts: WriteWithSentinelRespectOptions,
): WriteWithSentinelRespectResult {
  const {
    repoPath,
    targetPath,
    content,
    override = false,
    appendIfMatchTarget = false,
  } = opts;

  if (override) {
    return writeFresh(targetPath, content);
  }

  const detection = detectSentinel(repoPath);
  const targetExists = existsSync(targetPath);

  if (!targetExists && detection.foundFiles.length === 0) {
    return writeFresh(targetPath, content);
  }

  const targetRel = toRepoRelative(repoPath, targetPath);
  const targetIsSentinel = SENTINEL_PRIORITY_PATHS.includes(targetRel);

  if (appendIfMatchTarget && targetExists && targetIsSentinel) {
    return appendUnderHeader(targetPath, content);
  }

  const blocking =
    targetExists && targetIsSentinel
      ? targetRel
      : (detection.foundFiles[0]?.path ?? targetRel);

  const reason = targetExists
    ? `Target ${targetRel} already exists; pass override:true to replace, or appendIfMatchTarget:true to append.`
    : `Sentinel(s) detected: ${detection.foundFiles
        .map((f) => f.path)
        .join(", ")}. Pass override:true to write anyway.`;

  return { action: "skipped", reason, existingFile: blocking };
}

function writeFresh(
  targetPath: string,
  content: string,
): WriteWithSentinelRespectResult {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, "utf-8");
  return {
    action: "written",
    bytesWritten: Buffer.byteLength(content, "utf-8"),
  };
}

function appendUnderHeader(
  targetPath: string,
  content: string,
): WriteWithSentinelRespectResult {
  const original = readFileSync(targetPath, "utf-8");
  const date = new Date().toISOString().slice(0, 10);
  const separator = original.endsWith("\n") ? "\n" : "\n\n";
  const header = `## GS Discipline (appended by forgecraft ${date})\n\n`;
  const merged = `${original}${separator}${header}${content}`;
  writeFileSync(targetPath, merged, "utf-8");
  const bytesWritten =
    Buffer.byteLength(merged, "utf-8") - Buffer.byteLength(original, "utf-8");
  return { action: "appended", existingFile: targetPath, bytesWritten };
}

/** Express `targetPath` relative to `repoPath` using POSIX separators. */
function toRepoRelative(repoPath: string, targetPath: string): string {
  return relative(resolve(repoPath), resolve(targetPath)).replace(/\\/g, "/");
}
