import { describe, it, expect } from "vitest";
import { getDesignReferenceHandler } from "../../src/tools/get-reference.js";

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
