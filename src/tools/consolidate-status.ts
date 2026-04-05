/**
 * consolidate_status tool.
 *
 * Produces a compact, structured project state snapshot — cascade score,
 * roadmap progress, recent git activity, and Status.md summary — in one call.
 * Closes the session drift gap: every session prompt starts with current state
 * rather than stale spec state.
 */

import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { runCascadeChecks, loadCascadeDecisions } from "./check-cascade.js";
import {
  parseRoadmapItems,
  findNextRoadmapItem,
  deriveTestCommand,
} from "./close-cycle.js";
import { buildGateViolationReport } from "./gate-violations.js";
import type { ToolResult } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const consolidateStatusSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
});

export type ConsolidateStatusInput = z.infer<typeof consolidateStatusSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface ConsolidatedStatus {
  /** ISO timestamp of when the snapshot was taken */
  readonly generatedAt: string;
  /** X/Y required cascade steps passing */
  readonly cascadeScore: {
    readonly passing: number;
    readonly required: number;
  };
  /** Human-readable cascade lines, e.g. "✅ functional_spec" */
  readonly cascadeLines: ReadonlyArray<string>;
  /** Roadmap progress */
  readonly roadmap: {
    readonly total: number;
    readonly done: number;
    readonly nextId: string | null;
    readonly nextTitle: string | null;
  } | null;
  /** Last N git commit subjects */
  readonly recentCommits: ReadonlyArray<string>;
  /** Uncommitted changed files (M/A/D prefix) */
  readonly uncommittedFiles: ReadonlyArray<string>;
  /** Detected test command */
  readonly testCommand: string | null;
  /** Count of active gate violations (newer than last commit) */
  readonly activeViolationCount: number;
  /** Summary of active violations for prompt embedding */
  readonly activeViolationSummary: ReadonlyArray<string>;
  /** Last section of Status.md, truncated */
  readonly statusSummary: string;
}

// ── Handler ───────────────────────────────────────────────────────────

/**
 * Produce a live project state snapshot and return it as a text block.
 *
 * @param args - Validated input
 * @returns MCP-style tool result with formatted snapshot text
 */
export async function consolidateStatusHandler(
  args: ConsolidateStatusInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const snapshot = buildConsolidatedStatus(projectDir);
  return {
    content: [{ type: "text", text: formatConsolidatedStatus(snapshot) }],
  };
}

// ── Core builder ──────────────────────────────────────────────────────

/**
 * Build a ConsolidatedStatus snapshot from the project directory.
 * All reads are non-throwing — missing artifacts produce empty/null fields.
 *
 * @param projectDir - Absolute path to project root
 * @returns Structured project state snapshot
 */
export function buildConsolidatedStatus(
  projectDir: string,
): ConsolidatedStatus {
  const violationReport = buildGateViolationReport(projectDir);
  return {
    generatedAt: new Date().toISOString(),
    ...readCascadeStatus(projectDir),
    roadmap: readRoadmapProgress(projectDir),
    recentCommits: readRecentCommits(projectDir, 5),
    uncommittedFiles: readUncommittedFiles(projectDir, 10),
    testCommand: deriveTestCommand(projectDir) ?? null,
    activeViolationCount: violationReport.active.length,
    activeViolationSummary: violationReport.active.map(
      (v) => `${v.hook}: ${v.message}`,
    ),
    statusSummary: readStatusTail(projectDir),
  };
}

// ── Section readers ───────────────────────────────────────────────────

/**
 * Read cascade pass/fail status from the project.
 * Returns unconfigured (required: 0) when no forgecraft.yaml is present.
 * SKIP steps are treated as optional (not counted in required total).
 */
function readCascadeStatus(
  projectDir: string,
): Pick<ConsolidatedStatus, "cascadeScore" | "cascadeLines"> {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) {
    return { cascadeScore: { passing: 0, required: 0 }, cascadeLines: [] };
  }
  try {
    const decisions = loadCascadeDecisions(projectDir);
    const steps = runCascadeChecks(projectDir, decisions);
    // SKIP status means the step was explicitly marked non-required via a decision.
    const requiredSteps = steps.filter((s) => s.status !== "SKIP");
    const passing = requiredSteps.filter((s) => s.status === "PASS").length;
    const cascadeLines = steps.map((s) => {
      const isOptional = s.status === "SKIP";
      const icon = s.status === "PASS" ? "✅" : isOptional ? "⚠️ " : "❌";
      const suffix = isOptional ? " (optional)" : "";
      return `${icon} ${s.name}${suffix}`;
    });
    return {
      cascadeScore: { passing, required: requiredSteps.length },
      cascadeLines,
    };
  } catch {
    return { cascadeScore: { passing: 0, required: 0 }, cascadeLines: [] };
  }
}

/**
 * Read roadmap progress: total items, done count, next unblocked item.
 */
function readRoadmapProgress(
  projectDir: string,
): ConsolidatedStatus["roadmap"] {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return null;
  try {
    const content = readFileSync(roadmapPath, "utf-8");
    const items = parseRoadmapItems(content);
    if (items.length === 0) return null;
    const done = items.filter((i) => i.status === "done").length;
    const next = findNextRoadmapItem(projectDir);
    return {
      total: items.length,
      done,
      nextId: next?.id ?? null,
      nextTitle: next?.title ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Read the last N git commit subjects from the project directory.
 * Returns empty array when git is unavailable or directory is not a repo.
 */
export function readRecentCommits(
  projectDir: string,
  count: number,
): ReadonlyArray<string> {
  if (!existsSync(join(projectDir, ".git"))) return [];
  try {
    const raw = execSync(`git log --oneline -${count}`, {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return raw.length === 0
      ? []
      : raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

/**
 * Read uncommitted changed files (staged + unstaged), up to maxFiles.
 * Returns empty array when git is unavailable.
 */
export function readUncommittedFiles(
  projectDir: string,
  maxFiles: number,
): ReadonlyArray<string> {
  if (!existsSync(join(projectDir, ".git"))) return [];
  try {
    const raw = execSync("git status --porcelain", {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    if (raw.length === 0) return [];
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, maxFiles);
  } catch {
    return [];
  }
}

/**
 * Read the tail of Status.md, truncated to the last 600 characters.
 */
function readStatusTail(projectDir: string): string {
  const statusPath = join(projectDir, "Status.md");
  if (!existsSync(statusPath)) return "(not found)";
  try {
    const content = readFileSync(statusPath, "utf-8");
    return content.length > 600 ? `…\n${content.slice(-600)}` : content;
  } catch {
    return "(unreadable)";
  }
}

// ── Formatter ─────────────────────────────────────────────────────────

/**
 * Format a ConsolidatedStatus snapshot as a human-readable markdown block.
 *
 * @param snapshot - The structured snapshot to format
 * @returns Formatted markdown text
 */
export function formatConsolidatedStatus(snapshot: ConsolidatedStatus): string {
  const lines: string[] = [
    "## Project Status Snapshot",
    `_Generated: ${snapshot.generatedAt}_`,
    "",
  ];

  // Cascade
  const { passing, required } = snapshot.cascadeScore;
  const cascadeLabel =
    required === 0 ? "unconfigured" : `${passing}/${required} required`;
  lines.push(`### Cascade: ${cascadeLabel}`);
  for (const line of snapshot.cascadeLines) {
    lines.push(`- ${line}`);
  }
  lines.push("");

  // Roadmap
  if (snapshot.roadmap) {
    const { done, total, nextId, nextTitle } = snapshot.roadmap;
    lines.push(`### Roadmap: ${done}/${total} done`);
    if (nextId && nextTitle) {
      lines.push(`Next: **${nextId}** — ${nextTitle}`);
    } else if (done === total) {
      lines.push("All items complete — ready for hardening.");
    } else {
      lines.push("No unblocked items — check dependencies.");
    }
    lines.push("");
  }

  // Recent commits
  if (snapshot.recentCommits.length > 0) {
    lines.push("### Recent commits");
    for (const commit of snapshot.recentCommits) {
      lines.push(`- ${commit}`);
    }
    lines.push("");
  }

  // Uncommitted changes
  if (snapshot.uncommittedFiles.length > 0) {
    lines.push("### Uncommitted changes");
    for (const file of snapshot.uncommittedFiles) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  // Test command
  if (snapshot.testCommand) {
    lines.push(`### Test command: \`${snapshot.testCommand}\``);
    lines.push("");
  }

  // Gate violations
  if (snapshot.activeViolationCount > 0) {
    lines.push(
      `### ⚠️ Gate Violations: ${snapshot.activeViolationCount} active`,
    );
    for (const summary of snapshot.activeViolationSummary) {
      lines.push(`- ${summary}`);
    }
    lines.push("");
  }

  // Status.md
  lines.push("### Status.md");
  lines.push("```");
  lines.push(snapshot.statusSummary);
  lines.push("```");

  return lines.join("\n");
}
