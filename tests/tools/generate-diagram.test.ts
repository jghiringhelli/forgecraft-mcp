/**
 * Tests for the generate_diagram tool handler.
 *
 * Covers: diagram generation from mock spec files, actor extraction,
 * external system nodes from tags, fallback behavior when files are absent.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateDiagramHandler } from "../../src/tools/generate-diagram.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-diagram-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(join(dir, relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : ""), {
    recursive: true,
  });
  writeFileSync(fullPath, content, "utf-8");
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("generateDiagramHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── Output structure ──────────────────────────────────────────────

  describe("output structure", () => {
    it("returns a single text content item", async () => {
      const result = await generateDiagramHandler({ project_dir: tempDir });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });

    it("creates docs/diagrams/c4-context.md", async () => {
      await generateDiagramHandler({ project_dir: tempDir });
      expect(existsSync(join(tempDir, "docs", "diagrams", "c4-context.md"))).toBe(true);
    });

    it("response text contains the generated diagram content", async () => {
      const result = await generateDiagramHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("C4Context");
    });

    it("response text confirms the output path", async () => {
      const result = await generateDiagramHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("docs/diagrams/c4-context.md");
    });

    it("generated file contains valid Mermaid C4Context fenced block", async () => {
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("```mermaid");
      expect(content).toContain("C4Context");
      expect(content).toContain("```");
    });
  });

  // ── Project name ──────────────────────────────────────────────────

  describe("project name", () => {
    it("uses project_name from forgecraft.yaml when present", async () => {
      write(tempDir, "forgecraft.yaml", "project_name: MyAwesomeApp\ntags: [UNIVERSAL]\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("MyAwesomeApp");
    });

    it("falls back to directory name when forgecraft.yaml is absent", async () => {
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      // Should contain SOME system node (name derived from temp dir)
      expect(content).toContain("System(system,");
    });
  });

  // ── Actor extraction ──────────────────────────────────────────────

  describe("actor extraction from use-cases.md", () => {
    it("includes a Person node for each unique actor found in use-cases.md", async () => {
      write(tempDir, "docs/use-cases.md",
        "# Use Cases\n## UC-01\n**Actor**: Admin\n## UC-02\n**Actor**: Developer\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain(`Person(admin`);
      expect(content).toContain(`Person(developer`);
    });

    it("deduplicates actors that appear multiple times", async () => {
      write(tempDir, "docs/use-cases.md",
        "# Use Cases\n## UC-01\n**Actor**: User\n## UC-02\n**Actor**: User\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      const matches = content.match(/Person\(user/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it("skips actors that are FILL markers", async () => {
      write(tempDir, "docs/use-cases.md",
        "# Use Cases\n## UC-01\n**Actor**: <!-- FILL: who? -->\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      // Should use default "User" since no real actors found
      expect(content).toContain(`Person(user,`);
    });

    it("falls back to 'User' when no use-cases.md exists", async () => {
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain(`Person(user,`);
    });
  });

  // ── External system nodes from tags ───────────────────────────────

  describe("external system nodes from tags", () => {
    it("adds API client node when API tag is present", async () => {
      write(tempDir, "forgecraft.yaml", "project_name: ApiProject\ntags:\n  - UNIVERSAL\n  - API\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("api_clients");
    });

    it("adds blockchain node when WEB3 tag is present", async () => {
      write(tempDir, "forgecraft.yaml", "project_name: Web3App\ntags:\n  - UNIVERSAL\n  - WEB3\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("blockchain");
    });

    it("adds data source and sink nodes when DATA-PIPELINE tag is present", async () => {
      write(tempDir, "forgecraft.yaml",
        "project_name: Pipeline\ntags:\n  - UNIVERSAL\n  - DATA-PIPELINE\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("data_sources");
      expect(content).toContain("data_sinks");
    });

    it("has no external nodes for UNIVERSAL-only tag set", async () => {
      write(tempDir, "forgecraft.yaml", "project_name: Simple\ntags:\n  - UNIVERSAL\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).not.toContain("System_Ext");
    });
  });

  // ── PRD content extraction ────────────────────────────────────────

  describe("PRD content extraction", () => {
    it("uses Users section content in the System node description", async () => {
      write(tempDir, "forgecraft.yaml", "project_name: TestApp\ntags: [UNIVERSAL]\n");
      write(tempDir, "docs/PRD.md",
        "# PRD\n## Problem\nSolves deployment pain.\n## Users\nEngineers who deploy code.\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("Engineers who deploy code.");
    });

    it("falls back to Problem section when Users section is empty", async () => {
      write(tempDir, "forgecraft.yaml", "project_name: TestApp\ntags: [UNIVERSAL]\n");
      write(tempDir, "docs/PRD.md",
        "# PRD\n## Problem\nSolves complex scheduling.\n## Users\n<!-- FILL -->\n");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).toContain("Solves complex scheduling.");
    });

    it("uses fallback description when no PRD.md exists", async () => {
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      // Should still produce a valid System node with fallback text
      expect(content).toContain("System(system,");
    });
  });

  // ── File creation ─────────────────────────────────────────────────

  describe("file creation", () => {
    it("creates docs/diagrams/ directory if it does not exist", async () => {
      await generateDiagramHandler({ project_dir: tempDir });
      expect(existsSync(join(tempDir, "docs", "diagrams"))).toBe(true);
    });

    it("overwrites existing c4-context.md with fresh content", async () => {
      mkdirSync(join(tempDir, "docs", "diagrams"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "old content", "utf-8");
      await generateDiagramHandler({ project_dir: tempDir });
      const content = readFileSync(join(tempDir, "docs", "diagrams", "c4-context.md"), "utf-8");
      expect(content).not.toBe("old content");
      expect(content).toContain("C4Context");
    });
  });
});
