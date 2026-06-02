/**
 * Tests for the brownfield severity ramp feature in close-cycle.
 *
 * Covers: detectSeverityRampCandidates — brownfield flag, warning gate detection,
 * greenfield no-op, empty active gates.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectSeverityRampCandidates } from "../../src/tools/close-cycle.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-sev-ramp-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(dir: string, brownfield: boolean): void {
  writeFileSync(
    join(dir, "forgecraft.yaml"),
    brownfield ? "brownfield: true\n" : "brownfield: false\n",
    "utf-8",
  );
}

/** Write a gate YAML into .forgecraft/gates/project/active/<id>.yaml */
function writeGate(
  dir: string,
  id: string,
  severity: "warning" | "error" | "info",
): void {
  const activeDir = join(dir, ".forgecraft", "gates", "project", "active");
  mkdirSync(activeDir, { recursive: true });
  writeFileSync(
    join(activeDir, `${id}.yaml`),
    `id: ${id}\ndescription: test gate\nseverity: ${severity}\ngeneralizable: false\naddedAt: 2026-01-01T00:00:00.000Z\n`,
    "utf-8",
  );
}

describe("detectSeverityRampCandidates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when no forgecraft.yaml exists", () => {
    expect(detectSeverityRampCandidates(tempDir)).toEqual([]);
  });

  it("returns empty array when brownfield: false", () => {
    writeConfig(tempDir, false);
    writeGate(tempDir, "gate-001", "warning");
    expect(detectSeverityRampCandidates(tempDir)).toEqual([]);
  });

  it("returns empty array when brownfield but no warning gates", () => {
    writeConfig(tempDir, true);
    writeGate(tempDir, "gate-001", "error");
    writeGate(tempDir, "gate-002", "info");
    expect(detectSeverityRampCandidates(tempDir)).toEqual([]);
  });

  it("returns warning gate IDs when brownfield: true", () => {
    writeConfig(tempDir, true);
    writeGate(tempDir, "gate-warn-1", "warning");
    writeGate(tempDir, "gate-warn-2", "warning");
    writeGate(tempDir, "gate-error", "error");

    const result = detectSeverityRampCandidates(tempDir);
    expect(result).toHaveLength(2);
    expect(result).toContain("gate-warn-1");
    expect(result).toContain("gate-warn-2");
    expect(result).not.toContain("gate-error");
  });

  it("returns empty array when brownfield but no active gates at all", () => {
    writeConfig(tempDir, true);
    // no gates directory
    expect(detectSeverityRampCandidates(tempDir)).toEqual([]);
  });

  it("does not include error-severity gates in ramp candidates", () => {
    writeConfig(tempDir, true);
    writeGate(tempDir, "already-strict", "error");
    const result = detectSeverityRampCandidates(tempDir);
    expect(result).not.toContain("already-strict");
  });
});
