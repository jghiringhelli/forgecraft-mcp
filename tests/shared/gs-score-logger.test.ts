/**
 * Tests for src/shared/gs-score-logger.ts
 *
 * Covers: computeSRealized calculation rules and appendGsScoreRow file behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeSRealized,
  appendGsScoreRow,
} from "../../src/shared/gs-score-logger.js";
import type { CascadeStep } from "../../src/tools/check-cascade.js";
import type { GsPropertyScore } from "../../src/shared/types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeStep(step: number, status: CascadeStep["status"]): CascadeStep {
  return {
    step,
    name: `Step ${step}`,
    status,
    detail: "",
    questions: [],
  };
}

function makePropertyScore(
  property: GsPropertyScore["property"],
  score: 0 | 1 | 2,
): GsPropertyScore {
  return { property, score, evidence: [] };
}

// ── Suite: computeSRealized ───────────────────────────────────────────

describe("computeSRealized", () => {
  it("returns 1.0 when all steps pass", () => {
    const steps: CascadeStep[] = [
      makeStep(1, "PASS"),
      makeStep(2, "PASS"),
      makeStep(3, "PASS"),
    ];
    expect(computeSRealized(steps)).toBe(1.0);
  });

  it("returns 0.0 when all steps fail", () => {
    const steps: CascadeStep[] = [
      makeStep(1, "FAIL"),
      makeStep(2, "FAIL"),
      makeStep(3, "FAIL"),
    ];
    expect(computeSRealized(steps)).toBe(0.0);
  });

  it("excludes SKIP steps from denominator", () => {
    const steps: CascadeStep[] = [
      makeStep(1, "PASS"),
      makeStep(2, "SKIP"),
      makeStep(3, "FAIL"),
    ];
    // 1 passed / (3 total - 1 skipped) = 1/2 = 0.5
    expect(computeSRealized(steps)).toBe(0.5);
  });

  it("treats WARN as passed", () => {
    const steps: CascadeStep[] = [
      makeStep(1, "PASS"),
      makeStep(2, "WARN"),
      makeStep(3, "FAIL"),
    ];
    // 2 passed (PASS+WARN) / 3 non-skipped
    expect(computeSRealized(steps)).toBeCloseTo(2 / 3);
  });

  it("returns 0 when no non-skipped steps", () => {
    const steps: CascadeStep[] = [makeStep(1, "SKIP"), makeStep(2, "SKIP")];
    expect(computeSRealized(steps)).toBe(0);
  });

  it("returns 0 when steps array is empty", () => {
    expect(computeSRealized([])).toBe(0);
  });

  it("treats STUB as failed", () => {
    const steps: CascadeStep[] = [makeStep(1, "PASS"), makeStep(2, "STUB")];
    // 1 passed / 2 non-skipped = 0.5
    expect(computeSRealized(steps)).toBe(0.5);
  });
});

// ── Suite: appendGsScoreRow ───────────────────────────────────────────

describe("appendGsScoreRow", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gs-score-logger-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates gs-score.md with header when missing", () => {
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 1,
      sRealized: 1.0,
      propertyScores: [],
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    expect(content).toContain("# GS Score Log");
    expect(content).toContain("| date | loop | roadmap_item | s_realized |");
    expect(content).toContain("|------|");
  });

  it("appends correct row with property scores", () => {
    const scores: GsPropertyScore[] = [
      makePropertyScore("self-describing", 2),
      makePropertyScore("bounded", 1),
      makePropertyScore("verifiable", 0),
      makePropertyScore("defended", 2),
      makePropertyScore("auditable", 1),
      makePropertyScore("composable", 2),
      makePropertyScore("executable", 1),
    ];

    appendGsScoreRow({
      projectDir: tempDir,
      loop: 1,
      roadmapItemId: "RM-004",
      sRealized: 0.875,
      propertyScores: scores,
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    expect(content).toContain("| RM-004 |");
    expect(content).toContain("| 88% |");
    expect(content).toContain("| 2/2 |");
    expect(content).toContain("| 1/2 |");
    expect(content).toContain("| 0/2 |");
  });

  it("handles missing properties with dash", () => {
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 1,
      sRealized: 0.5,
      propertyScores: [makePropertyScore("self-describing", 2)],
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    const dataRow = content.split("\n").find((l) => l.startsWith("| 20"));
    expect(dataRow).toBeDefined();
    // bounded and others are missing → should show "-"
    const cells = dataRow!.split("|").map((c) => c.trim());
    // self-describing = 2/2, the rest are "-"
    expect(cells).toContain("2/2");
    expect(cells.filter((c) => c === "-").length).toBeGreaterThan(0);
  });

  it("uses dash for roadmapItemId when undefined", () => {
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 2,
      sRealized: 0.6,
      propertyScores: [],
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    const dataRow = content.split("\n").find((l) => l.startsWith("| 20"));
    expect(dataRow).toBeDefined();
    const cells = dataRow!.split("|").map((c) => c.trim());
    // roadmap_item cell (index 3) should be "-"
    expect(cells[3]).toBe("-");
  });

  it("creates docs/ directory if it does not exist", () => {
    // tempDir has no docs/ subdir yet
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 1,
      sRealized: 1.0,
      propertyScores: [],
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    expect(content).toContain("# GS Score Log");
  });

  it("appends rows on subsequent calls without duplicating header", () => {
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 1,
      sRealized: 1.0,
      propertyScores: [],
    });
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 2,
      sRealized: 0.8,
      propertyScores: [],
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    const headerCount = (content.match(/# GS Score Log/g) ?? []).length;
    expect(headerCount).toBe(1);

    const dataRows = content.split("\n").filter((l) => l.startsWith("| 20"));
    expect(dataRows).toHaveLength(2);
  });

  it("increments loop count correctly on second call", () => {
    mkdirSync(join(tempDir, "docs"), { recursive: true });

    appendGsScoreRow({
      projectDir: tempDir,
      loop: 1,
      sRealized: 1.0,
      propertyScores: [],
    });
    appendGsScoreRow({
      projectDir: tempDir,
      loop: 2,
      sRealized: 0.5,
      propertyScores: [],
    });

    const content = readFileSync(join(tempDir, "docs", "gs-score.md"), "utf-8");
    const dataRows = content.split("\n").filter((l) => l.startsWith("| 20"));

    // First row has loop=1, second has loop=2
    expect(dataRows[0]).toContain("| 1 |");
    expect(dataRows[1]).toContain("| 2 |");
    // Second row has 50% s_realized
    expect(dataRows[1]).toContain("| 50% |");
  });
});
