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

describe("checkT4Handler — GitHub issue signals", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const ISSUE_SIGNAL = {
    id: "sig-20260508-093000-001",
    timestamp: "2026-05-08T09:30:00Z",
    exception_class: "i18n",
    severity: "warning",
    gs_property: "Verifiable",
    spec_ref: "docs/behavioral-contracts.md",
    diagnosis:
      "Industry option labels rendered in English in es-locale session",
    suggested_update: "Add localized industry name resolution",
    status: "pending",
    correlation_id: "gh-issue-#2",
    service: "jghiringhelli/invellum-frontend",
    environment: "github",
  };

  it("renders issue heading with correlation_id", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Issue 1:");
    expect(text).toContain("gh-issue-#2");
  });

  it("constructs the GitHub issue URL from service + correlation_id", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain(
      "https://github.com/jghiringhelli/invellum-frontend/issues/2",
    );
  });

  it("includes the BIOISO branch protocol guidance", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("BIOISO");
    expect(text).toContain("bioiso/gen{N}");
    expect(text).toContain("CLAUDE.md");
  });

  it("issue resolve action says PR merged + deployed, not spec update", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("PR merged + deployed");
  });

  it("renders BIOISO Issue Workflow section when issue signals are pending", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("BIOISO Issue Workflow");
    expect(text).toContain("Closes #N");
  });

  it("does NOT render T4 Cycle section when ONLY issue signals are pending", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).not.toContain("T4 → T1 Cycle");
  });

  it("renders BOTH cycle sections when runtime AND issue signals are pending", async () => {
    writeQueue(tempDir, [ISSUE_SIGNAL, PENDING_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("T4 → T1 Cycle");
    expect(text).toContain("BIOISO Issue Workflow");
  });

  it("non-github signals still render with the original Signal heading", async () => {
    writeQueue(tempDir, [PENDING_SIGNAL]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Signal 1:");
    expect(text).not.toContain("Issue 1:");
  });

  it("github environment without gh-issue-# correlation_id is treated as runtime", async () => {
    // Defensive: if some other tool writes a github-environment signal with a
    // different correlation format, do not falsely route it through the issue path.
    writeQueue(tempDir, [
      { ...ISSUE_SIGNAL, correlation_id: "trace-xyz", environment: "github" },
    ]);
    const result = await checkT4Handler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Signal 1:");
    expect(text).not.toContain("Issue 1:");
  });
});
