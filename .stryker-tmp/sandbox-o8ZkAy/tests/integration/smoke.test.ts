// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadAllTemplates } from "../../src/registry/loader.js";
import { composeTemplates } from "../../src/registry/composer.js";
import { renderClaudeMd, type RenderContext } from "../../src/registry/renderer.js";
import type { Tag } from "../../src/shared/types.js";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "..", "templates");

/**
 * Smoke test: load all real templates, compose for various tag combos,
 * render CLAUDE.md — verify no crashes, no empty outputs, no duplicates.
 */
describe("smoke tests", () => {
  const templates = loadAllTemplates(TEMPLATES_DIR);

  const tagCombos: Tag[][] = [
    ["UNIVERSAL"],
    ["UNIVERSAL", "API"],
    ["UNIVERSAL", "CLI"],
    ["UNIVERSAL", "LIBRARY"],
    ["UNIVERSAL", "WEB-REACT"],
    ["UNIVERSAL", "WEB-REACT", "API"],
    ["UNIVERSAL", "ANALYTICS"],
    ["UNIVERSAL", "API", "CLI", "LIBRARY"],
  ];

  for (const tags of tagCombos) {
    const label = tags.join(" + ");

    it(`should compose and render [${label}] without errors`, () => {
      const composed = composeTemplates(tags, templates);
      const context: RenderContext = {
        projectName: "SmokeTest",
        language: "typescript",
        tags,
      };
      const claudeMd = renderClaudeMd(composed.claudeMdBlocks, context);

      // Basics
      expect(claudeMd).toContain("# CLAUDE.md");
      expect(claudeMd.length).toBeGreaterThan(100);

      // No duplicate block IDs
      const ids = composed.claudeMdBlocks.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);

      // No duplicate structure paths
      const paths = composed.structureEntries.map((e) => e.path);
      expect(new Set(paths).size).toBe(paths.length);

      // No duplicate hook names
      const hookNames = composed.hooks.map((h) => h.name);
      expect(new Set(hookNames).size).toBe(hookNames.length);

      // No duplicate NFR IDs
      const nfrIds = composed.nfrBlocks.map((n) => n.id);
      expect(new Set(nfrIds).size).toBe(nfrIds.length);
    });
  }

  it("should have UNIVERSAL blocks in every composition", () => {
    for (const tags of tagCombos) {
      const composed = composeTemplates(tags, templates);

      // UNIVERSAL blocks should always be present (since UNIVERSAL templates exist)
      expect(composed.claudeMdBlocks.length).toBeGreaterThan(0);
    }
  });

  it("should never produce unresolved required variables in rendered CLAUDE.md", () => {
    const composed = composeTemplates(["UNIVERSAL", "API"], templates);
    const context: RenderContext = {
      projectName: "VarCheck",
      language: "typescript",
      tags: ["UNIVERSAL", "API"],
    };
    const claudeMd = renderClaudeMd(composed.claudeMdBlocks, context);

    // Variables with defaults should be resolved
    expect(claudeMd).not.toContain("{{max_function_length}}");
    expect(claudeMd).not.toContain("{{max_file_length}}");
    expect(claudeMd).not.toContain("{{max_function_params}}");
  });
});
