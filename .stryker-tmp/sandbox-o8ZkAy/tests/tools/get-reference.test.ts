// @ts-nocheck
import { describe, it, expect } from "vitest";
import { getDesignReferenceHandler, getGuidanceHandler } from "../../src/tools/get-reference.js";
import { composeTemplates } from "../../src/registry/composer.js";
import { loadAllTemplates } from "../../src/registry/loader.js";
import type { Tag } from "../../src/shared/types.js";

describe("get_design_reference tool", () => {
  it("should return reference patterns for UNIVERSAL tag", async () => {
    const result = await getDesignReferenceHandler({ tags: ["UNIVERSAL"] });

    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;
    expect(text).toContain("Design Reference Patterns");
    expect(text).toContain("Domain-Driven Design");
    expect(text).toContain("CQRS");
    expect(text).toContain("Design Patterns");
  });

  it("should include all 3 reference blocks", async () => {
    const result = await getDesignReferenceHandler({ tags: ["UNIVERSAL"] });

    const text = result.content[0]!.text;
    expect(text).toContain("Patterns:** 3");
  });

  it("should include on-demand notice", async () => {
    const result = await getDesignReferenceHandler({ tags: ["UNIVERSAL"] });

    const text = result.content[0]!.text;
    expect(text).toContain("served on demand to save tokens");
    expect(text).toContain("NOT included in your instruction files");
  });

  it("should auto-prepend UNIVERSAL when not specified", async () => {
    const result = await getDesignReferenceHandler({ tags: ["API"] });

    const text = result.content[0]!.text;
    // UNIVERSAL reference blocks should still be included
    expect(text).toContain("Domain-Driven Design");
  });
});

describe("getGuidanceHandler", () => {
  it("returns exactly 5 guidance blocks", async () => {
    const result = await getGuidanceHandler();
    const text = result.content[0]!.text;
    expect(text).toContain("Procedures:** 5");
  });

  it("contains all five GS procedure topics", async () => {
    const result = await getGuidanceHandler();
    const text = result.content[0]!.text;
    expect(text).toContain("Session Loop");
    expect(text).toContain("Context Loading Strategy");
    expect(text).toContain("Incremental Cascade");
    expect(text).toContain("Bound Roadmap");
    expect(text).toContain("Diagnostic Checklist");
  });

  it("includes the on-demand notice", async () => {
    const result = await getGuidanceHandler();
    const text = result.content[0]!.text;
    expect(text).toContain("get_reference(resource: guidance)");
    expect(text).toContain("NOT inlined in instruction files");
  });

  it("guidance blocks are NOT present in composeTemplates instruction blocks", async () => {
    const templateSets = await loadAllTemplates();
    const composed = composeTemplates(["UNIVERSAL" as Tag], templateSets);

    const guidanceIds = composed.referenceBlocks
      .filter((b) => b.topic === "guidance")
      .map((b) => b.id);

    // Guidance block IDs must not appear in instruction blocks
    const instructionIds = composed.instructionBlocks.map((b) => b.id);
    for (const id of guidanceIds) {
      expect(instructionIds).not.toContain(id);
    }
  });

  it("design_patterns handler excludes guidance blocks", async () => {
    const result = await getDesignReferenceHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    // Guidance block titles should not appear in design patterns output
    expect(text).not.toContain("Session Loop");
    expect(text).not.toContain("Diagnostic Checklist");
  });
});
