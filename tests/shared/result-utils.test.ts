/**
 * Tests for src/shared/result-utils.ts and
 * the applyResultAnnotation router helper.
 */

import { describe, it, expect } from "vitest";
import {
  annotateResult,
  MAX_TOOL_RESULT_CHARS,
} from "../../src/shared/result-utils.js";
import { applyResultAnnotation } from "../../src/tools/forgecraft-router.js";

// ── annotateResult ─────────────────────────────────────────────────────

describe("annotateResult", () => {
  it("returns short text unchanged (under SIZE_ANNOTATION_THRESHOLD)", () => {
    const text = "ok";
    expect(annotateResult(text)).toBe(text);
  });

  it("returns exactly 1000-char text unchanged (at threshold boundary)", () => {
    const text = "x".repeat(1_000);
    expect(annotateResult(text)).toBe(text);
  });

  it("appends size footer for text just over threshold", () => {
    const text = "x".repeat(1_001);
    const result = annotateResult(text);
    expect(result).toContain("1,001 chars");
    expect(result).toContain("↩");
    expect(result).not.toContain("TRUNCATED");
  });

  it("includes line count in footer", () => {
    const text = "line1\nline2\nline3\n" + "x".repeat(1_000);
    const result = annotateResult(text);
    expect(result).toContain("lines");
  });

  it("truncates text over maxChars and appends TRUNCATED footer", () => {
    const text = "a".repeat(MAX_TOOL_RESULT_CHARS + 100);
    const result = annotateResult(text);
    expect(result).toContain("[TRUNCATED:");
    expect(result).toContain(MAX_TOOL_RESULT_CHARS.toLocaleString());
    expect(result.startsWith("a".repeat(MAX_TOOL_RESULT_CHARS))).toBe(true);
  });

  it("truncated footer shows total original length", () => {
    const total = MAX_TOOL_RESULT_CHARS + 500;
    const text = "b".repeat(total);
    const result = annotateResult(text);
    expect(result).toContain(total.toLocaleString());
  });

  it("respects custom maxChars limit", () => {
    const text = "c".repeat(2_000);
    const result = annotateResult(text, 1_500);
    expect(result).toContain("[TRUNCATED:");
    expect(result).toContain("1,500");
    expect(result).toContain("2,000");
  });

  it("does not truncate when text equals maxChars exactly", () => {
    const text = "d".repeat(MAX_TOOL_RESULT_CHARS);
    const result = annotateResult(text);
    expect(result).not.toContain("[TRUNCATED:");
    expect(result).toContain("↩");
  });

  it("empty string returned unchanged", () => {
    expect(annotateResult("")).toBe("");
  });
});

// ── applyResultAnnotation ─────────────────────────────────────────────

describe("applyResultAnnotation", () => {
  it("returns result unchanged when text is short", () => {
    const result = { content: [{ type: "text" as const, text: "short" }] };
    expect(applyResultAnnotation(result)).toBe(result);
  });

  it("annotates long text results", () => {
    const longText = "x".repeat(2_000);
    const result = { content: [{ type: "text" as const, text: longText }] };
    const annotated = applyResultAnnotation(result);
    expect(annotated.content[0]!.text).toContain("↩");
  });

  it("preserves additional content items unchanged", () => {
    const result = {
      content: [
        { type: "text" as const, text: "x".repeat(2_000) },
        { type: "text" as const, text: "extra" },
      ],
    };
    const annotated = applyResultAnnotation(result);
    expect(annotated.content[1]!.text).toBe("extra");
  });

  it("returns result unchanged when content array is empty", () => {
    const result = { content: [] };
    expect(applyResultAnnotation(result)).toBe(result);
  });

  it("preserves ambiguities field through annotation", () => {
    const result = {
      content: [{ type: "text" as const, text: "x".repeat(2_000) }],
      ambiguities: [
        {
          field: "test",
          understood_as: "x",
          understood_example: "y",
          alternatives: [],
          resolution_hint: "z",
        },
      ],
    };
    const annotated = applyResultAnnotation(result);
    expect(annotated.ambiguities).toBeDefined();
    expect(annotated.ambiguities).toHaveLength(1);
  });
});
