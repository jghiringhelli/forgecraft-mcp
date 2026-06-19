/**
 * Tests for EDR spec-change records + cascade re-verify (ADR-0012 §6d).
 *
 * An EDR records that the spec changed and which UCs it touches. close_cycle
 * blocks until those UCs' generative-execution evidence is at least as recent as
 * the EDR — a green that predates the spec change is stale and must be re-run.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseEdr,
  findSpecChangeRecords,
  evaluateSpecChangeCascade,
  buildEdrsReadme,
} from "../../src/tools/spec-change-record.js";

describe("parseEdr", () => {
  it("extracts id, date, and affected UCs", () => {
    const r = parseEdr(
      "EDR-003-rename.md",
      [
        "# EDR-003: rename field",
        "Date: 2026-06-17",
        "Affected UCs: UC-001, UC-003",
        "## Change",
        "the contract now returns camelCase",
      ].join("\n"),
    );
    expect(r.id).toBe("EDR-003");
    expect(r.date).toBe("2026-06-17");
    expect(r.affectedUcs).toEqual(["UC-001", "UC-003"]);
  });

  it("upper-cases UC ids and tolerates 'Affected UC:' singular", () => {
    const r = parseEdr("e.md", "Affected UC: uc-007");
    expect(r.affectedUcs).toEqual(["UC-007"]);
  });
});

describe("spec-change cascade", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function makeProject(): string {
    dir = join(
      tmpdir(),
      `fc-edr-${Date.now()}-${Math.round(performance.now())}`,
    );
    mkdirSync(join(dir, "docs", "edrs"), { recursive: true });
    mkdirSync(join(dir, ".forgecraft"), { recursive: true });
    return dir;
  }

  function writeEdr(root: string, name: string, body: string): void {
    writeFileSync(join(root, "docs", "edrs", name), body, "utf-8");
  }

  function writeGenExec(
    root: string,
    records: Array<{ ucId: string; status: string; lastRunAt: string }>,
  ): void {
    writeFileSync(
      join(root, ".forgecraft", "verification-state.json"),
      JSON.stringify({ version: "1", generativeExecution: records }),
      "utf-8",
    );
  }

  it("is skipped when there are no EDRs", () => {
    const root = makeProject();
    const result = evaluateSpecChangeCascade(root);
    expect(result.skipped).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it("ignores an EDR README and EDRs with no affected UCs", () => {
    const root = makeProject();
    writeFileSync(
      join(root, "docs", "edrs", "README.md"),
      buildEdrsReadme(),
      "utf-8",
    );
    writeEdr(root, "EDR-001.md", "# EDR-001\nDate: 2026-06-17\n## Change\nx");
    expect(findSpecChangeRecords(root)).toHaveLength(0);
    expect(evaluateSpecChangeCascade(root).skipped).toBe(true);
  });

  it("blocks when an affected UC's green predates the spec change", () => {
    const root = makeProject();
    writeEdr(
      root,
      "EDR-001.md",
      "# EDR-001\nDate: 2026-06-17\nAffected UCs: UC-001",
    );
    writeGenExec(root, [
      {
        ucId: "UC-001",
        status: "green",
        lastRunAt: "2026-06-10T10:00:00.000Z",
      },
    ]);
    const result = evaluateSpecChangeCascade(root);
    expect(result.blocked).toBe(true);
    expect(result.staleUcs[0]!.uc).toBe("UC-001");
    expect(result.staleUcs[0]!.reason).toContain("predates");
  });

  it("passes when the affected UC was re-run after the spec change", () => {
    const root = makeProject();
    writeEdr(
      root,
      "EDR-001.md",
      "# EDR-001\nDate: 2026-06-17\nAffected UCs: UC-001",
    );
    writeGenExec(root, [
      {
        ucId: "UC-001",
        status: "green",
        lastRunAt: "2026-06-18T09:00:00.000Z",
      },
    ]);
    const result = evaluateSpecChangeCascade(root);
    expect(result.blocked).toBe(false);
    expect(result.staleUcs).toHaveLength(0);
  });

  it("blocks when an affected UC has no generative-execution evidence at all", () => {
    const root = makeProject();
    writeEdr(
      root,
      "EDR-001.md",
      "# EDR-001\nDate: 2026-06-17\nAffected UCs: UC-009",
    );
    writeGenExec(root, [
      {
        ucId: "UC-001",
        status: "green",
        lastRunAt: "2026-06-18T09:00:00.000Z",
      },
    ]);
    const result = evaluateSpecChangeCascade(root);
    expect(result.blocked).toBe(true);
    expect(result.staleUcs[0]!.uc).toBe("UC-009");
    expect(result.staleUcs[0]!.reason).toContain("no generative-execution");
  });

  it("an undated EDR is treated as newer than any prior run (stale)", () => {
    const root = makeProject();
    writeEdr(root, "EDR-001.md", "# EDR-001\nAffected UCs: UC-001");
    writeGenExec(root, [
      {
        ucId: "UC-001",
        status: "green",
        lastRunAt: "2026-06-18T09:00:00.000Z",
      },
    ]);
    expect(evaluateSpecChangeCascade(root).blocked).toBe(true);
  });
});

describe("buildEdrsReadme", () => {
  it("documents the Affected UCs cascade and the format", () => {
    const out = buildEdrsReadme();
    expect(out).toContain("Affected UCs:");
    expect(out).toContain("run_harness");
    expect(out).toContain("EDR-001");
  });
});
