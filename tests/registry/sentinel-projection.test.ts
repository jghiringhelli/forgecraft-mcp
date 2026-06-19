/**
 * Tests for the multi-agent sentinel projection (PT-2).
 *
 * Covers:
 *  - the canonical body is DETERMINISTIC (no date drift across renders)
 *  - each projection transform (pure copies + cursor MDC frontmatter)
 *  - projectSentinel of an unknown target returns null
 */

import { describe, it, expect } from "vitest";
import type { InstructionBlock } from "../../src/shared/types.js";
import type { RenderContext } from "../../src/registry/renderer.js";
import { buildCursorFrontmatter } from "../../src/registry/renderer.js";
import {
  renderCanonicalSentinel,
  projectSentinel,
  SENTINEL_PROJECTIONS,
  SENTINEL_COPY_TARGETS,
} from "../../src/registry/sentinel-projection.js";

function makeBlock(id: string, content: string): InstructionBlock {
  return { id, title: id, content };
}

const context: RenderContext = {
  projectName: "Acme",
  language: "typescript",
  tags: ["UNIVERSAL"],
};

const blocks: InstructionBlock[] = [
  makeBlock("a", "## Section A\n- rule one\n- rule two"),
  makeBlock("b", "## Section B\n- rule three"),
];

describe("renderCanonicalSentinel", () => {
  it("is deterministic — no date line, byte-identical across renders", () => {
    const first = renderCanonicalSentinel(blocks, context);
    const second = renderCanonicalSentinel(blocks, context);
    expect(first).toBe(second);
  });

  it("embeds NO ISO date (the #1 drift risk)", () => {
    const body = renderCanonicalSentinel(blocks, context);
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("includes the AGENTS.md heading and the rendered block content", () => {
    const body = renderCanonicalSentinel(blocks, context);
    expect(body).toContain("# AGENTS.md");
    expect(body).toContain("Section A");
    expect(body).toContain("rule three");
  });

  it("honors compact mode", () => {
    const verbose = [
      makeBlock(
        "c",
        "## C\n- do the thing. This ensures correctness.\n- do the thing. This ensures correctness.",
      ),
    ];
    const body = renderCanonicalSentinel(verbose, context, { compact: true });
    // explanatory tail stripped + duplicate bullet de-duplicated
    expect(body).not.toContain("This ensures correctness");
    expect(body.match(/- do the thing\./g)?.length).toBe(1);
  });
});

describe("SENTINEL_PROJECTIONS", () => {
  it("maps the expected copy targets (claude/cnt excluded)", () => {
    expect([...SENTINEL_COPY_TARGETS].sort()).toEqual(
      ["agents-md", "cline", "copilot", "cursor", "windsurf"].sort(),
    );
    expect(SENTINEL_PROJECTIONS["claude"]).toBeUndefined();
  });

  it("uses the canonical paths", () => {
    expect(SENTINEL_PROJECTIONS["agents-md"]?.path).toBe("AGENTS.md");
    expect(SENTINEL_PROJECTIONS["copilot"]?.path).toBe(
      ".github/copilot-instructions.md",
    );
    expect(SENTINEL_PROJECTIONS["cline"]?.path).toBe(".clinerules");
    expect(SENTINEL_PROJECTIONS["windsurf"]?.path).toBe(
      ".windsurf/rules/agents.md",
    );
    expect(SENTINEL_PROJECTIONS["cursor"]?.path).toBe(
      ".cursor/rules/agents.mdc",
    );
  });
});

describe("projectSentinel", () => {
  const body = renderCanonicalSentinel(blocks, context);

  it("agents-md / copilot / cline / windsurf are pure copies of the body", () => {
    for (const target of ["agents-md", "copilot", "cline", "windsurf"]) {
      expect(projectSentinel(target, body, context)).toBe(body);
    }
  });

  it("cursor prepends MDC frontmatter to the body", () => {
    const projected = projectSentinel("cursor", body, context);
    const frontmatter = buildCursorFrontmatter(context);
    expect(projected).toBe(`${frontmatter}${body}`);
    expect(projected?.startsWith("---\n")).toBe(true);
    expect(projected).toContain("alwaysApply: true");
  });

  it("returns null for an unknown target (e.g. claude)", () => {
    expect(projectSentinel("claude", body, context)).toBeNull();
    expect(projectSentinel("nope", body, context)).toBeNull();
  });
});
