/**
 * Tests for src/tools/static-analyzer-gate.ts (FC-2).
 *
 * Covers: resolveAnalyzers defaults/override, the override loader (rationale
 * mandatory / empty / missing file), and the pure evaluator (all-green,
 * one-red-blocks, overridden, sonar-absent-skips, plus evaluator purity).
 *
 * The evaluator reads ACTIVE gate-violations. In a temp dir with no .git,
 * buildGateViolationReport treats every recorded violation as active (no commit
 * to compare against), so a written .forgecraft/gate-violations.jsonl is enough
 * to make an analyzer red.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveAnalyzers,
  loadStaticAnalysisOverrides,
  evaluateStaticAnalyzers,
  DEFAULT_ANALYZERS,
} from "../../src/tools/static-analyzer-gate.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-static-analyzer-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

/** Append a gate-violation line for the given hook. */
function writeViolation(dir: string, hook: string): void {
  write(
    dir,
    ".forgecraft/gate-violations.jsonl",
    JSON.stringify({
      hook,
      severity: "error",
      message: `${hook} failed`,
      timestamp: "2026-06-15T12:00:00Z",
    }) + "\n",
  );
}

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── resolveAnalyzers ──────────────────────────────────────────────────

describe("resolveAnalyzers", () => {
  it("returns the defaults when config is null/undefined", () => {
    expect(resolveAnalyzers(null)).toEqual([...DEFAULT_ANALYZERS]);
    expect(resolveAnalyzers(undefined)).toEqual([...DEFAULT_ANALYZERS]);
    expect(resolveAnalyzers({})).toEqual([
      "eslint",
      "tsc",
      "complexity",
      "audit",
    ]);
  });

  it("returns the defaults when analyzers is an empty array", () => {
    expect(resolveAnalyzers({ static_analysis: { analyzers: [] } })).toEqual([
      ...DEFAULT_ANALYZERS,
    ]);
  });

  it("returns the configured analyzer set when provided", () => {
    expect(
      resolveAnalyzers({ static_analysis: { analyzers: ["eslint", "audit"] } }),
    ).toEqual(["eslint", "audit"]);
  });
});

// ── loadStaticAnalysisOverrides ───────────────────────────────────────

describe("loadStaticAnalysisOverrides", () => {
  it("loads overrides with a non-empty rationale", () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "static_analysis:",
        "  overrides:",
        "    - analyzer: complexity",
        "      rationale: Generated parser; complexity is inherent and reviewed.",
      ].join("\n"),
    );

    const overrides = loadStaticAnalysisOverrides(tempDir);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.analyzer).toBe("complexity");
    expect(overrides[0]!.rationale).toBe(
      "Generated parser; complexity is inherent and reviewed.",
    );
  });

  it("drops overrides with an empty/missing rationale", () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "static_analysis:",
        "  overrides:",
        "    - analyzer: complexity",
        '      rationale: "   "',
        "    - analyzer: eslint",
      ].join("\n"),
    );

    expect(loadStaticAnalysisOverrides(tempDir)).toHaveLength(0);
  });

  it("returns [] when forgecraft.yaml is absent", () => {
    tempDir = makeTempDir();
    expect(loadStaticAnalysisOverrides(tempDir)).toEqual([]);
  });
});

// ── evaluateStaticAnalyzers ───────────────────────────────────────────

describe("evaluateStaticAnalyzers", () => {
  it("is green (not blocked) when there are no active analyzer violations", () => {
    tempDir = makeTempDir();
    const result = evaluateStaticAnalyzers(tempDir);
    expect(result.blocked).toBe(false);
    expect(result.status).toBe("green");
    expect(result.failing).toEqual([]);
  });

  it("blocks (red) when one analyzer hook has an active violation", () => {
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-eslint");

    const result = evaluateStaticAnalyzers(tempDir);
    expect(result.blocked).toBe(true);
    expect(result.status).toBe("red");
    expect(result.failing).toContain("eslint");
  });

  it("maps each default analyzer to its reporting hook", () => {
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-complexity");
    expect(evaluateStaticAnalyzers(tempDir).failing).toContain("complexity");

    rmSync(tempDir, { recursive: true, force: true });
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-audit");
    expect(evaluateStaticAnalyzers(tempDir).failing).toContain("audit");

    rmSync(tempDir, { recursive: true, force: true });
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-compile"); // tsc
    expect(evaluateStaticAnalyzers(tempDir).failing).toContain("tsc");
  });

  it("does not block a red analyzer that has a valid override (with rationale)", () => {
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-complexity");
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "static_analysis:",
        "  overrides:",
        "    - analyzer: complexity",
        "      rationale: Generated parser; reviewed manually.",
      ].join("\n"),
    );

    const result = evaluateStaticAnalyzers(tempDir);
    expect(result.blocked).toBe(false);
    expect(result.failing).toEqual([]);
    expect(result.overridden).toContain("complexity");
  });

  it("still blocks a red analyzer when the override has no rationale", () => {
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-complexity");
    write(
      tempDir,
      "forgecraft.yaml",
      ["static_analysis:", "  overrides:", "    - analyzer: complexity"].join(
        "\n",
      ),
    );

    const result = evaluateStaticAnalyzers(tempDir);
    expect(result.blocked).toBe(true);
    expect(result.failing).toContain("complexity");
    expect(result.overridden).toEqual([]);
  });

  it("flags complexity red from persisted .complexity/ evidence", () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      ".complexity/baseline.json",
      JSON.stringify({ over_threshold: 2 }),
    );
    const result = evaluateStaticAnalyzers(tempDir);
    expect(result.failing).toContain("complexity");
  });

  it("skips sonar when its config block is absent (never blocks)", () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "static_analysis:",
        "  analyzers:",
        "    - sonar",
        "    - code_climate",
      ].join("\n"),
    );
    // A leftover sonar-shaped violation must NOT block when the block is absent.
    writeViolation(tempDir, "sonar");

    const result = evaluateStaticAnalyzers(tempDir);
    expect(result.blocked).toBe(false);
    expect(result.failing).toEqual([]);
  });

  it("is pure: no file writes and no mtime changes in the project dir", () => {
    tempDir = makeTempDir();
    writeViolation(tempDir, "pre-commit-eslint");
    write(
      tempDir,
      "forgecraft.yaml",
      "static_analysis:\n  analyzers: [eslint]\n",
    );

    const snapshot = (): Record<string, number> => {
      const acc: Record<string, number> = {};
      const walk = (d: string): void => {
        for (const e of readdirSync(d)) {
          const full = join(d, e);
          const st = statSync(full);
          if (st.isDirectory()) walk(full);
          else acc[full] = st.mtimeMs;
        }
      };
      walk(tempDir);
      return acc;
    };

    const before = snapshot();
    evaluateStaticAnalyzers(tempDir);
    evaluateStaticAnalyzers(tempDir);
    const after = snapshot();

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const k of Object.keys(before)) {
      expect(after[k]).toBe(before[k]);
    }
  });
});
