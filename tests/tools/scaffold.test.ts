/**
 * Tests for the scaffold_project tool handler.
 *
 * Tests cover: dry-run planning, actual scaffolding, UNIVERSAL auto-inclusion,
 * file skip-on-exist behavior, and force overwrite.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
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

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

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
      // UNIVERSAL blocks appear in all CLAUDE.md outputs — sentinel comment always present
      expect(content).toContain("ForgeCraft sentinel");
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
      // New content should include standard sentinel comment
      expect(content).toContain("ForgeCraft sentinel");
    });
  });

  // ── sentinel scaffolding ───────────────────────────────────────────

  describe("sentinel scaffolding (default)", () => {
    it("creates a short sentinel CLAUDE.md (< 100 lines)", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "SentinelTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content.split("\n").length).toBeLessThan(100);
      expect(content).toContain("ForgeCraft sentinel");
    });

    it("creates .claude/standards/ domain files", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "SentinelTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const standardsDir = join(tempDir, ".claude", "standards");
      expect(existsSync(standardsDir)).toBe(true);
      expect(existsSync(join(standardsDir, "architecture.md"))).toBe(true);
    });

    it("creates project-specific.md as user-owned placeholder", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "SentinelTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const psPath = join(
        tempDir,
        ".claude",
        "standards",
        "project-specific.md",
      );
      expect(existsSync(psPath)).toBe(true);
      const content = readFileSync(psPath, "utf-8");
      expect(content).toContain("ForgeCraft will never overwrite");
    });

    it("does NOT overwrite existing project-specific.md (user-owned)", async () => {
      const psPath = join(
        tempDir,
        ".claude",
        "standards",
        "project-specific.md",
      );
      mkdirSync(join(tempDir, ".claude", "standards"), { recursive: true });
      writeFileSync(psPath, "# My custom rules\n- Deploy to Fly.io\n", "utf-8");

      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "SentinelTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });

      const after = readFileSync(psPath, "utf-8");
      expect(after).toContain("Deploy to Fly.io");
    });

    it("CLAUDE.md contains navigation pointer to .claude/index.md", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "SentinelTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      // Wayfinding is now in .claude/index.md; CLAUDE.md points to it
      expect(content).toContain(".claude/index.md");
    });
  });

  // ── exceptions.json scaffolding ───────────────────────────────────────

  describe("exceptions.json scaffolding", () => {
    it("creates .forgecraft/exceptions.json when it does not exist", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "ExceptionsTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });

      const exceptionsPath = join(tempDir, ".forgecraft", "exceptions.json");
      expect(existsSync(exceptionsPath)).toBe(true);
      const content = JSON.parse(readFileSync(exceptionsPath, "utf-8"));
      expect(content.version).toBe("1");
      expect(content.exceptions).toEqual([]);
    });

    it("does NOT overwrite existing .forgecraft/exceptions.json", async () => {
      const forgecraftDir = join(tempDir, ".forgecraft");
      mkdirSync(forgecraftDir, { recursive: true });
      const exceptionsPath = join(forgecraftDir, "exceptions.json");
      const existing = {
        version: "1",
        exceptions: [
          {
            id: "exc-001",
            hook: "layer-boundary",
            pattern: "src/migrations/**",
            reason: "Custom exception",
            addedAt: "2024-01-01T00:00:00.000Z",
            addedBy: "human",
          },
        ],
      };
      writeFileSync(
        exceptionsPath,
        JSON.stringify(existing, null, 2) + "\n",
        "utf-8",
      );

      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "ExceptionsTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });

      const after = JSON.parse(readFileSync(exceptionsPath, "utf-8"));
      expect(after.exceptions).toHaveLength(1);
      expect(after.exceptions[0].id).toBe("exc-001");
      expect(after.exceptions[0].reason).toBe("Custom exception");
    });
  });

  // ── project-gates.yaml scaffolding ────────────────────────────────

  describe("project-gates.yaml scaffolding", () => {
    it("creates .forgecraft/project-gates.yaml when it does not exist", async () => {
      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "GatesTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });

      const gatesPath = join(tempDir, ".forgecraft", "project-gates.yaml");
      expect(existsSync(gatesPath)).toBe(true);
      const content = readFileSync(gatesPath, "utf-8");
      expect(content).toContain('version: "1"');
      expect(content).toContain("gates: []");
    });

    it("does NOT overwrite existing .forgecraft/project-gates.yaml", async () => {
      const forgecraftDir = join(tempDir, ".forgecraft");
      mkdirSync(forgecraftDir, { recursive: true });
      const gatesPath = join(forgecraftDir, "project-gates.yaml");
      const existingContent = `version: "1"\ngates:\n  - id: my-custom-gate\n    title: My Gate\n`;
      writeFileSync(gatesPath, existingContent, "utf-8");

      await scaffoldProjectHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "GatesTest",
        language: "typescript",
        dry_run: false,
        force: false,
        output_targets: ["claude"],
      });

      const after = readFileSync(gatesPath, "utf-8");
      expect(after).toContain("my-custom-gate");
    });
  });
});
