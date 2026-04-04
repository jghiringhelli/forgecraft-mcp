/**
 * Tests for src/tools/consolidate-status.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildConsolidatedStatus,
  formatConsolidatedStatus,
  consolidateStatusHandler,
  readRecentCommits,
  readUncommittedFiles,
} from "../../src/tools/consolidate-status.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `consolidate-status-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("buildConsolidatedStatus", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a snapshot with generatedAt timestamp", () => {
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.generatedAt).toBeTruthy();
    expect(() => new Date(snapshot.generatedAt)).not.toThrow();
  });

  it("returns cascadeScore with zero required when no forgecraft config", () => {
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.cascadeScore.required).toBe(0);
    expect(snapshot.cascadeScore.passing).toBe(0);
  });

  it("returns null roadmap when docs/roadmap.md is absent", () => {
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.roadmap).toBeNull();
  });

  it("reads roadmap progress when docs/roadmap.md exists", () => {
    write(
      tempDir,
      "docs/roadmap.md",
      [
        "| ID | Title | Depends On | Status | Prompt |",
        "|---|---|---|---|---|",
        "| RM-001 | Login | — | done | docs/session-prompts/RM-001.md |",
        "| RM-002 | Register | — | pending | docs/session-prompts/RM-002.md |",
      ].join("\n"),
    );
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.roadmap).not.toBeNull();
    expect(snapshot.roadmap!.total).toBe(2);
    expect(snapshot.roadmap!.done).toBe(1);
    expect(snapshot.roadmap!.nextId).toBe("RM-002");
  });

  it("reads Status.md tail when file exists", () => {
    write(tempDir, "Status.md", "## Current\nAll good.\n");
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.statusSummary).toContain("All good.");
  });

  it("returns (not found) when Status.md is absent", () => {
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.statusSummary).toBe("(not found)");
  });

  it("detects cargo test command when Cargo.toml exists", () => {
    write(
      tempDir,
      "Cargo.toml",
      '[package]\nname = "loom"\nversion = "0.1.0"\n',
    );
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.testCommand).toBe("cargo test");
  });

  it("detects npm test when package.json with test script exists", () => {
    write(
      tempDir,
      "package.json",
      JSON.stringify({ scripts: { test: "vitest run" } }),
    );
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.testCommand).toBe("npm test");
  });

  it("returns empty recentCommits when not a git repo", () => {
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.recentCommits).toEqual([]);
  });

  it("returns empty uncommittedFiles when not a git repo", () => {
    const snapshot = buildConsolidatedStatus(tempDir);
    expect(snapshot.uncommittedFiles).toEqual([]);
  });
});

describe("formatConsolidatedStatus", () => {
  it("includes the Project Status Snapshot header", () => {
    const tempDir = makeTempDir();
    const snapshot = buildConsolidatedStatus(tempDir);
    const text = formatConsolidatedStatus(snapshot);
    expect(text).toContain("## Project Status Snapshot");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes cascade section", () => {
    const tempDir = makeTempDir();
    const snapshot = buildConsolidatedStatus(tempDir);
    const text = formatConsolidatedStatus(snapshot);
    expect(text).toContain("### Cascade:");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes roadmap section when roadmap present", () => {
    const tempDir = makeTempDir();
    write(
      tempDir,
      "docs/roadmap.md",
      [
        "| ID | Title | Depends On | Status | Prompt |",
        "|---|---|---|---|---|",
        "| RM-001 | Login | — | pending | docs/session-prompts/RM-001.md |",
      ].join("\n"),
    );
    const snapshot = buildConsolidatedStatus(tempDir);
    const text = formatConsolidatedStatus(snapshot);
    expect(text).toContain("### Roadmap:");
    expect(text).toContain("RM-001");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes Status.md section", () => {
    const tempDir = makeTempDir();
    const snapshot = buildConsolidatedStatus(tempDir);
    const text = formatConsolidatedStatus(snapshot);
    expect(text).toContain("### Status.md");
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("consolidateStatusHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a ToolResult with text content", async () => {
    const result = await consolidateStatusHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain("Project Status Snapshot");
  });
});

describe("readRecentCommits", () => {
  it("returns empty array for a non-git directory", () => {
    const dir = makeTempDir();
    expect(readRecentCommits(dir, 5)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("readUncommittedFiles", () => {
  it("returns empty array for a non-git directory", () => {
    const dir = makeTempDir();
    expect(readUncommittedFiles(dir, 10)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
