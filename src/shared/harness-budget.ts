/**
 * Harness budget — apply the GS Bounded property to the harness itself.
 *
 * An excess of harness degrades the context window and breaks the GS cycle:
 * the AI reads methodology instead of the task, behavior drifts within a few
 * turns, and the session stops following the cycle the harness exists to
 * protect. Field evidence: a hand-written ~200-line white-paper harness held
 * discipline; a ~2,000-line generated harness degraded fast.
 *
 * Budgets (lines — proxy for tokens at ~10 tokens/line of markdown):
 *   always-load    ≤ 160   root + constitution + corrections + status
 *   single branch  ≤ 130   any one routed file (lifecycle, routes/*, standards/*)
 *   typical task   ≤ 480   always-load + lifecycle + docs-route + 2 standards
 *   full harness   ≤ 1100  every instruction file an AI could be routed to
 *
 * `.claude/reference/` is exempt — it exists precisely so theory can live
 * outside the session context.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface HarnessBudgetReport {
  readonly alwaysLoadLines: number;
  readonly typicalTaskLines: number;
  readonly fullHarnessLines: number;
  readonly largestBranch: { readonly path: string; readonly lines: number };
  readonly violations: string[];
  readonly withinBudget: boolean;
}

export const HARNESS_BUDGET = {
  alwaysLoad: 160,
  singleBranch: 130,
  typicalTask: 480,
  fullHarness: 1100,
} as const;

function countLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  try {
    return readFileSync(filePath, "utf-8").split("\n").length;
  } catch {
    return 0;
  }
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Measure the harness context footprint and evaluate it against budget.
 *
 * @param projectRoot - Project root directory
 * @returns Report with line counts, violations, and overall verdict
 */
export function measureHarnessBudget(projectRoot: string): HarnessBudgetReport {
  const claude = (...p: string[]) => join(projectRoot, ".claude", ...p);

  // Always-load set per the CNT root's instructions
  const alwaysLoadFiles = [
    join(projectRoot, "CLAUDE.md"),
    claude("constitution.md"),
    claude("corrections.md"),
    join(projectRoot, "docs", "status.md"),
  ];
  const alwaysLoadLines = alwaysLoadFiles.reduce(
    (sum, f) => sum + countLines(f),
    0,
  );

  // All routable branches: lifecycle, routes/*, standards/*
  // (.claude/reference/ is intentionally exempt — never session-loaded)
  const branchFiles = [
    claude("lifecycle.md"),
    ...listMarkdown(claude("routes")),
    ...listMarkdown(claude("standards")),
  ].filter((f) => existsSync(f));

  let largestBranch = { path: "", lines: 0 };
  const violations: string[] = [];
  let branchTotal = 0;

  for (const file of branchFiles) {
    const lines = countLines(file);
    branchTotal += lines;
    if (lines > largestBranch.lines) {
      largestBranch = { path: relativize(projectRoot, file), lines };
    }
    if (lines > HARNESS_BUDGET.singleBranch) {
      violations.push(
        `${relativize(projectRoot, file)}: ${lines} lines (branch budget ${HARNESS_BUDGET.singleBranch})`,
      );
    }
  }

  // Typical task per Context Discipline (root: "load AT MOST one branch +
  // one standards file"): always-load + lifecycle + routes/docs + the single
  // largest standards file (worst case within the discipline).
  const standardsSizes = listMarkdown(claude("standards"))
    .map((f) => countLines(f))
    .sort((a, b) => b - a);
  const typicalTaskLines =
    alwaysLoadLines +
    countLines(claude("lifecycle.md")) +
    countLines(claude("routes", "docs.md")) +
    (standardsSizes[0] ?? 0);

  const fullHarnessLines = alwaysLoadLines + branchTotal;

  if (alwaysLoadLines > HARNESS_BUDGET.alwaysLoad) {
    violations.push(
      `always-load set: ${alwaysLoadLines} lines (budget ${HARNESS_BUDGET.alwaysLoad})`,
    );
  }
  if (typicalTaskLines > HARNESS_BUDGET.typicalTask) {
    violations.push(
      `typical task load: ${typicalTaskLines} lines (budget ${HARNESS_BUDGET.typicalTask})`,
    );
  }
  if (fullHarnessLines > HARNESS_BUDGET.fullHarness) {
    violations.push(
      `full harness: ${fullHarnessLines} lines (budget ${HARNESS_BUDGET.fullHarness})`,
    );
  }

  return {
    alwaysLoadLines,
    typicalTaskLines,
    fullHarnessLines,
    largestBranch,
    violations,
    withinBudget: violations.length === 0,
  };
}

function relativize(root: string, filePath: string): string {
  return filePath.slice(root.length).replace(/\\/g, "/").replace(/^\//, "");
}
