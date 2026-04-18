/**
 * Tests for src/analyzers/scorers/executable-scorer.ts
 *
 * Validates harness evidence scoring and evidence line generation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreExecutable } from "../../src/analyzers/scorers/executable-scorer.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `executable-scorer-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

function writeHarnessRun(
  dir: string,
  data: {
    passed: number;
    failed: number;
    errors?: number;
    notFound?: number;
    results?: Array<{ ucId: string; status: string; durationMs: number }>;
  },
): void {
  write(
    dir,
    ".forgecraft/harness-run.json",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      passed: data.passed,
      failed: data.failed,
      errors: data.errors ?? 0,
      notFound: data.notFound ?? 0,
      results: data.results ?? [],
    }),
  );
}

function writeUseCases(dir: string, count: number): void {
  const lines = ["# Use Cases", ""];
  for (let i = 1; i <= count; i++) {
    const id = String(i).padStart(3, "0");
    lines.push(`## UC-${id}: Use Case ${i}`, "", "---", "");
  }
  write(dir, "docs/use-cases.md", lines.join("\n"));
}

// ── Suite ──────────────────────────────────────────────────────────────

describe("scoreExecutable", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns score 0 when tests did not pass", () => {
    const result = scoreExecutable(tempDir, false);
    expect(result.score).toBe(0);
    expect(result.evidence).toContain(
      "Tests did not pass — implementation does not satisfy its behavioral contracts at runtime",
    );
  });

  it("returns score 1 when tests pass but no CI or harness", () => {
    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(1);
  });

  it("returns score 1 and no-harness hint when no harness-run.json", () => {
    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(1);
    const evidenceStr = result.evidence.join(" ");
    expect(evidenceStr).toContain("No harness-run.json found");
    expect(evidenceStr).toContain("run_harness");
  });

  it("returns score 2 when CI is configured", () => {
    mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(tempDir, ".github", "workflows", "ci.yml"), "name: CI");
    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(2);
    expect(result.evidence.join(" ")).toContain("CI pipeline");
  });

  it("returns score 2 when harness-run.json has ≥1 pass and ≥50% coverage", () => {
    writeUseCases(tempDir, 2);
    writeHarnessRun(tempDir, {
      passed: 1,
      failed: 1,
      results: [
        { ucId: "UC-001", status: "pass", durationMs: 100 },
        { ucId: "UC-002", status: "fail", durationMs: 200 },
      ],
    });

    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(2);
    expect(result.evidence.join(" ")).toContain("harness execution evidence");
  });

  it("returns score 2 when all UCs pass (100% coverage)", () => {
    writeUseCases(tempDir, 3);
    writeHarnessRun(tempDir, {
      passed: 3,
      failed: 0,
      results: [
        { ucId: "UC-001", status: "pass", durationMs: 100 },
        { ucId: "UC-002", status: "pass", durationMs: 100 },
        { ucId: "UC-003", status: "pass", durationMs: 100 },
      ],
    });

    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(2);
    const evidenceStr = result.evidence.join(" ");
    expect(evidenceStr).toContain("100% L2 coverage");
    expect(evidenceStr).toContain("behavioral contracts verified");
  });

  it("returns score 1 when harness has 0 passing probes", () => {
    writeUseCases(tempDir, 4);
    writeHarnessRun(tempDir, {
      passed: 0,
      failed: 2,
      notFound: 2,
      results: [],
    });

    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(1);
  });

  it("returns score 1 when harness coverage is below 50%", () => {
    // 1 pass out of 10 UCs = 10% coverage
    writeUseCases(tempDir, 10);
    writeHarnessRun(tempDir, {
      passed: 1,
      failed: 0,
      notFound: 9,
      results: [{ ucId: "UC-001", status: "pass", durationMs: 100 }],
    });

    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(1);
    const evidenceStr = result.evidence.join(" ");
    expect(evidenceStr).toContain("10% L2 coverage");
  });

  it("includes coverage percentage in evidence line", () => {
    writeUseCases(tempDir, 4);
    writeHarnessRun(tempDir, {
      passed: 2,
      failed: 2,
      results: [
        { ucId: "UC-001", status: "pass", durationMs: 100 },
        { ucId: "UC-002", status: "pass", durationMs: 100 },
        { ucId: "UC-003", status: "fail", durationMs: 100 },
        { ucId: "UC-004", status: "fail", durationMs: 100 },
      ],
    });

    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(2);
    const evidenceStr = result.evidence.join(" ");
    expect(evidenceStr).toContain("50% L2 coverage");
  });

  it("returns score 2 from verification-state.json with passed steps", () => {
    write(
      tempDir,
      ".forgecraft/verification-state.json",
      JSON.stringify({
        aggregate_s: 0.9,
        summary: [{ passedSteps: 3 }],
      }),
    );

    const result = scoreExecutable(tempDir, true);
    expect(result.score).toBe(2);
    expect(result.evidence.join(" ")).toContain("verification-state.json");
  });

  it("property name is 'executable'", () => {
    const result = scoreExecutable(tempDir, true);
    expect(result.property).toBe("executable");
  });
});
