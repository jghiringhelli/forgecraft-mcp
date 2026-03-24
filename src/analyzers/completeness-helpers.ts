/**
 * Shared constants and pure helper functions for completeness checks.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AuditCheck } from "../shared/types.js";

/** Known AI assistant instruction file paths to check. */
export const KNOWN_INSTRUCTION_PATHS = [
  "CLAUDE.md",
  ".cursor/rules",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  ".clinerules",
  "CONVENTIONS.md",
];

/**
 * Check if any AI assistant instruction file exists.
 *
 * @param projectDir - Absolute path to project root
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 */
export function checkInstructionFileExists(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
): void {
  const found = KNOWN_INSTRUCTION_PATHS.filter((p) =>
    existsSync(join(projectDir, p)),
  );

  if (found.length > 0) {
    passing.push({
      check: "instruction_file_exists",
      message: `✅ Instruction file(s) found: ${found.join(", ")}`,
    });
  } else {
    failing.push({
      check: "instruction_file_exists",
      message:
        "No AI assistant instruction file found — run `generate_instructions` to create one",
      severity: "error",
    });
  }
}
