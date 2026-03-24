/**
 * Self-describing scorer: instruction file exists, is substantive, and covers
 * architecture / conventions / decisions.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs, MIN_INSTRUCTION_FILE_LINES, INSTRUCTION_COVERAGE_KEYWORDS, MIN_KEYWORD_HITS } from "./scorer-utils.js";

/**
 * Score the Self-describing GS property.
 * 2 = instruction file found, substantive, covers architecture/convention keywords.
 * 1 = file found but short or missing keywords.
 * 0 = no instruction file found.
 */
export function scoreSelfDescribing(projectDir: string): GsPropertyScore {
  const instructionPaths = [
    "CLAUDE.md",
    ".cursor/rules",
    ".github/copilot-instructions.md",
    ".windsurfrules",
    ".clinerules",
    "CONVENTIONS.md",
  ];

  const found = instructionPaths.find((p) => existsSync(join(projectDir, p)));

  if (!found) {
    return gs("self-describing", 0, ["No AI assistant instruction file found"]);
  }

  let content = "";
  try { content = readFileSync(join(projectDir, found), "utf-8"); } catch { /* empty */ }
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length < MIN_INSTRUCTION_FILE_LINES) {
    return gs("self-describing", 1, [
      `${found} found but only ${lines.length} non-empty lines (< ${MIN_INSTRUCTION_FILE_LINES} — treat as stub)`,
    ]);
  }

  const lower = content.toLowerCase();
  const hits = INSTRUCTION_COVERAGE_KEYWORDS.filter((kw) => lower.includes(kw));

  if (hits.length < MIN_KEYWORD_HITS) {
    return gs("self-describing", 1, [
      `${found} found (${lines.length} lines) but covers fewer than ${MIN_KEYWORD_HITS} architecture/convention keywords`,
      `Missing keywords: ${INSTRUCTION_COVERAGE_KEYWORDS.filter((kw) => !lower.includes(kw)).slice(0, 5).join(", ")}`,
    ]);
  }

  return gs("self-describing", 2, [
    `${found} found — ${lines.length} non-empty lines`,
    `Covers: ${hits.join(", ")}`,
  ]);
}
