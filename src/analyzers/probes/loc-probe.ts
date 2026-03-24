/**
 * LOC (Lines of Code) probe — pure filesystem, no external tool required.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { detectLanguage } from "../language-detector.js";
import type { SupportedLanguage } from "../language-detector.js";
import { ALL_EXTENSIONS, LOC_SKIP_DIRS } from "./tool-runner.js";
import type { ProbeResult } from "./tool-runner.js";

export interface LocData {
  readonly language: SupportedLanguage;
  readonly files: number;
  readonly lines: number;
  readonly blankLines: number;
  readonly byExtension: Record<string, { files: number; lines: number }>;
}

/**
 * Count source lines by walking the project directory tree.
 * Uses LANGUAGE_EXTENSIONS so every supported language is counted.
 * Always succeeds — no external tool required.
 */
export function probeLoc(projectDir: string): ProbeResult<LocData> {
  const language = detectLanguage(projectDir);
  const countableExtensions = new Set(ALL_EXTENSIONS);
  const byExtension: Record<string, { files: number; lines: number }> = {};
  let totalFiles = 0;
  let totalLines = 0;
  let totalBlank = 0;

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (LOC_SKIP_DIRS.has(name)) continue;
      const fullPath = join(dir, name);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = extname(name);
      if (!countableExtensions.has(ext)) continue;
      let content: string;
      try {
        content = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      const blank = lines.filter((l) => l.trim() === "").length;
      totalFiles++;
      totalLines += lines.length;
      totalBlank += blank;
      if (!byExtension[ext]) byExtension[ext] = { files: 0, lines: 0 };
      byExtension[ext]!.files++;
      byExtension[ext]!.lines += lines.length;
    }
  }

  if (!existsSync(projectDir)) {
    return { available: false, error: `Directory not found: ${projectDir}` };
  }

  try {
    walk(projectDir);
    return {
      available: true,
      data: {
        language,
        files: totalFiles,
        lines: totalLines,
        blankLines: totalBlank,
        byExtension,
      },
    };
  } catch (err) {
    return { available: false, error: String(err) };
  }
}
