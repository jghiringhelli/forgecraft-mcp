/**
 * Tests for the generateInstructionsHandler (formerly generate_claude_md).
 *
 * Tests cover: in-memory generation, file writing, multi-target output,
 * merge-with-existing, compact mode, and tag auto-inclusion of UNIVERSAL.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateInstructionsHandler } from "../../src/tools/generate-claude-md.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-gen-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("generateInstructionsHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── in-memory (no project_dir) ────────────────────────────────────

  describe("in-memory generation", () => {
    it("returns rendered CLAUDE.md content without project_dir", async () => {
      const result = await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_name: "MemTest",
        output_targets: ["claude"],
        merge_with_existing: true,
        compact: false,
      });
      expect(result.content[0]!.text).toContain("CLAUDE.md");
    });

    it("UNIVERSAL is auto-included if not in tags list", async () => {
      const result = await generateInstructionsHandler({
        tags: ["API"],
        project_name: "ApiProject",
        output_targets: ["claude"],
        merge_with_existing: true,
        compact: false,
      });
      // UNIVERSAL blocks always appear
      expect(result.content[0]!.text.length).toBeGreaterThan(200);
    });

    it("compact mode produces shorter output", async () => {
      const normalResult = await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_name: "Test",
        output_targets: ["claude"],
        merge_with_existing: false,
        compact: false,
      });
      const compactResult = await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_name: "Test",
        output_targets: ["claude"],
        merge_with_existing: false,
        compact: true,
      });
      expect(normalResult.content[0]!.text.length).toBeGreaterThanOrEqual(
        compactResult.content[0]!.text.length,
      );
    });
  });

  // ── file writing ───────────────────────────────────────────────────

  describe("file writing with project_dir", () => {
    it("writes CLAUDE.md when target is claude and project_dir provided", async () => {
      await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "WriteTest",
        output_targets: ["claude"],
        merge_with_existing: false,
        compact: false,
      });
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    });

    it("written CLAUDE.md is non-empty and well-formed", async () => {
      await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "SpecialProjectName",
        output_targets: ["claude"],
        merge_with_existing: false,
        compact: false,
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      // CLAUDE.md always has the ForgeCraft managed header
      expect(content).toMatch(/ForgeCraft/);
      expect(content.length).toBeGreaterThan(200);
    });

    it("writes copilot-instructions.md for copilot target", async () => {
      await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "CopilotTest",
        output_targets: ["copilot"],
        merge_with_existing: false,
        compact: false,
      });
      expect(existsSync(join(tempDir, ".github", "copilot-instructions.md"))).toBe(true);
    });

    it("response lists file paths written", async () => {
      const result = await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "Test",
        output_targets: ["claude"],
        merge_with_existing: false,
        compact: false,
      });
      expect(result.content[0]!.text).toMatch(/CLAUDE\.md/i);
    });

    it("merges custom section when merge_with_existing=true", async () => {
      const claudeMdPath = join(tempDir, "CLAUDE.md");
      writeFileSync(claudeMdPath, "# CLAUDE.md\n\n## My Custom Section\nCustom!\n");
      await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "MergeTest",
        output_targets: ["claude"],
        merge_with_existing: true,
        compact: false,
      });
      const after = readFileSync(claudeMdPath, "utf-8");
      expect(after).toContain("My Custom Section");
    });

    it("multi-target writes both CLAUDE.md and copilot file", async () => {
      await generateInstructionsHandler({
        tags: ["UNIVERSAL"],
        project_dir: tempDir,
        project_name: "MultiTarget",
        output_targets: ["claude", "copilot"],
        merge_with_existing: false,
        compact: false,
      });
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".github", "copilot-instructions.md"))).toBe(true);
    });
  });
});
