import { describe, it, expect } from "vitest";
import { forgecraftHandler } from "../../src/tools/forgecraft-router.js";

describe("forgecraft router", () => {
  // ── List action dispatches ──────────────────────────────────────────

  describe("action: list", () => {
    it("should list tags when resource is 'tags'", async () => {
      const result = await forgecraftHandler({
        action: "list",
        resource: "tags",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Available Tags");
      expect(text).toContain("UNIVERSAL");
    });

    it("should default to listing tags when resource is omitted", async () => {
      const result = await forgecraftHandler({
        action: "list",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Available Tags");
    });

    it("should list hooks when resource is 'hooks'", async () => {
      const result = await forgecraftHandler({
        action: "list",
        resource: "hooks",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Hook");
    });

    it("should list skills when resource is 'skills'", async () => {
      const result = await forgecraftHandler({
        action: "list",
        resource: "skills",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Skill");
    });

    it("should filter hooks by tags when provided", async () => {
      const result = await forgecraftHandler({
        action: "list",
        resource: "hooks",
        tags: ["UNIVERSAL"],
      });

      const text = result.content[0]!.text;
      expect(text).toContain("UNIVERSAL");
    });
  });

  // ── Get reference action dispatches ─────────────────────────────────

  describe("action: get_reference", () => {
    it("should return design patterns by default", async () => {
      const result = await forgecraftHandler({
        action: "get_reference",
        tags: ["UNIVERSAL"],
        resource: "design_patterns",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Design Reference");
    });

    it("should return NFR templates when resource is 'nfr'", async () => {
      const result = await forgecraftHandler({
        action: "get_reference",
        tags: ["UNIVERSAL"],
        resource: "nfr",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("NFR");
    });

    it("should throw when tags are missing", async () => {
      await expect(
        forgecraftHandler({
          action: "get_reference",
          resource: "nfr",
        }),
      ).rejects.toThrow("Missing required parameter 'tags'");
    });
  });

  // ── Classify action ─────────────────────────────────────────────────

  describe("action: classify", () => {
    it("should classify from description", async () => {
      const result = await forgecraftHandler({
        action: "classify",
        description: "A React web application with user authentication",
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Tag");
    });
  });

  // ── Review action ───────────────────────────────────────────────────

  describe("action: review", () => {
    it("should generate a review checklist", async () => {
      const result = await forgecraftHandler({
        action: "review",
        tags: ["UNIVERSAL"],
      });

      const text = result.content[0]!.text;
      expect(text).toContain("Review");
    });

    it("should throw when tags are missing", async () => {
      await expect(
        forgecraftHandler({
          action: "review",
        }),
      ).rejects.toThrow("Missing required parameter 'tags'");
    });
  });

  // ── Required parameter validation ───────────────────────────────────

  describe("parameter validation", () => {
    it("should throw when scaffold is missing project_dir", async () => {
      await expect(
        forgecraftHandler({
          action: "scaffold",
          tags: ["UNIVERSAL"],
        }),
      ).rejects.toThrow("Missing required parameter 'project_dir' for action 'scaffold'");
    });

    it("should throw when scaffold is missing tags", async () => {
      await expect(
        forgecraftHandler({
          action: "scaffold",
          project_dir: "/tmp/test",
        }),
      ).rejects.toThrow("Missing required parameter 'tags' for action 'scaffold'");
    });

    it("should throw when audit is missing project_dir", async () => {
      await expect(
        forgecraftHandler({
          action: "audit",
          tags: ["UNIVERSAL"],
        }),
      ).rejects.toThrow("Missing required parameter 'project_dir' for action 'audit'");
    });

    it("should throw when add_hook is missing name", async () => {
      await expect(
        forgecraftHandler({
          action: "add_hook",
          project_dir: "/tmp/test",
        }),
      ).rejects.toThrow("Missing required parameter 'name' for action 'add_hook'");
    });

    it("should throw when add_module is missing name", async () => {
      await expect(
        forgecraftHandler({
          action: "add_module",
          project_dir: "/tmp/test",
        }),
      ).rejects.toThrow("Missing required parameter 'name' for action 'add_module'");
    });

    it("should throw when convert is missing project_dir", async () => {
      await expect(
        forgecraftHandler({
          action: "convert",
          tags: ["UNIVERSAL"],
        }),
      ).rejects.toThrow("Missing required parameter 'project_dir' for action 'convert'");
    });

    it("should throw when generate is missing tags", async () => {
      await expect(
        forgecraftHandler({
          action: "generate",
        }),
      ).rejects.toThrow("Missing required parameter 'tags' for action 'generate'");
    });

    it("should treat empty tags array as missing", async () => {
      await expect(
        forgecraftHandler({
          action: "generate",
          tags: [],
        }),
      ).rejects.toThrow("Missing required parameter 'tags' for action 'generate'");
    });
  });

  // ── Generate action (no project_dir = return content) ───────────────

  describe("action: generate", () => {
    it("should return instruction file content when project_dir is omitted", async () => {
      const result = await forgecraftHandler({
        action: "generate",
        tags: ["UNIVERSAL"],
      });

      const text = result.content[0]!.text;
      // Should return the rendered instruction file content
      expect(text.length).toBeGreaterThan(100);
    });
  });
});
