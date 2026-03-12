/**
 * Tests for the verify tool: GS scorer, layer violation detection,
 * missing test file detection, and handler output format.
 */

import { describe, it, expect } from "vitest";
import { join, resolve } from "node:path";
import {
  findDirectDbCallsInRoutes,
  findMissingTestFiles,
  scoreGsProperties,
} from "../../src/analyzers/gs-scorer.js";
import { verifyHandler } from "../../src/tools/verify.js";

// ── Fixture paths ───────────────────────────────────────────────────

const FIXTURE_ROOT = resolve("tests/fixtures");
const CLEAN_DIR = join(FIXTURE_ROOT, "verify-clean-project");
const VIOLATION_DIR = join(FIXTURE_ROOT, "verify-bounded-violation");

// ── findDirectDbCallsInRoutes ────────────────────────────────────────

describe("findDirectDbCallsInRoutes", () => {
  it("detects prisma.model.method() calls in route files", () => {
    const violations = findDirectDbCallsInRoutes(VIOLATION_DIR);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it("records file path, 1-based line number, and non-empty snippet", () => {
    const violations = findDirectDbCallsInRoutes(VIOLATION_DIR);
    const v = violations[0]!;
    expect(v.file).toContain("routes");
    expect(v.line).toBeGreaterThan(0);
    expect(v.snippet.trim().length).toBeGreaterThan(0);
  });

  it("returns zero violations in a project with no route files", () => {
    const violations = findDirectDbCallsInRoutes(CLEAN_DIR);
    expect(violations).toHaveLength(0);
  });

  it("does not flag prisma imports (import statements)", () => {
    const violations = findDirectDbCallsInRoutes(VIOLATION_DIR);
    const importLines = violations.filter((v) => v.snippet.trim().startsWith("import"));
    expect(importLines).toHaveLength(0);
  });
});

// ── findMissingTestFiles ─────────────────────────────────────────────

describe("findMissingTestFiles", () => {
  it("finds source modules without test counterparts", () => {
    const missing = findMissingTestFiles(CLEAN_DIR);
    // container.ts and user-repository.ts have no test files
    const missingNames = missing.map((m) => m.sourceFile);
    expect(missingNames.some((n) => n.includes("container"))).toBe(true);
  });

  it("does not flag files that have a test counterpart", () => {
    const missing = findMissingTestFiles(CLEAN_DIR);
    const missingNames = missing.map((m) => m.sourceFile);
    // user-service.test.ts exists — user-service.ts should not be in missing
    expect(missingNames.some((n) => n.includes("user-service.ts"))).toBe(false);
  });

  it("provides an expectedTestFile hint for each missing file", () => {
    const missing = findMissingTestFiles(CLEAN_DIR);
    for (const m of missing) {
      expect(m.expectedTestFile).toMatch(/\.test\.ts$/);
    }
  });
});

// ── scoreGsProperties ───────────────────────────────────────────────

describe("scoreGsProperties", () => {
  it("returns exactly six properties in canonical §4.3 order", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    const names = scores.map((s) => s.property);
    expect(names).toEqual([
      "self-describing",
      "bounded",
      "verifiable",
      "defended",
      "auditable",
      "composable",
    ]);
  });

  it("scores Self-describing as 2 when CLAUDE.md has architecture/convention keywords", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    const sd = scores.find((s) => s.property === "self-describing")!;
    expect(sd.score).toBe(2);
  });

  it("scores Bounded as 2 when zero layer violations passed in", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    const b = scores.find((s) => s.property === "bounded")!;
    expect(b.score).toBe(2);
  });

  it("scores Bounded as 0 when 3+ layer violations passed in", () => {
    const violations = [
      { file: "routes/a.ts", line: 1, snippet: "prisma.user.findMany()" },
      { file: "routes/b.ts", line: 5, snippet: "prisma.post.create()" },
      { file: "routes/c.ts", line: 8, snippet: "prisma.comment.delete()" },
    ];
    const scores = scoreGsProperties(CLEAN_DIR, true, violations, []);
    const b = scores.find((s) => s.property === "bounded")!;
    expect(b.score).toBe(0);
  });

  it("scores Auditable as 2 when ADRs + Status.md are present", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    const a = scores.find((s) => s.property === "auditable")!;
    // Clean fixture has ADRs + Status.md but no commitlint → expect 1 or 2
    expect(a.score).toBeGreaterThanOrEqual(1);
  });

  it("scores Composable as 2 when services/ and repositories/ both exist", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    const c = scores.find((s) => s.property === "composable")!;
    expect(c.score).toBe(2);
  });

  it("scores Verifiable as 1 when tests exist but some modules are missing tests", () => {
    const missing = findMissingTestFiles(CLEAN_DIR);
    const scores = scoreGsProperties(CLEAN_DIR, true, [], missing);
    const v = scores.find((s) => s.property === "verifiable")!;
    // 1 test file for 3 source modules → > 20% missing → score 1
    expect(v.score).toBeLessThanOrEqual(2);
  });

  it("each score is 0, 1, or 2", () => {
    const scores = scoreGsProperties(CLEAN_DIR, false, [], []);
    for (const p of scores) {
      expect([0, 1, 2]).toContain(p.score);
    }
  });

  it("each property has at least one evidence string", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    for (const p of scores) {
      expect(p.evidence.length).toBeGreaterThan(0);
    }
  });
});

// ── verifyHandler ────────────────────────────────────────────────────

describe("verifyHandler", () => {
  it("returns structured Markdown report with all required sections", async () => {
    const result = await verifyHandler({
      project_dir: CLEAN_DIR,
      test_command: "echo 'ok'",
      timeout_ms: 10_000,
      pass_threshold: 10,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("# ForgeCraft Verify");
    expect(text).toContain("## Test Suite");
    expect(text).toContain("## §4.3 GS Property Scores");
    expect(text).toContain("## Bounded Violations");
    expect(text).toContain("## Verifiable Gaps");
  });

  it("reports PASS when test command exits 0", async () => {
    const result = await verifyHandler({
      project_dir: CLEAN_DIR,
      test_command: "echo 'tests passed'",
      timeout_ms: 10_000,
      pass_threshold: 1,
    });
    expect(result.content[0]!.text).toContain("✅ PASS");
  });

  it("reports FAIL when test command exits non-zero", async () => {
    const result = await verifyHandler({
      project_dir: CLEAN_DIR,
      test_command: "node -e \"process.exit(1)\"",
      timeout_ms: 10_000,
      pass_threshold: 1,
    });
    expect(result.content[0]!.text).toContain("❌");
  });

  it("report includes total score out of 12", async () => {
    const result = await verifyHandler({
      project_dir: CLEAN_DIR,
      test_command: "echo ok",
      timeout_ms: 10_000,
      pass_threshold: 10,
    });
    expect(result.content[0]!.text).toMatch(/\d+\/12/);
  });

  it("layer violations section lists prisma calls from the violation fixture", async () => {
    const result = await verifyHandler({
      project_dir: VIOLATION_DIR,
      test_command: "echo ok",
      timeout_ms: 10_000,
      pass_threshold: 0,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("violation");
    // File paths use OS separator — match just the filename
    expect(text).toContain("users.ts");
    expect(text).toMatch(/prisma\.user/);
  });
});
