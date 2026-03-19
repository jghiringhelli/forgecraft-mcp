/**
 * Tests for shared/types — verifies exported constants and type contracts.
 */
import { describe, it, expect } from "vitest";
import { ALL_TAGS } from "../../src/shared/types.js";

describe("ALL_TAGS", () => {
  it("contains exactly 27 tags", () => {
    expect(ALL_TAGS).toHaveLength(27);
  });

  it("starts with UNIVERSAL", () => {
    expect(ALL_TAGS[0]).toBe("UNIVERSAL");
  });

  it("includes standard domain tags", () => {
    const required = [
      "API",
      "CLI",
      "LIBRARY",
      "WEB-REACT",
      "FINTECH",
      "ML",
    ] as const;
    for (const tag of required) {
      expect(ALL_TAGS).toContain(tag);
    }
  });

  it("has no duplicate tags", () => {
    const unique = new Set(ALL_TAGS);
    expect(unique.size).toBe(ALL_TAGS.length);
  });
});
