/**
 * Tests for src/tools/generative-execution-gate.ts (FC-1).
 *
 * Covers: the pure status mapper, the consolidator (durable flag from
 * harness-run.json), the override loader (rationale mandatory), the pure
 * evaluator (green/red/override/out-of-scope/unrun), and evaluator purity.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  probeStatusToGenerative,
  consolidateGenerativeExecution,
  loadGenerativeExecutionOverrides,
  evaluateGenerativeExecution,
} from "../../src/tools/generative-execution-gate.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-gen-exec-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

const USE_CASES = `# Use Cases

## UC-001: First Use Case

Body.

## UC-002: Second Use Case

Body.
`;

function writeHarnessRun(
  dir: string,
  results: Array<{ ucId: string; status: string }>,
  timestamp = "2026-06-15T00:00:00.000Z",
): void {
  write(
    dir,
    ".forgecraft/harness-run.json",
    JSON.stringify({
      timestamp,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      errors: 0,
      notFound: 0,
      results,
    }),
  );
}

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── probeStatusToGenerative ───────────────────────────────────────────

describe("probeStatusToGenerative", () => {
  it("maps pass to green", () => {
    expect(probeStatusToGenerative("pass")).toBe("green");
  });

  it("maps failure-family statuses to red", () => {
    for (const s of [
      "fail",
      "error",
      "timeout",
      "not_implemented",
      "tool_missing",
    ]) {
      expect(probeStatusToGenerative(s)).toBe("red");
    }
  });

  it("maps no_probe and absent to unrun", () => {
    expect(probeStatusToGenerative("no_probe")).toBe("unrun");
    expect(probeStatusToGenerative(undefined)).toBe("unrun");
    expect(probeStatusToGenerative("something-unknown")).toBe("unrun");
  });
});

// ── consolidateGenerativeExecution ────────────────────────────────────

describe("consolidateGenerativeExecution", () => {
  it("persists per-UC flags from harness-run.json into verification-state.json", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [
      { ucId: "UC-001", status: "pass" },
      { ucId: "UC-002", status: "fail" },
    ]);

    const flags = consolidateGenerativeExecution(tempDir);

    expect(flags.find((f) => f.ucId === "UC-001")?.status).toBe("green");
    expect(flags.find((f) => f.ucId === "UC-002")?.status).toBe("red");

    const statePath = join(tempDir, ".forgecraft", "verification-state.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
      generativeExecution?: Array<{
        ucId: string;
        status: string;
        source: string;
        lastRunAt: string;
      }>;
    };
    const ge = state.generativeExecution ?? [];
    expect(ge.find((f) => f.ucId === "UC-001")?.status).toBe("green");
    expect(ge.find((f) => f.ucId === "UC-001")?.source).toBe("harness-run");
    expect(ge.find((f) => f.ucId === "UC-001")?.lastRunAt).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("marks in-scope UC with no probe result as unrun", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [{ ucId: "UC-001", status: "pass" }]);

    const flags = consolidateGenerativeExecution(tempDir);
    expect(flags.find((f) => f.ucId === "UC-002")?.status).toBe("unrun");
  });

  it("returns [] and writes nothing when harness-run.json is absent", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);

    const flags = consolidateGenerativeExecution(tempDir);
    expect(flags).toEqual([]);
    expect(
      existsSync(join(tempDir, ".forgecraft", "verification-state.json")),
    ).toBe(false);
  });
});

// ── loadGenerativeExecutionOverrides ──────────────────────────────────

describe("loadGenerativeExecutionOverrides", () => {
  it("loads overrides with a non-empty rationale", () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "generative_execution:",
        "  overrides:",
        "    - uc: UC-001",
        "      rationale: Verified manually in staging.",
      ].join("\n"),
    );

    const overrides = loadGenerativeExecutionOverrides(tempDir);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.uc).toBe("UC-001");
    expect(overrides[0]!.rationale).toBe("Verified manually in staging.");
  });

  it("drops overrides with an empty/missing rationale", () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "generative_execution:",
        "  overrides:",
        "    - uc: UC-001",
        '      rationale: "   "',
        "    - uc: UC-002",
      ].join("\n"),
    );

    const overrides = loadGenerativeExecutionOverrides(tempDir);
    expect(overrides).toHaveLength(0);
  });

  it("returns [] when forgecraft.yaml is absent", () => {
    tempDir = makeTempDir();
    expect(loadGenerativeExecutionOverrides(tempDir)).toEqual([]);
  });
});

// ── evaluateGenerativeExecution ───────────────────────────────────────

describe("evaluateGenerativeExecution", () => {
  it("passes (green, not blocked) when all in-scope UCs are green", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [
      { ucId: "UC-001", status: "pass" },
      { ucId: "UC-002", status: "pass" },
    ]);
    consolidateGenerativeExecution(tempDir);

    const result = evaluateGenerativeExecution(tempDir, ["UC-001", "UC-002"]);
    expect(result.blocked).toBe(false);
    expect(result.status).toBe("green");
    expect(result.reds).toEqual([]);
  });

  it("blocks (red) when an in-scope UC is red", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [
      { ucId: "UC-001", status: "pass" },
      { ucId: "UC-002", status: "fail" },
    ]);
    consolidateGenerativeExecution(tempDir);

    const result = evaluateGenerativeExecution(tempDir, ["UC-001", "UC-002"]);
    expect(result.blocked).toBe(true);
    expect(result.status).toBe("red");
    expect(result.reds).toContain("UC-002");
  });

  it("does not block a red UC that has a valid override (with rationale)", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [
      { ucId: "UC-001", status: "pass" },
      { ucId: "UC-002", status: "fail" },
    ]);
    consolidateGenerativeExecution(tempDir);
    write(
      tempDir,
      "forgecraft.yaml",
      [
        "generative_execution:",
        "  overrides:",
        "    - uc: UC-002",
        "      rationale: Flaky external dependency; verified manually.",
      ].join("\n"),
    );

    const result = evaluateGenerativeExecution(tempDir, ["UC-001", "UC-002"]);
    expect(result.blocked).toBe(false);
    expect(result.reds).toEqual([]);
    expect(result.overridden).toContain("UC-002");
  });

  it("still blocks a red UC when the override has no rationale", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [{ ucId: "UC-002", status: "fail" }]);
    consolidateGenerativeExecution(tempDir);
    write(
      tempDir,
      "forgecraft.yaml",
      ["generative_execution:", "  overrides:", "    - uc: UC-002"].join("\n"),
    );

    const result = evaluateGenerativeExecution(tempDir, ["UC-002"]);
    expect(result.blocked).toBe(true);
    expect(result.reds).toContain("UC-002");
    expect(result.overridden).toEqual([]);
  });

  it("ignores out-of-scope reds", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [
      { ucId: "UC-001", status: "pass" },
      { ucId: "UC-002", status: "fail" },
    ]);
    consolidateGenerativeExecution(tempDir);

    // Only UC-001 is in scope this cycle; UC-002's red is out of scope.
    const result = evaluateGenerativeExecution(tempDir, ["UC-001"]);
    expect(result.blocked).toBe(false);
    expect(result.reds).toEqual([]);
  });

  it("treats unrun as a blocker (no objective evidence)", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    // No harness run at all → no flags persisted → UC-001 is unrun.
    const result = evaluateGenerativeExecution(tempDir, ["UC-001"]);
    expect(result.blocked).toBe(true);
    expect(result.reds).toContain("UC-001");
  });

  it("is pure: no file writes and no mtime changes in the project dir", () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES);
    writeHarnessRun(tempDir, [{ ucId: "UC-001", status: "fail" }]);
    consolidateGenerativeExecution(tempDir);

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
    evaluateGenerativeExecution(tempDir, ["UC-001"]);
    evaluateGenerativeExecution(tempDir, ["UC-001"]);
    const after = snapshot();

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const k of Object.keys(before)) {
      expect(after[k]).toBe(before[k]);
    }
  });
});
