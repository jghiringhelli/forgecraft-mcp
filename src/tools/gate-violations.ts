/**
 * gate-violations tool.
 *
 * Reads .forgecraft/gate-violations.jsonl and surfaces active violations
 * (those newer than the last git commit). Stale violations (from before
 * the last commit) are shown separately so history is preserved.
 */

import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import type { ToolResult } from "../shared/types.js";

// ── Schema ──────────────────────────────────────────────────────────────

export const readGateViolationsSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
});

export type ReadGateViolationsInput = z.infer<typeof readGateViolationsSchema>;

// ── Types ───────────────────────────────────────────────────────────────

export interface GateViolation {
  readonly hook: string;
  readonly severity: string;
  readonly message: string;
  readonly timestamp: string;
}

export interface GateViolationReport {
  readonly active: ReadonlyArray<GateViolation>;
  readonly stale: ReadonlyArray<GateViolation>;
  readonly lastCommitAt: string | null;
}

// ── Handler ─────────────────────────────────────────────────────────────

/**
 * Read gate violations from the project's .forgecraft directory.
 *
 * @param args - Validated input containing project directory
 * @returns MCP tool result with formatted violation report
 */
export async function readGateViolationsHandler(
  args: ReadGateViolationsInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const report = buildGateViolationReport(projectDir);
  return {
    content: [{ type: "text", text: formatGateViolationReport(report) }],
  };
}

// ── Core builder ────────────────────────────────────────────────────────

/**
 * Build a GateViolationReport from the project directory.
 * Violations newer than the last commit are "active"; older ones are "stale".
 *
 * @param projectDir - Absolute path to project root
 * @returns Violation report partitioned into active and stale
 */
export function buildGateViolationReport(
  projectDir: string,
): GateViolationReport {
  const lastCommitAt = readLastCommitTimestamp(projectDir);
  const allViolations = readViolationsFile(projectDir);

  if (lastCommitAt === null) {
    return { active: allViolations, stale: [], lastCommitAt: null };
  }

  const lastCommitMs = new Date(lastCommitAt).getTime();
  const active: GateViolation[] = [];
  const stale: GateViolation[] = [];

  for (const v of allViolations) {
    const violationMs = new Date(v.timestamp).getTime();
    if (isNaN(violationMs) || violationMs > lastCommitMs) {
      active.push(v);
    } else {
      stale.push(v);
    }
  }

  return { active, stale, lastCommitAt };
}

// ── File readers ────────────────────────────────────────────────────────

/**
 * Read and parse the gate-violations.jsonl file.
 * Returns an empty array when the file is absent or unreadable.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of parsed gate violations
 */
export function readViolationsFile(
  projectDir: string,
): ReadonlyArray<GateViolation> {
  const filePath = join(projectDir, ".forgecraft", "gate-violations.jsonl");
  if (!existsSync(filePath)) return [];

  try {
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          return {
            hook: String(parsed["hook"] ?? "unknown"),
            severity: String(parsed["severity"] ?? "error"),
            message: String(parsed["message"] ?? ""),
            timestamp: String(parsed["timestamp"] ?? ""),
          };
        } catch {
          return null;
        }
      })
      .filter((v): v is GateViolation => v !== null);
  } catch {
    return [];
  }
}

/**
 * Get the ISO timestamp of the last git commit in the project.
 * Returns null when .git is absent or git is unavailable.
 *
 * @param projectDir - Absolute path to project root
 * @returns ISO 8601 timestamp string or null
 */
function readLastCommitTimestamp(projectDir: string): string | null {
  if (!existsSync(join(projectDir, ".git"))) return null;
  try {
    const raw = execSync("git log -1 --format=%cI", {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

// ── Formatter ───────────────────────────────────────────────────────────

/**
 * Format a GateViolationReport as a human-readable markdown block.
 *
 * @param report - The violation report to format
 * @returns Formatted markdown text
 */
export function formatGateViolationReport(report: GateViolationReport): string {
  if (report.active.length === 0 && report.stale.length === 0) {
    return "## Gate Violations\n\nNo violations recorded. Last commit gate was clean.";
  }

  const lines: string[] = ["## Gate Violations"];
  if (report.lastCommitAt) {
    lines.push(`_Last commit: ${report.lastCommitAt}_`);
  }
  lines.push("");

  if (report.active.length > 0) {
    lines.push(
      `### ❌ Active (${report.active.length}) — from after last commit`,
    );
    for (const v of report.active) {
      lines.push(`- **${v.hook}** [${v.severity}]: ${v.message}`);
      lines.push(`  _${v.timestamp}_`);
    }
    lines.push("");
  }

  if (report.stale.length > 0) {
    lines.push(
      `### ⚪ Stale (${report.stale.length}) — cleared by last commit`,
    );
    for (const v of report.stale) {
      lines.push(`- ~~${v.hook}~~: ${v.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
