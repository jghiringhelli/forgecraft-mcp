import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { loadAllTemplates, loadUserOverrides } from "../../src/registry/loader.js";
import type { Tag } from "../../src/shared/types.js";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "..", "templates");

describe("loader", () => {
  describe("loadAllTemplates", () => {
    let templates: Map<Tag, ReturnType<typeof loadAllTemplates> extends Map<Tag, infer V> ? V : never>;

    beforeAll(() => {
      templates = loadAllTemplates(TEMPLATES_DIR);
    });

    it("should load templates from the templates directory", () => {
      expect(templates.size).toBeGreaterThan(0);
    });

    it("should include UNIVERSAL tag", () => {
      expect(templates.has("UNIVERSAL")).toBe(true);
    });

    it("should include API tag", () => {
      expect(templates.has("API")).toBe(true);
    });

    it("should include CLI tag", () => {
      expect(templates.has("CLI")).toBe(true);
    });

    it("should load UNIVERSAL instruction blocks", () => {
      const universal = templates.get("UNIVERSAL")!;
      expect(universal.instructions).toBeDefined();
      expect(universal.instructions!.blocks.length).toBeGreaterThan(0);
    });

    it("should load UNIVERSAL structure entries", () => {
      const universal = templates.get("UNIVERSAL")!;
      expect(universal.structure).toBeDefined();
      expect(universal.structure!.entries.length).toBeGreaterThan(0);
    });

    it("should load UNIVERSAL hooks", () => {
      const universal = templates.get("UNIVERSAL")!;
      expect(universal.hooks).toBeDefined();
      expect(universal.hooks!.length).toBeGreaterThan(0);
    });

    it("should load UNIVERSAL NFR blocks", () => {
      const universal = templates.get("UNIVERSAL")!;
      expect(universal.nfr).toBeDefined();
      expect(universal.nfr!.blocks.length).toBeGreaterThan(0);
    });

    it("should load UNIVERSAL review blocks", () => {
      const universal = templates.get("UNIVERSAL")!;
      expect(universal.review).toBeDefined();
      expect(universal.review!.blocks.length).toBeGreaterThan(0);
    });

    it("should load UNIVERSAL reference blocks", () => {
      const universal = templates.get("UNIVERSAL")!;
      expect(universal.reference).toBeDefined();
      expect(universal.reference!.blocks.length).toBe(3);
    });

    it("should load reference blocks with expected IDs", () => {
      const universal = templates.get("UNIVERSAL")!;
      const ids = universal.reference!.blocks.map((b) => b.id);
      expect(ids).toContain("domain-driven-design");
      expect(ids).toContain("cqrs-event-patterns");
      expect(ids).toContain("design-patterns-reference");
    });

    it("should load review blocks with valid dimensions", () => {
      const universal = templates.get("UNIVERSAL")!;
      const validDimensions = ["architecture", "code-quality", "tests", "performance"];
      for (const block of universal.review!.blocks) {
        expect(validDimensions).toContain(block.dimension);
        expect(block.checklist.length).toBeGreaterThan(0);
      }
    });

    it("should load API review blocks", () => {
      const api = templates.get("API")!;
      expect(api.review).toBeDefined();
      expect(api.review!.blocks.length).toBeGreaterThan(0);
    });

    it("should have correct tag on each template set", () => {
      for (const [tag, templateSet] of templates) {
        expect(templateSet.tag).toBe(tag);
      }
    });

    it("should load API-specific instruction blocks", () => {
      const api = templates.get("API")!;
      expect(api.instructions).toBeDefined();
      expect(api.instructions!.blocks.some((b) => b.id === "api-standards")).toBe(true);
    });

    it("should have unique block IDs within a template", () => {
      for (const [_tag, templateSet] of templates) {
        if (templateSet.instructions?.blocks) {
          const ids = templateSet.instructions.blocks.map((b) => b.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    });
  });

  describe("loadUserOverrides", () => {
    it("should return null when .forgecraft.json does not exist", () => {
      const result = loadUserOverrides("/nonexistent/directory");
      expect(result).toBeNull();
    });
  });
});
