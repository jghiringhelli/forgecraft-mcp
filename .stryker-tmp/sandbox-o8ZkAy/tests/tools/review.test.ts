/**
 * Tests for the review_project tool handler.
 */
// @ts-nocheck

import { describe, it, expect } from "vitest";
import { reviewProjectHandler } from "../../src/tools/review.js";

describe("reviewProjectHandler", () => {
  it("returns a Code Review Checklist heading", async () => {
    const result = await reviewProjectHandler({
      tags: ["UNIVERSAL"],
      scope: "comprehensive",
    });
    expect(result.content[0]!.text).toContain("Code Review Checklist");
  });

  it("includes tag in output", async () => {
    const result = await reviewProjectHandler({
      tags: ["UNIVERSAL"],
      scope: "comprehensive",
    });
    expect(result.content[0]!.text).toContain("[UNIVERSAL]");
  });

  it("focused scope returns shorter output than comprehensive", async () => {
    const focused = await reviewProjectHandler({
      tags: ["UNIVERSAL"],
      scope: "focused",
    });
    const comprehensive = await reviewProjectHandler({
      tags: ["UNIVERSAL"],
      scope: "comprehensive",
    });
    expect(focused.content[0]!.text.length).toBeLessThanOrEqual(
      comprehensive.content[0]!.text.length,
    );
  });

  it("includes multiple tags in output when specified", async () => {
    const result = await reviewProjectHandler({
      tags: ["UNIVERSAL", "API"],
      scope: "focused",
    });
    expect(result.content[0]!.text).toContain("[API]");
  });
});
