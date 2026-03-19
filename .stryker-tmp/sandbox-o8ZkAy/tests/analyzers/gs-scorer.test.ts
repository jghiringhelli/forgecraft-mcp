/**
 * Smoke tests for gs-scorer — primary coverage lives in tests/tools/verify.test.ts.
 */
// @ts-nocheck

import { describe, it, expect } from "vitest";
import { resolve, join } from "node:path";
import {
  scoreGsProperties,
  findMissingTestFiles,
} from "../../src/analyzers/gs-scorer.js";

const CLEAN_DIR = resolve("tests/fixtures/verify-clean-project");

describe("scoreGsProperties", () => {
  it("returns a score array with 7 GS properties", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    expect(scores).toHaveLength(7);
  });

  it("each property score has name, score 0-2, and evidence array", () => {
    const scores = scoreGsProperties(CLEAN_DIR, true, [], []);
    for (const s of scores) {
      expect(s.property).toBeTruthy();
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(2);
      expect(Array.isArray(s.evidence)).toBe(true);
    }
  });

  it("layer violations reduce bounded score", () => {
    const clean = scoreGsProperties(CLEAN_DIR, true, [], []);
    const violations = [
      { file: "routes/foo.ts", line: 1, snippet: "prisma.user.findMany()" },
    ];
    const withViolation = scoreGsProperties(CLEAN_DIR, true, violations, []);
    const boundedClean = clean.find((s) => s.property === "bounded")!.score;
    const boundedDirty = withViolation.find(
      (s) => s.property === "bounded",
    )!.score;
    expect(boundedDirty).toBeLessThanOrEqual(boundedClean);
  });
});

describe("findMissingTestFiles", () => {
  it("returns an array (may be empty for well-tested fixtures)", () => {
    const missing = findMissingTestFiles(CLEAN_DIR);
    expect(Array.isArray(missing)).toBe(true);
  });
});
