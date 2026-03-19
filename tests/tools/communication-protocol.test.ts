/**
 * Tests for the efficient communications module.
 *
 * Covers:
 * - ToolAmbiguity formatting renders correctly (⚡ prefix, all fields)
 * - applyAmbiguityFormatting merges ambiguities into text output
 * - generate_session_prompt triggers ambiguity on short roadmap_item (< 30 chars)
 * - generate_session_prompt does NOT trigger ambiguity on sufficiently long item
 * - generate_session_prompt does NOT trigger ambiguity when cascade is incomplete
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolAmbiguity } from "../../src/shared/types.js";
import { formatAmbiguity, applyAmbiguityFormatting } from "../../src/tools/forgecraft-router.js";
import { generateSessionPromptHandler } from "../../src/tools/generate-session-prompt.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-comms-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(join(dir, relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : ""), {
    recursive: true,
  });
  writeFileSync(fullPath, content, "utf-8");
}

function buildCompleteCascade(dir: string): void {
  write(dir, "docs/PRD.md", "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers.\n");
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(dir, "docs/diagrams/c4-context.md", "```mermaid\nC4Context\n  Person(user, 'User')\n```\n");
  write(dir, "CLAUDE.md", "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n");
  mkdirSync(join(dir, "docs/adrs"), { recursive: true });
  write(dir, "docs/adrs/ADR-0001-stack.md", "# ADR-0001\n## Decision\nUse TypeScript.\n");
  write(dir, "docs/use-cases.md", "# Use Cases\n## UC-001\n**Actor**: user\nPrecondition: logged in\n");
}

const SAMPLE_AMBIGUITY: ToolAmbiguity = {
  field: "roadmap_item",
  understood_as: "Interpreting 'add auth' as JWT-based authentication",
  understood_example: "I would scope the session to: create JWT login/logout endpoints with bcrypt hashing",
  alternatives: [
    {
      label: "If you meant OAuth",
      action: "I would integrate Clerk or Auth0 with redirect-based flow instead",
    },
    {
      label: "If you meant API key auth",
      action: "I would generate a static key table and middleware validator",
    },
  ],
  resolution_hint: "Pass a more specific item_description, e.g. 'Add JWT authentication with email/password login'",
};

// ── ToolAmbiguity formatting ──────────────────────────────────────────

describe("formatAmbiguity", () => {
  it("starts with the ⚡ Ambiguity prefix and field name", () => {
    const output = formatAmbiguity(SAMPLE_AMBIGUITY);
    expect(output).toMatch(/^⚡ Ambiguity — roadmap_item/);
  });

  it("includes the understood_as value", () => {
    const output = formatAmbiguity(SAMPLE_AMBIGUITY);
    expect(output).toContain("Interpreting 'add auth' as JWT-based authentication");
  });

  it("includes the understood_example with → prefix", () => {
    const output = formatAmbiguity(SAMPLE_AMBIGUITY);
    expect(output).toContain("→ Example:");
    expect(output).toContain("create JWT login/logout endpoints");
  });

  it("includes all alternatives with 'Alternative:' prefix", () => {
    const output = formatAmbiguity(SAMPLE_AMBIGUITY);
    expect(output).toContain("Alternative: If you meant OAuth");
    expect(output).toContain("Alternative: If you meant API key auth");
  });

  it("includes the resolution_hint with 'To resolve:' prefix", () => {
    const output = formatAmbiguity(SAMPLE_AMBIGUITY);
    expect(output).toContain("To resolve:");
    expect(output).toContain("more specific item_description");
  });

  it("formats correctly with no alternatives", () => {
    const minimal: ToolAmbiguity = {
      field: "project_type",
      understood_as: "Web API",
      understood_example: "I would scaffold REST endpoints",
      alternatives: [],
      resolution_hint: "Pass project_type_override='api'",
    };
    const output = formatAmbiguity(minimal);
    expect(output).toContain("⚡ Ambiguity — project_type");
    expect(output).not.toContain("Alternative:");
  });
});

// ── applyAmbiguityFormatting ──────────────────────────────────────────

describe("applyAmbiguityFormatting", () => {
  it("returns the result unchanged when there are no ambiguities", () => {
    const result = { content: [{ type: "text" as const, text: "hello" }] };
    const formatted = applyAmbiguityFormatting(result);
    expect(formatted.content[0]!.text).toBe("hello");
  });

  it("returns the result unchanged when ambiguities array is empty", () => {
    const result = { content: [{ type: "text" as const, text: "hello" }], ambiguities: [] };
    const formatted = applyAmbiguityFormatting(result);
    expect(formatted.content[0]!.text).toBe("hello");
  });

  it("prepends ambiguity blocks before the existing text", () => {
    const result = {
      content: [{ type: "text" as const, text: "main output" }],
      ambiguities: [SAMPLE_AMBIGUITY],
    };
    const formatted = applyAmbiguityFormatting(result);
    const text = formatted.content[0]!.text;
    expect(text.indexOf("⚡ Ambiguity")).toBeLessThan(text.indexOf("main output"));
  });

  it("separates ambiguity section from main content with a divider", () => {
    const result = {
      content: [{ type: "text" as const, text: "main output" }],
      ambiguities: [SAMPLE_AMBIGUITY],
    };
    const formatted = applyAmbiguityFormatting(result);
    expect(formatted.content[0]!.text).toContain("---");
  });

  it("formats multiple ambiguities, each with ⚡ prefix", () => {
    const second: ToolAmbiguity = {
      field: "session_type",
      understood_as: "feature",
      understood_example: "I would use feat(scope) commit prefix",
      alternatives: [],
      resolution_hint: "Pass session_type='fix'",
    };
    const result = {
      content: [{ type: "text" as const, text: "body" }],
      ambiguities: [SAMPLE_AMBIGUITY, second],
    };
    const formatted = applyAmbiguityFormatting(result);
    const text = formatted.content[0]!.text;
    expect(text.match(/⚡ Ambiguity/g)?.length).toBe(2);
  });

  it("preserves additional content items beyond the first", () => {
    const result = {
      content: [
        { type: "text" as const, text: "first" },
        { type: "text" as const, text: "second" },
      ],
      ambiguities: [SAMPLE_AMBIGUITY],
    };
    const formatted = applyAmbiguityFormatting(result);
    expect(formatted.content).toHaveLength(2);
    expect(formatted.content[1]!.text).toBe("second");
  });
});

// ── generate_session_prompt ambiguity integration ─────────────────────

describe("generateSessionPromptHandler ambiguity detection", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("adds an ambiguity when item_description is fewer than 30 chars and cascade is complete", async () => {
    buildCompleteCascade(tempDir);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: "add auth",
      session_type: "feature",
    });
    expect(result.ambiguities).toBeDefined();
    expect(result.ambiguities!.length).toBeGreaterThan(0);
    expect(result.ambiguities![0]!.field).toBe("roadmap_item");
  });

  it("ambiguity field mentions the original short description", async () => {
    buildCompleteCascade(tempDir);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: "fix bug",
      session_type: "fix",
    });
    expect(result.ambiguities![0]!.understood_as).toContain("fix bug");
  });

  it("ambiguity resolution_hint instructs user to pass a more specific description", async () => {
    buildCompleteCascade(tempDir);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: "add auth",
      session_type: "feature",
    });
    expect(result.ambiguities![0]!.resolution_hint).toContain("item_description");
  });

  it("does NOT add ambiguity when item_description is 30 chars or more", async () => {
    buildCompleteCascade(tempDir);
    const longItem = "Add paginated GET /users endpoint with DTOs";
    expect(longItem.length).toBeGreaterThanOrEqual(30);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: longItem,
      session_type: "feature",
    });
    expect(result.ambiguities ?? []).toHaveLength(0);
  });

  it("does NOT add ambiguity when cascade is incomplete (do not double-block)", async () => {
    // No cascade setup — cascade will be incomplete
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: "add auth",
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain("Session Prompt Blocked");
    expect(result.ambiguities ?? []).toHaveLength(0);
  });

  it("still generates the prompt content alongside the ambiguity", async () => {
    buildCompleteCascade(tempDir);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: "add auth",
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain("Session Prompt");
    expect(result.ambiguities).toBeDefined();
  });
});
