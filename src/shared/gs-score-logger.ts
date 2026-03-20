/**
 * GS Score Logger — appends per-loop S_realized measurement rows to docs/gs-score.md.
 *
 * S_realized (§9.4 of GS White Paper):
 *   S_realized = passedSteps / (totalSteps - skippedSteps)
 *
 * PASS and WARN count as passed. SKIP is excluded from both numerator and
 * denominator. FAIL and STUB count as failed (in denominator only).
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { CascadeStep } from "../tools/check-cascade.js";
import type { GsPropertyScore } from "./types.js";

// ── Constants ────────────────────────────────────────────────────────

const GS_SCORE_FILE = "docs/gs-score.md";

const GS_SCORE_HEADER = `# GS Score Log

Tracks S_realized and GS property scores per loop.

| date | loop | roadmap_item | s_realized | self-describing | bounded | verifiable | defended | auditable | composable | executable |
|------|------|--------------|------------|-----------------|---------|-----------|----------|-----------|-----------|-----------|
`;

const GS_PROPERTY_ORDER = [
  "self-describing",
  "bounded",
  "verifiable",
  "defended",
  "auditable",
  "composable",
  "executable",
] as const;

// ── Public Types ─────────────────────────────────────────────────────

export interface GsScoreRowOptions {
  readonly projectDir: string;
  readonly loop: number;
  readonly roadmapItemId?: string;
  readonly sRealized: number;
  readonly propertyScores: ReadonlyArray<GsPropertyScore>;
}

// ── Public Functions ─────────────────────────────────────────────────

/**
 * Compute S_realized from cascade steps per GS White Paper §9.4.
 *
 * PASS and WARN count as passed. SKIP is excluded from both numerator and
 * denominator. FAIL and STUB count as failed (in denominator only).
 * Returns 0 when there are no non-skipped steps.
 *
 * @param steps - Array of cascade steps from a completed cascade run
 * @returns S_realized score in range 0.0–1.0
 */
export function computeSRealized(steps: readonly CascadeStep[]): number {
  const nonSkipped = steps.filter((s) => s.status !== "SKIP");
  if (nonSkipped.length === 0) return 0;

  const passed = nonSkipped.filter(
    (s) => s.status === "PASS" || s.status === "WARN",
  ).length;

  return passed / nonSkipped.length;
}

/**
 * Append one measurement row to docs/gs-score.md, creating the file with
 * its header if it does not yet exist.
 *
 * @param opts - Row data including project directory, loop counter, and scores
 */
export function appendGsScoreRow(opts: GsScoreRowOptions): void {
  const { projectDir, loop, roadmapItemId, sRealized, propertyScores } = opts;

  const docsDir = join(projectDir, "docs");
  mkdirSync(docsDir, { recursive: true });

  const filePath = join(projectDir, GS_SCORE_FILE);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, GS_SCORE_HEADER, "utf-8");
  }

  const date = new Date().toISOString().split("T")[0]!;
  const roadmapColumn = roadmapItemId ?? "-";
  const sRealizedColumn = `${Math.round(sRealized * 100)}%`;

  const propertyColumns = GS_PROPERTY_ORDER.map((property) => {
    const found = propertyScores.find((p) => p.property === property);
    return found !== undefined ? `${found.score}/2` : "-";
  });

  const row = `| ${date} | ${loop} | ${roadmapColumn} | ${sRealizedColumn} | ${propertyColumns.join(" | ")} |\n`;
  appendFileSync(filePath, row, "utf-8");
}
