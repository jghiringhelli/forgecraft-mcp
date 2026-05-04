/**
 * Self-describing scorer: instruction file exists and covers architecture/convention keywords.
 *
 * Sentinel-aware: a compact CLAUDE.md that navigates to the right docs is better
 * than a verbose file that repeats them. Line count is irrelevant — keyword coverage
 * is the signal.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import {
  gs,
  INSTRUCTION_COVERAGE_KEYWORDS,
  MIN_KEYWORD_HITS,
} from "./scorer-utils.js";

/**
 * Score the Self-describing GS property.
 * 2 = instruction file exists and covers ≥ MIN_KEYWORD_HITS architecture/convention keywords.
 * 1 = file exists but covers fewer keywords (present but not describing the architecture).
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
  try {
    content = readFileSync(join(projectDir, found), "utf-8");
  } catch {
    /* empty */
  }

  const lower = content.toLowerCase();
  const hits = INSTRUCTION_COVERAGE_KEYWORDS.filter((kw) => lower.includes(kw));

  if (hits.length >= MIN_KEYWORD_HITS) {
    return gs("self-describing", 2, [
      `${found} found — covers: ${hits.join(", ")}`,
    ]);
  }

  const missing = INSTRUCTION_COVERAGE_KEYWORDS.filter(
    (kw) => !lower.includes(kw),
  );
  return gs("self-describing", 1, [
    `${found} found but covers fewer than ${MIN_KEYWORD_HITS} architecture/convention keywords`,
    `Add navigation or constraints referencing: ${missing.slice(0, 5).join(", ")}`,
  ]);
}
