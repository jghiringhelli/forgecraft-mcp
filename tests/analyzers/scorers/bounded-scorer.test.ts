import { describe, it, expect } from "vitest";
import { scoreBounded } from "../../../src/analyzers/scorers/bounded-scorer.js";
import type { LayerViolation } from "../../../src/shared/types.js";

function violation(
  file = "routes/user.ts",
  line = 1,
  snippet = "prisma.user.findMany()",
): LayerViolation {
  return { file, line, snippet };
}

describe("scoreBounded", () => {
  it("returns score 2 with no violations", () => {
    const result = scoreBounded([]);
    expect(result.score).toBe(2);
    expect(result.property).toBe("bounded");
    expect(result.evidence[0]).toMatch(/No direct DB/);
  });

  it("returns score 1 for 1 violation", () => {
    const result = scoreBounded([violation()]);
    expect(result.score).toBe(1);
    expect(result.evidence[0]).toMatch(/1 direct DB call/);
  });

  it("returns score 1 for 2 violations", () => {
    const result = scoreBounded([violation(), violation("routes/post.ts", 5)]);
    expect(result.score).toBe(1);
    expect(result.evidence[0]).toMatch(/2 direct DB call/);
  });

  it("returns score 0 for 3 violations", () => {
    const result = scoreBounded([
      violation(),
      violation(),
      violation("routes/c.ts", 9),
    ]);
    expect(result.score).toBe(0);
    expect(result.evidence[0]).toMatch(
      /route layer is calling the DB directly/,
    );
  });

  it("returns score 0 for many violations", () => {
    const violations = Array.from({ length: 10 }, (_, i) =>
      violation("routes/r.ts", i),
    );
    const result = scoreBounded(violations);
    expect(result.score).toBe(0);
  });

  it("includes violation details in score 1 evidence", () => {
    const result = scoreBounded([
      violation("routes/user.ts", 42, "prisma.user.findMany()"),
    ]);
    expect(result.evidence.some((e) => e.includes("routes/user.ts"))).toBe(
      true,
    );
    expect(result.evidence.some((e) => e.includes("42"))).toBe(true);
  });

  it("caps evidence at 5 violations for score 0, appends 'and N more'", () => {
    const violations = Array.from({ length: 8 }, (_, i) =>
      violation("r.ts", i),
    );
    const result = scoreBounded(violations);
    expect(result.evidence.some((e) => e.includes("3 more"))).toBe(true);
  });

  it("does not append 'more' when exactly 5 violations", () => {
    const violations = Array.from({ length: 5 }, (_, i) =>
      violation("r.ts", i),
    );
    const result = scoreBounded(violations);
    expect(result.evidence.some((e) => e.includes("more"))).toBe(false);
  });
});
