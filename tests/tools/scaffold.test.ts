/**
 * Tests for the scaffold_project tool handler.
 *
 * Tests cover: dry-run planning, actual scaffolding, UNIVERSAL auto-inclusion,
 * file skip-on-exist behavior, and force overwrite.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProjectHandler } from "../../src/tools/scaffold.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-scaffold-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("scaffoldProjectHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── dry_run ───────────────────────────────────────────────────────

  describe("dry_run mode", () => {
    it("returns a plan without writing files", async () => {
      const result = await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "TestProject",
        language: "typescript",
        dry_run: true,
        force: false,
        output_targets: ["claude"],
      });
      expect(result.content[0]!.text.length).toBeGreaterThan(0);
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(false);
    });

    it("dry-run output lists expected structure entries", async () => {
      const result = await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "DryTest",
        language: "typescript",
        dry_run: true,
        force: false,
        output_targets: ["claude"],
      });
      // The plan should mention some file paths
      expect(result.content[0]!.text).toMatch(/src\/|docs\/|\.claude\//i);
    });
  });

  // ── actual scaffolding ─────────────────────────────────────────────

  describe("actual scaffolding", () => {
    it("creates CLAUDE.md in project_dir", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "ScaffoldTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    });

    it("creates Status.md in project_dir", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "ScaffoldTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      expect(existsSync(join(tempDir, "Status.md"))).toBe(true);
    });

    it("UNIVERSAL is always included even if not specified in tags", async () => {
      await scaffoldProjectHandler({
        tags: ["API"],
        project_dir: tempDir,
        project_name: "ApiProject",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      // UNIVERSAL blocks appear in all CLAUDE.md outputs
      expect(content).toContain("CLAUDE.md");
    });

    it("returns response text listing created files", async () => {
      const result = await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "TestProject",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const text = result.content[0]!.text;
      expect(text.length).toBeGreaterThan(50);
    });

    it("skips existing files when force=false", async () => {
      const claudeMdPath = join(tempDir, "CLAUDE.md");
      writeFileSync(claudeMdPath, "MY EXISTING CONTENT\n");
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "Test",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const content = readFileSync(claudeMdPath, "utf-8");
      expect(content).toContain("MY EXISTING CONTENT");
    });

    it("overwrites existing files when force=true", async () => {
      const claudeMdPath = join(tempDir, "CLAUDE.md");
      writeFileSync(claudeMdPath, "OLD CONTENT ONLY\n");
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "Test",
        language: "typescript",
        dry_run: false,
        force: true,
        output_targets: ["claude"],
      });
      const content = readFileSync(claudeMdPath, "utf-8");
      // New content should include standard CLAUDE.md header
      expect(content).toContain("CLAUDE.md");
    });
  });
});
