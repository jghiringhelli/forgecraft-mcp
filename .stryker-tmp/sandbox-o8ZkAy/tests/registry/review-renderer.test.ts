// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  renderReviewChecklist,
} from "../../src/registry/renderer.js";
import type { ReviewBlock } from "../../src/shared/types.js";

function makeReviewBlock(
  id: string,
  dimension: ReviewBlock["dimension"],
  overrides: Partial<ReviewBlock> = {},
): ReviewBlock {
  return {
    id,
    dimension,
    title: overrides.title ?? `${dimension} review`,
    description: overrides.description ?? `Evaluate ${dimension}.`,
    checklist: overrides.checklist ?? [
      { id: `${id}-critical`, description: "Critical check", severity: "critical" },
      { id: `${id}-important`, description: "Important check", severity: "important" },
      { id: `${id}-nice`, description: "Nice-to-have check", severity: "nice-to-have" },
    ],
  };
}

describe("renderReviewChecklist", () => {
  it("should render all dimensions in correct order", () => {
    const blocks: ReviewBlock[] = [
      makeReviewBlock("perf", "performance"),
      makeReviewBlock("arch", "architecture"),
      makeReviewBlock("tests", "tests"),
      makeReviewBlock("quality", "code-quality"),
    ];

    const result = renderReviewChecklist(blocks, "comprehensive");

    const archIdx = result.indexOf("## Architecture Review");
    const qualityIdx = result.indexOf("## Code Quality Review");
    const testsIdx = result.indexOf("## Test Review");
    const perfIdx = result.indexOf("## Performance Review");

    expect(archIdx).toBeGreaterThanOrEqual(0);
    expect(qualityIdx).toBeGreaterThan(archIdx);
    expect(testsIdx).toBeGreaterThan(qualityIdx);
    expect(perfIdx).toBeGreaterThan(testsIdx);
  });

  it("should include all severity levels in comprehensive scope", () => {
    const blocks = [makeReviewBlock("arch", "architecture")];
    const result = renderReviewChecklist(blocks, "comprehensive");

    expect(result).toContain("Critical check");
    expect(result).toContain("Important check");
    expect(result).toContain("Nice-to-have check");
  });

  it("should include only critical items in focused scope", () => {
    const blocks = [makeReviewBlock("arch", "architecture")];
    const result = renderReviewChecklist(blocks, "focused");

    expect(result).toContain("Critical check");
    expect(result).not.toContain("Important check");
    expect(result).not.toContain("Nice-to-have check");
  });

  it("should include severity icons", () => {
    const blocks = [makeReviewBlock("arch", "architecture")];
    const result = renderReviewChecklist(blocks, "comprehensive");

    expect(result).toContain("🔴");
    expect(result).toContain("🟡");
    expect(result).toContain("🟢");
  });

  it("should include per-issue output format guidance", () => {
    const blocks = [makeReviewBlock("arch", "architecture")];
    const result = renderReviewChecklist(blocks, "comprehensive");

    expect(result).toContain("Per-Issue Output Format");
    expect(result).toContain("Problem");
    expect(result).toContain("Options");
    expect(result).toContain("Recommendation");
    expect(result).toContain("Confirmation");
  });

  it("should skip dimensions with no blocks", () => {
    const blocks = [makeReviewBlock("arch", "architecture")];
    const result = renderReviewChecklist(blocks, "comprehensive");

    expect(result).toContain("## Architecture Review");
    expect(result).not.toContain("## Code Quality Review");
    expect(result).not.toContain("## Test Review");
    expect(result).not.toContain("## Performance Review");
  });

  it("should handle empty blocks array", () => {
    const result = renderReviewChecklist([], "comprehensive");

    // Should still have the per-issue format but no dimension sections
    expect(result).toContain("Per-Issue Output Format");
    expect(result).not.toContain("## Architecture Review");
  });

  it("should group multiple blocks under the same dimension", () => {
    const blocks: ReviewBlock[] = [
      makeReviewBlock("arch-general", "architecture", { title: "General Architecture" }),
      makeReviewBlock("arch-api", "architecture", { title: "API Architecture" }),
    ];

    const result = renderReviewChecklist(blocks, "comprehensive");

    expect(result).toContain("### General Architecture");
    expect(result).toContain("### API Architecture");
  });
});
