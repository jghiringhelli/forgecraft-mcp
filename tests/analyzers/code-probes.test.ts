/**
 * Tests for code-probes — pure-fs probes (probeLoc, probeCoverage, probeLayerViolations).
 * Tool-invocation probes (dead code, complexity, mutation) degrade gracefully when the
 * external tool is absent; those code paths are covered by the "unavailable" assertions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeLoc, probeCoverage, probeLayerViolations } from "../../src/analyzers/code-probes.js";

const TMP_DIR = join(tmpdir(), `forgecraft-test-probes-${Date.now()}`);
const SRC_DIR = join(TMP_DIR, "src");
const COVERAGE_DIR = join(TMP_DIR, "coverage");

// ── LCOV fixture ─────────────────────────────────────────────────────
const LCOV_CONTENT = `
TN:
SF:src/index.ts
FN:1,myFunction
FNF:1
FNH:1
DA:1,1
DA:2,1
DA:3,1
DA:4,0
LF:4
LH:3
BRF:2
BRH:1
end_of_record
`.trimStart();

// ── Istanbul fixture ──────────────────────────────────────────────────
const ISTANBUL_CONTENT = JSON.stringify({
  total: {
    lines: { pct: 85.5 },
    statements: { pct: 84.2 },
    functions: { pct: 90.0 },
    branches: { pct: 78.3 },
  },
});

// ── Cobertura fixture ─────────────────────────────────────────────────
const COBERTURA_CONTENT = `<?xml version="1.0" ?>
<coverage line-rate="0.82" branch-rate="0.71" version="1">
  <packages/>
</coverage>`;

beforeAll(() => {
  mkdirSync(SRC_DIR, { recursive: true });
  mkdirSync(COVERAGE_DIR, { recursive: true });
  // Write some TypeScript source files
  writeFileSync(join(SRC_DIR, "index.ts"), "export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n");
  writeFileSync(join(SRC_DIR, "utils.ts"), "export const add = (a: number, b: number) => a + b;\n\n// blank\n");
});

afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

// ── probeLoc ──────────────────────────────────────────────────────────

describe("probeLoc", () => {
  it("returns available: true for valid project directory", () => {
    const result = probeLoc(TMP_DIR);
    expect(result.available).toBe(true);
  });

  it("returns available: false for non-existent directory", () => {
    const result = probeLoc("/nonexistent/path/xyz");
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("counts .ts source files under src/", () => {
    const result = probeLoc(TMP_DIR);
    expect(result.data?.files).toBeGreaterThanOrEqual(2);
  });

  it("reports total line count greater than zero", () => {
    const result = probeLoc(TMP_DIR);
    expect(result.data?.lines).toBeGreaterThan(0);
  });

  it("reports blank line count", () => {
    const result = probeLoc(TMP_DIR);
    // utils.ts has at least one blank line
    expect(result.data?.blankLines).toBeGreaterThanOrEqual(1);
  });

  it("reports byExtension breakdown", () => {
    const result = probeLoc(TMP_DIR);
    expect(result.data?.byExtension).toBeDefined();
    expect(result.data?.byExtension[".ts"]).toBeDefined();
    expect(result.data?.byExtension[".ts"]?.files).toBeGreaterThanOrEqual(2);
  });

  it("detects typescript as language for TypeScript project", () => {
    const result = probeLoc(TMP_DIR);
    expect(result.data?.language).toBe("typescript");
  });

  it("skips node_modules and dist directories", () => {
    const nodeModsDir = join(TMP_DIR, "node_modules", "some-pkg");
    mkdirSync(nodeModsDir, { recursive: true });
    writeFileSync(join(nodeModsDir, "index.ts"), Array.from({ length: 500 }, () => "x").join("\n"));

    const result = probeLoc(TMP_DIR);
    // File count should not include the node_modules file
    const extData = result.data?.byExtension[".ts"];
    expect(extData?.files).toBeLessThan(100);
  });
});

// ── probeCoverage ─────────────────────────────────────────────────────

describe("probeCoverage", () => {
  describe("with no coverage report", () => {
    it("returns available: false when no report exists", () => {
      const empty = join(TMP_DIR, "empty-cov");
      mkdirSync(empty, { recursive: true });
      const result = probeCoverage(TMP_DIR, empty);
      expect(result.available).toBe(false);
      expect(result.installHint).toBeDefined();
      expect(result.installHint).toContain("coverage");
    });
  });

  describe("LCOV format", () => {
    it("parses lcov.info and returns line/branch/function percentages", () => {
      writeFileSync(join(COVERAGE_DIR, "lcov.info"), LCOV_CONTENT);
      const result = probeCoverage(TMP_DIR);
      expect(result.available).toBe(true);
      expect(result.data?.reportFormat).toBe("lcov");
      expect(result.data?.lines).toBeCloseTo(75, 0); // 3/4 = 75%
      expect(result.data?.branches).toBeCloseTo(50, 0); // 1/2 = 50%
      expect(result.data?.functions).toBe(100); // 1/1 = 100%
    });

    it("reports the lcov file path", () => {
      const result = probeCoverage(TMP_DIR);
      expect(result.data?.reportPath).toContain("lcov.info");
    });
  });

  describe("Istanbul JSON format", () => {
    it("parses coverage-summary.json when lcov is absent", () => {
      const altDir = join(TMP_DIR, "istanbul-cov");
      mkdirSync(altDir, { recursive: true });
      writeFileSync(join(altDir, "coverage-summary.json"), ISTANBUL_CONTENT);
      const result = probeCoverage(TMP_DIR, altDir);
      expect(result.available).toBe(true);
      expect(result.data?.reportFormat).toBe("istanbul");
      expect(result.data?.lines).toBeCloseTo(85.5, 1);
      expect(result.data?.functions).toBeCloseTo(90.0, 1);
    });
  });

  describe("Cobertura XML format", () => {
    it("parses cobertura.xml when lcov and istanbul are absent", () => {
      const altDir = join(TMP_DIR, "cobertura-cov");
      mkdirSync(altDir, { recursive: true });
      writeFileSync(join(altDir, "cobertura.xml"), COBERTURA_CONTENT);
      const result = probeCoverage(TMP_DIR, altDir);
      expect(result.available).toBe(true);
      expect(result.data?.reportFormat).toBe("cobertura");
      expect(result.data?.lines).toBeCloseTo(82, 0);
      expect(result.data?.branches).toBeCloseTo(71, 0);
    });
  });
});

// ── probeLayerViolations ──────────────────────────────────────────────

describe("probeLayerViolations", () => {
  it("returns available: true always (pure-fs fallback)", () => {
    const result = probeLayerViolations(TMP_DIR);
    expect(result.available).toBe(true);
  });

  it("returns zero violations for project with no route directories", () => {
    const result = probeLayerViolations(TMP_DIR);
    expect(result.data?.violations).toBe(0);
    expect(result.data?.source).toBe("internal");
  });

  it("detects DB import in routes/ directory", () => {
    const routesDir = join(TMP_DIR, "src", "routes");
    mkdirSync(routesDir, { recursive: true });
    writeFileSync(
      join(routesDir, "user-routes.ts"),
      "import { PrismaClient } from '@prisma/client';\nexport {};\n",
    );
    const result = probeLayerViolations(TMP_DIR);
    expect(result.data?.violations).toBeGreaterThanOrEqual(1);
    expect(result.data?.details.some((d) => d.includes("user-routes.ts"))).toBe(true);
  });

  it("does not report violations outside route directories", () => {
    const repoDir = join(TMP_DIR, "src", "repositories");
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, "user-repo.ts"),
      "import { PrismaClient } from '@prisma/client';\nexport {};\n",
    );
    // A repository dir importing DB client is correct — should not be flagged
    const result = probeLayerViolations(TMP_DIR);
    const repoViolations = result.data?.details.filter((d) => d.includes("user-repo.ts"));
    expect(repoViolations).toHaveLength(0);
  });
});
