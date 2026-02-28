import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { loadAllTemplates } from "../../src/registry/loader.js";
import { composeTemplates } from "../../src/registry/composer.js";
import { renderClaudeMd, type RenderContext } from "../../src/registry/renderer.js";
import { listTagsHandler, listHooksHandler } from "../../src/tools/list.js";
import { classifyProjectHandler } from "../../src/tools/classify.js";
import { reviewProjectHandler } from "../../src/tools/review.js";
import { getDesignReferenceHandler } from "../../src/tools/get-reference.js";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "..", "templates");
const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

function makeContext(): RenderContext {
  return {
    projectName: "IntegrationTest",
    language: "typescript",
    tags: ["UNIVERSAL", "API"],
  };
}

describe("integration", () => {
  describe("full template pipeline", () => {
    it("should load → compose → render CLAUDE.md end-to-end", () => {
      const templates = loadAllTemplates(TEMPLATES_DIR);
      const composed = composeTemplates(["UNIVERSAL", "API"], templates);
      const claudeMd = renderClaudeMd(composed.claudeMdBlocks, makeContext());

      // Should have content from both UNIVERSAL and API
      expect(claudeMd).toContain("# CLAUDE.md");
      expect(claudeMd).toContain("Code Standards");  // UNIVERSAL block
      expect(claudeMd).toContain("API");              // API block
    });

    it("should compose WEB-REACT + API without conflicts", () => {
      const templates = loadAllTemplates(TEMPLATES_DIR);
      const composed = composeTemplates(["UNIVERSAL", "WEB-REACT", "API"], templates);

      // Should have blocks from all three tags
      expect(composed.claudeMdBlocks.length).toBeGreaterThan(3);

      // No duplicate IDs
      const ids = composed.claudeMdBlocks.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);

      // No duplicate structure paths
      const paths = composed.structureEntries.map((e) => e.path);
      expect(new Set(paths).size).toBe(paths.length);
    });
  });

  describe("list_tags tool", () => {
    it("should return formatted tag list", async () => {
      const result = await listTagsHandler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text).toContain("UNIVERSAL");
      expect(result.content[0]!.text).toContain("WEB-REACT");
      expect(result.content[0]!.text).toContain("Available Tags (24)");
    });
  });

  describe("list_hooks tool", () => {
    it("should return hooks from all tags", async () => {
      const result = await listHooksHandler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.text).toContain("Available Hooks");
      expect(result.content[0]!.text).toContain("branch-protection");
    });

    it("should filter hooks by tag", async () => {
      const result = await listHooksHandler({ tags: ["WEB-REACT"] });

      expect(result.content[0]!.text).toContain("WEB-REACT");
      // Should NOT contain UNIVERSAL-only hooks
      expect(result.content[0]!.text).not.toContain("[UNIVERSAL]");
    });
  });

  describe("classify_project tool", () => {
    it("should classify from description", async () => {
      const result = await classifyProjectHandler({
        description: "A React dashboard with REST API backend",
      });

      expect(result.content[0]!.text).toContain("WEB-REACT");
      expect(result.content[0]!.text).toContain("API");
    });

    it("should classify from project directory", async () => {
      const dir = join(FIXTURES_DIR, "classify-test");
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ dependencies: { express: "^4.0.0", commander: "^11.0.0" } }),
      );

      const result = await classifyProjectHandler({ project_dir: dir });

      expect(result.content[0]!.text).toContain("API");
      expect(result.content[0]!.text).toContain("CLI");

      rmSync(dir, { recursive: true });
    });

    it("should always include UNIVERSAL", async () => {
      const result = await classifyProjectHandler({
        description: "Just a simple thing",
      });

      expect(result.content[0]!.text).toContain("UNIVERSAL");
    });
  });

  describe("review_project tool", () => {
    it("should return review checklist for UNIVERSAL tag", async () => {
      const result = await reviewProjectHandler({ tags: ["UNIVERSAL"], scope: "comprehensive" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.text).toContain("Code Review Checklist");
      expect(result.content[0]!.text).toContain("Architecture Review");
      expect(result.content[0]!.text).toContain("Code Quality Review");
      expect(result.content[0]!.text).toContain("Test Review");
      expect(result.content[0]!.text).toContain("Performance Review");
    });

    it("should include tag-specific review items for API", async () => {
      const result = await reviewProjectHandler({ tags: ["API"], scope: "comprehensive" });

      expect(result.content[0]!.text).toContain("[API]");
      expect(result.content[0]!.text).toContain("API Architecture Review");
    });

    it("should filter to critical items in focused scope", async () => {
      const comprehensive = await reviewProjectHandler({ tags: ["UNIVERSAL"], scope: "comprehensive" });
      const focused = await reviewProjectHandler({ tags: ["UNIVERSAL"], scope: "focused" });

      // Focused should be shorter — fewer items
      expect(focused.content[0]!.text.length).toBeLessThan(comprehensive.content[0]!.text.length);
      expect(focused.content[0]!.text).toContain("[CRITICAL]");
      expect(focused.content[0]!.text).not.toContain("[NICE-TO-HAVE]");
    });

    it("should compose review blocks from multiple tags without duplicates", async () => {
      const result = await reviewProjectHandler({ tags: ["UNIVERSAL", "WEB-REACT", "API"], scope: "comprehensive" });

      expect(result.content[0]!.text).toContain("React Architecture Review");
      expect(result.content[0]!.text).toContain("API Architecture Review");
      expect(result.content[0]!.text).toContain("Per-Issue Output Format");
    });

    it("should include per-issue output format guidance", async () => {
      const result = await reviewProjectHandler({ tags: ["UNIVERSAL"], scope: "comprehensive" });

      expect(result.content[0]!.text).toContain("Problem");
      expect(result.content[0]!.text).toContain("Options");
      expect(result.content[0]!.text).toContain("Recommendation");
      expect(result.content[0]!.text).toContain("Confirmation");
    });
  });

  describe("get_design_reference tool", () => {
    it("should return DDD, CQRS, and GoF patterns on demand", async () => {
      const result = await getDesignReferenceHandler({ tags: ["UNIVERSAL"] });

      const text = result.content[0]!.text;
      expect(text).toContain("Domain-Driven Design");
      expect(text).toContain("CQRS");
      expect(text).toContain("Design Patterns");
      expect(text).toContain("Patterns:** 3");
    });

    it("should not include reference patterns in instruction file output", () => {
      const templates = loadAllTemplates(TEMPLATES_DIR);
      const composed = composeTemplates(["UNIVERSAL"], templates);
      const claudeMd = renderClaudeMd(composed.claudeMdBlocks, makeContext());

      // DDD, CQRS, Design Patterns should NOT be in the instruction file
      expect(claudeMd).not.toContain("Domain-Driven Design (DDD) Essentials");
      expect(claudeMd).not.toContain("CQRS (Command Query Responsibility Segregation)");
      expect(claudeMd).not.toContain("Design Patterns — When to Reach for What");

      // But TDD should be in the instruction file
      expect(claudeMd).toContain("Test-Driven Development (TDD)");
      expect(claudeMd).toContain("Red-Green-Refactor");
    });
  });
});
