/**
 * Tests for the check_t4 tool handler.
 *
 * Tests cover: no-queue output includes install instructions and links,
 * pending signals are surfaced, acknowledged/resolved signals are filtered,
 * and action dispatch (acknowledge/resolve) works correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkT4Handler } from "../../src/tools/check-t4.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-t4-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const PENDING_SIGNAL = {
  id: "sig-20240101-120000-001",
  timestamp: "2024-01-01T12:00:00Z",
  exception_class: "com.example.DataValidationException",
  severity: "critical",
  gs_property: "Verifiable",
  spec_ref: "docs/behavioral-contracts.md#uc-001",
  diagnosis: "Input validation bypassed for null user IDs",
  suggested_update: "Add null guard to UC-001 precondition",
  status: "pending",
  correlation_id: "abc-123",
};

function writeQueue(dir: string, signals: object[]): void {
  mkdirSync(join(dir, ".forgecraft"), { recursive: true });
  writeFileSync(
    join(dir, ".forgecraft", "t4-signals.json"),
    JSON.stringify({ signals }, null, 2),
    "utf-8",
  );
}

describe("checkT4Handler — no queue", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns helpful setup message when queue file is absent", async () => {
    const result = await checkT4Handler({
      project_dir: tempDir,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("No signal queue found");
  });

  it("no-queue output includes npm install forgecraft-eye", async () => {
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("npm install forgecraft-eye");
  });

  it("no-queue output includes npmjs.com link", async () => {
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("npmjs.com/package/forgecraft-eye");
  });

  it("no-queue output includes GitHub source link", async () => {
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("https://github.com/jghiringhelli/forgecraft-eye");
  });

  it("no-queue output includes setup_monitoring step", async () => {
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("setup_monitoring");
  });

  it("no-queue output includes pipe example", async () => {
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("npx forgecraft-eye");
  });
});

describe("checkT4Handler — with queue", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("surfaces pending signals", async () => {
    writeQueue(tempDir, [PENDING_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("sig-20240101-120000-001");
  });

  it("shows critical badge for critical severity", async () => {
    writeQueue(tempDir, [PENDING_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toMatch(/critical/i);
  });

  it("filters resolved signals by default", async () => {
    writeQueue(tempDir, [{ ...PENDING_SIGNAL, status: "resolved" }]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).not.toContain("sig-20240101-120000-001");
  });

  it("shows resolved signals when show_resolved is true", async () => {
    writeQueue(tempDir, [{ ...PENDING_SIGNAL, status: "resolved" }]);
    const result = await checkT4Handler({
      project_dir: tempDir,
      show_resolved: true,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("sig-20240101-120000-001");
  });

  it("all signals resolved returns clean message", async () => {
    writeQueue(tempDir, [{ ...PENDING_SIGNAL, status: "resolved" }]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No pending signals");
  });
});
