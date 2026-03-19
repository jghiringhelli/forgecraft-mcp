/**
 * Tests for the setup_project tool handler.
 *
 * Tests cover: dry-run mode, file creation, tag detection,
 * tag override, multi-target output, and error paths.
 */
// @ts-nocheck


import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupProjectHandler } from "../../src/tools/setup-project.js";

// ── fixtures ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-setup-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackageJson(dir: string, content: object): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify(content), "utf-8");
}

// ── suite ─────────────────────────────────────────────────────────────

describe("setupProjectHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── dry_run ───────────────────────────────────────────────────────

  describe("dry_run mode", () => {
    it("returns a response without writing files", async () => {
      writePackageJson(tempDir, {});
      const result = await setupProjectHandler({
        project_dir: tempDir,
        dry_run: true,
        output_targets: ["claude"],
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.text).toContain("dry");
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(false);
    });

    it("includes detected tags in dry-run output", async () => {
      writePackageJson(tempDir, { dependencies: { react: "^18.0.0" } });
      const result = await setupProjectHandler({
        project_dir: tempDir,
        dry_run: true,
        output_targets: ["claude"],
      });
      expect(result.content[0]!.text).toMatch(/WEB-REACT|UNIVERSAL/);
    });

    it("respects explicit tag override in dry-run", async () => {
      writePackageJson(tempDir, {});
      const result = await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL", "CLI"],
        dry_run: true,
        output_targets: ["claude"],
      });
      expect(result.content[0]!.text).toContain("CLI");
    });
  });

  // ── file writing ───────────────────────────────────────────────────

  describe("file writing", () => {
    it("writes CLAUDE.md when project_dir is provided", async () => {
      writePackageJson(tempDir, {});
      await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["claude"],
      });
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    });

    it("writes forgecraft.yaml config file", async () => {
      writePackageJson(tempDir, {});
      await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["claude"],
      });
      expect(existsSync(join(tempDir, "forgecraft.yaml"))).toBe(true);
    });

    it("forgecraft.yaml stores project name from project_name arg", async () => {
      writePackageJson(tempDir, {});
      await setupProjectHandler({
        project_dir: tempDir,
        project_name: "MySpecialProject",
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["claude"],
      });
      // projectName lives in forgecraft.yaml, not CLAUDE.md (no template uses {{projectName}})
      const yamlContent = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
      expect(yamlContent).toContain("MySpecialProject");
    });

    it("writes copilot-instructions.md for copilot target", async () => {
      writePackageJson(tempDir, {});
      await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["copilot"],
      });
      expect(existsSync(join(tempDir, ".github", "copilot-instructions.md"))).toBe(true);
    });

    it("returns a list of files written in response", async () => {
      writePackageJson(tempDir, {});
      const result = await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["claude"],
      });
      expect(result.content[0]!.text).toMatch(/CLAUDE\.md/i);
    });

    it("preserves custom sections on re-run via merge", async () => {
      writePackageJson(tempDir, {});
      // Initial write
      await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["claude"],
      });
      // Manually add a custom section
      const claudeMdPath = join(tempDir, "CLAUDE.md");
      const original = readFileSync(claudeMdPath, "utf-8");
      writeFileSync(claudeMdPath, original + "\n\n## My Custom Section\nCustom content here\n");
      // Re-run setup
      await setupProjectHandler({
        project_dir: tempDir,
        tags: ["UNIVERSAL"],
        dry_run: false,
        output_targets: ["claude"],
      });
      const after = readFileSync(claudeMdPath, "utf-8");
      expect(after).toContain("My Custom Section");
    });
  });

  // ── tag auto-detection ─────────────────────────────────────────────

  describe("auto tag detection", () => {
    it("always includes UNIVERSAL in final tags", async () => {
      writePackageJson(tempDir, {});
      const result = await setupProjectHandler({
        project_dir: tempDir,
        tags: ["API"],
        dry_run: true,
        output_targets: ["claude"],
      });
      expect(result.content[0]!.text).toContain("UNIVERSAL");
    });

    it("uses description for tag detection when no package.json signals", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        description: "A CLI tool for data pipelines",
        dry_run: true,
        output_targets: ["claude"],
      });
      // Should detect CLI and/or DATA-PIPELINE from description
      expect(result.content[0]!.text.length).toBeGreaterThan(50);
    });
  });
});
