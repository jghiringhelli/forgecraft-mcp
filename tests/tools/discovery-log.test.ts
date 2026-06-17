/**
 * Tests for the two-stream discovery log + fixture-on-close gate (ADR-0012 §6c).
 *
 * The load-bearing rule: a DELTA (runtime discovery) cannot close without a
 * captured regression fixture that resolves to a real file. Deviations (D-XXX)
 * are design-time debt and are never fixture-gated.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseDiscoveryLog,
  evaluateDiscoveryLog,
  buildDiscoveryLog,
} from "../../src/tools/discovery-log.js";

describe("parseDiscoveryLog", () => {
  it("parses both streams and skips commented examples", () => {
    const log = [
      "# Discovery Log",
      "<!-- D-999 | 2026-01-01 | open | example in a comment -->",
      "D-001 | 2026-01-15 | open | spec mandates axios; using fetch",
      "DELTA-001 | 2026-01-20 | closed | enum 500 | Fixture: tests/fixtures/d1.json",
    ].join("\n");
    const entries = parseDiscoveryLog(log);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe("D-001");
    expect(entries[0]!.stream).toBe("deviation");
    expect(entries[1]!.id).toBe("DELTA-001");
    expect(entries[1]!.stream).toBe("delta");
    expect(entries[1]!.status).toBe("closed");
    expect(entries[1]!.fixture).toBe("tests/fixtures/d1.json");
  });

  it("normalizes an unknown status to open", () => {
    const entries = parseDiscoveryLog(
      "DELTA-002 | 2026-01-01 | wip | something",
    );
    expect(entries[0]!.status).toBe("open");
  });

  it("finds the Fixture field in any position after the id", () => {
    const entries = parseDiscoveryLog(
      "DELTA-003 | Fixture: a/b.json | 2026-01-01 | closed | symptom",
    );
    expect(entries[0]!.fixture).toBe("a/b.json");
    expect(entries[0]!.status).toBe("closed");
    expect(entries[0]!.description).toBe("symptom");
  });
});

describe("evaluateDiscoveryLog", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function makeProject(logBody: string): string {
    dir = join(
      tmpdir(),
      `fc-discovery-${Date.now()}-${Math.round(performance.now())}`,
    );
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "discovery-log.md"), logBody, "utf-8");
    return dir;
  }

  it("is skipped (not blocking) when no discovery log exists", () => {
    dir = join(tmpdir(), `fc-discovery-none-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const result = evaluateDiscoveryLog(dir);
    expect(result.skipped).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it("blocks a closed DELTA with no Fixture reference", () => {
    const root = makeProject("DELTA-001 | 2026-01-20 | closed | enum 500");
    const result = evaluateDiscoveryLog(root);
    expect(result.skipped).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.closedWithoutFixture[0]!.id).toBe("DELTA-001");
  });

  it("blocks a closed DELTA whose Fixture path does not exist", () => {
    const root = makeProject(
      "DELTA-001 | 2026-01-20 | closed | enum 500 | Fixture: tests/fixtures/missing.json",
    );
    const result = evaluateDiscoveryLog(root);
    expect(result.blocked).toBe(true);
    expect(result.closedWithoutFixture[0]!.reason).toContain("does not exist");
  });

  it("passes a closed DELTA whose Fixture path resolves to a real file", () => {
    const root = makeProject(
      "DELTA-001 | 2026-01-20 | closed | enum 500 | Fixture: tests/fixtures/d1.json",
    );
    mkdirSync(join(root, "tests", "fixtures"), { recursive: true });
    writeFileSync(join(root, "tests", "fixtures", "d1.json"), "{}", "utf-8");
    const result = evaluateDiscoveryLog(root);
    expect(result.blocked).toBe(false);
    expect(result.closedWithoutFixture).toHaveLength(0);
  });

  it("never fixture-gates a closed deviation (D-XXX)", () => {
    const root = makeProject(
      "D-001 | 2026-01-15 | closed | design-time debt, resolved",
    );
    const result = evaluateDiscoveryLog(root);
    expect(result.blocked).toBe(false);
  });

  it("does not block an open DELTA without a fixture", () => {
    const root = makeProject(
      "DELTA-001 | 2026-01-20 | open | still investigating",
    );
    const result = evaluateDiscoveryLog(root);
    expect(result.blocked).toBe(false);
  });
});

describe("buildDiscoveryLog", () => {
  it("documents both streams and the fixture-on-close rule", () => {
    const out = buildDiscoveryLog();
    expect(out).toContain("Deviations (D-XXX)");
    expect(out).toContain("Deltas (DELTA-NNN)");
    expect(out).toContain("regression fixture");
  });

  it("is not mistaken for an unfinished spec stub (no FILL/UNFILLED/TODO)", () => {
    const out = buildDiscoveryLog();
    expect(out).not.toMatch(/FILL|UNFILLED|TODO/);
  });

  it("its own example lines are commented out (parse to zero real entries)", () => {
    expect(parseDiscoveryLog(buildDiscoveryLog())).toHaveLength(0);
  });
});
