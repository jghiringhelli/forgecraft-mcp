import { describe, it, expect } from "vitest";
import { scoreVerifiable } from "../../../src/analyzers/scorers/verifiable-scorer.js";
import type { MissingTestFile } from "../../../src/shared/types.js";

function missing(src: string, expected: string): MissingTestFile {
  return { sourceFile: src, expectedTestFile: expected };
}

const testFiles = ["tests/tools/audit.test.ts", "tests/shared/errors.test.ts"];
const sourceFiles = [
  "src/tools/audit.ts",
  "src/tools/refresh.ts",
  "src/shared/errors.ts",
];
const allFiles = [...testFiles, ...sourceFiles];

describe("score 0 — no tests", () => {
  it("returns score 0 when no test files exist", () => {
    const result = scoreVerifiable(true, [], sourceFiles);
    expect(result.score).toBe(0);
    expect(result.property).toBe("verifiable");
    expect(result.evidence[0]).toMatch(/No test files found/);
  });

  it("returns score 2 when only test files exist (no source to miss)", () => {
    // sourceCount=0 → missingPct=0 (guarded) → should score 2 if tests pass
    // Kills: ConditionalExpression L28 (sourceCount>0→true makes 0/0=NaN, NaN≤0.2=false → score 1)
    const result = scoreVerifiable(true, [], ["tests/foo.test.ts"]);
    expect(result.score).toBe(2);
  });
});

describe("score 1 — tests exist but coverage or pass is insufficient", () => {
  it("returns score 1 when tests fail even with good coverage", () => {
    const result = scoreVerifiable(false, [], allFiles);
    expect(result.score).toBe(1);
    expect(result.evidence.some((e) => e.includes("did not pass"))).toBe(true);
  });

  it("returns score 1 when coverage is below 80%", () => {
    const manyMissing = Array.from({ length: 10 }, (_, i) =>
      missing(`src/tools/tool${i}.ts`, `tests/tools/tool${i}.test.ts`),
    );
    const bigSourceSet = [...allFiles, ...manyMissing.map((m) => m.sourceFile)];
    const result = scoreVerifiable(true, manyMissing, bigSourceSet);
    expect(result.score).toBe(1);
    expect(
      result.evidence.some((e) => e.includes("module(s) without tests")),
    ).toBe(true);
  });

  it("includes missing count in evidence", () => {
    const manyMissing = Array.from({ length: 5 }, (_, i) =>
      missing(`src/m${i}.ts`, `tests/m${i}.test.ts`),
    );
    const bigSourceSet = [...allFiles, ...manyMissing.map((m) => m.sourceFile)];
    const result = scoreVerifiable(true, manyMissing, bigSourceSet);
    expect(result.evidence.some((e) => e.includes("5"))).toBe(true);
  });
});

describe("score 2 — tests pass and coverage ≥ 80%", () => {
  it("returns score 2 when all tests pass and no missing files", () => {
    const result = scoreVerifiable(true, [], allFiles);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/Tests passed/);
    expect(result.evidence[1]).toMatch(/100%/);
  });

  it("returns score 2 when missing ≤ 20% of source modules", () => {
    // 10 source, 1 missing = 90% coverage → score 2
    const sources = Array.from({ length: 10 }, (_, i) => `src/m${i}.ts`);
    const tests = Array.from({ length: 9 }, (_, i) => `tests/m${i}.test.ts`);
    const oneM = [missing("src/m9.ts", "tests/m9.test.ts")];
    const result = scoreVerifiable(true, oneM, [...sources, ...tests]);
    expect(result.score).toBe(2);
  });

  it("returns score 2 when exactly 20% missing (boundary — ≤ not <)", () => {
    // 5 source, 1 missing = 20% exactly → score 2 (kills EqualityOperator L31: <= vs <)
    const sources = Array.from({ length: 5 }, (_, i) => `src/m${i}.ts`);
    const tests = Array.from({ length: 4 }, (_, i) => `tests/m${i}.test.ts`);
    const oneM = [missing("src/m4.ts", "tests/m4.test.ts")];
    const result = scoreVerifiable(true, oneM, [...sources, ...tests]);
    expect(result.score).toBe(2);
  });

  it("returns score 1 when exactly 21% missing", () => {
    // 10 source, 3 missing = 70% → below threshold
    const sources = Array.from({ length: 10 }, (_, i) => `src/m${i}.ts`);
    const tests = Array.from({ length: 7 }, (_, i) => `tests/m${i}.test.ts`);
    const missing3 = Array.from({ length: 3 }, (_, i) =>
      missing(`src/m${7 + i}.ts`, `tests/m${7 + i}.test.ts`),
    );
    const result = scoreVerifiable(true, missing3, [...sources, ...tests]);
    expect(result.score).toBe(1);
  });
});

describe("evidence content", () => {
  it("evidence[0] is test-file count when score is 1 (not empty array)", () => {
    // Kills ArrayDeclaration L38: if evidence starts as [], first push would be "did not pass"
    const result = scoreVerifiable(false, [], allFiles);
    expect(result.evidence[0]).toMatch(/test file\(s\) found/);
  });

  it("coveredPct uses (1 - missingPct), not (1 + missingPct)", () => {
    // 4 source, 2 missing = 50% missing → coveredPct=50%, not 150%
    // Kills ArithmeticOperator L29
    const sources = Array.from({ length: 4 }, (_, i) => `src/m${i}.ts`);
    const tests = Array.from({ length: 2 }, (_, i) => `tests/m${i}.test.ts`);
    const twoM = Array.from({ length: 2 }, (_, i) =>
      missing(`src/m${2 + i}.ts`, `tests/m${2 + i}.test.ts`),
    );
    const result = scoreVerifiable(true, twoM, [...sources, ...tests]);
    expect(result.evidence.some((e) => e.includes("50%"))).toBe(true);
    expect(result.evidence.every((e) => !e.includes("150%"))).toBe(true);
  });

  it("test files are excluded from sourceCount (not double-counted as source)", () => {
    // 4 source files, 1 missing = 25% → score 1
    // If test files counted as source: 4+1=5 files, 1 missing = 20% → score 2
    // Kills BooleanLiteral L24: !isTestOrFixtureFile(f) → !false
    const sources = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"];
    const oneTest = ["tests/a.test.ts"];
    const oneM = [missing("src/d.ts", "tests/d.test.ts")];
    const result = scoreVerifiable(true, oneM, [...sources, ...oneTest]);
    expect(result.score).toBe(1);
  });
});
