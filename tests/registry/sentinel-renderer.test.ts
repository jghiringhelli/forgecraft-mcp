/**
 * Tests for the sentinel tree renderer.
 *
 * Tests cover: CLAUDE.md structure, critical rules, project identity, domain file
 * routing, unknown-ID fallback to protocols, wayfinding table, and empty-input behaviour.
 */

import { describe, it, expect } from "vitest";
import {
  renderSentinelTree,
  type SentinelFile,
} from "../../src/registry/sentinel-renderer.js";
import type { InstructionBlock } from "../../src/shared/types.js";
import type { RenderContext } from "../../src/registry/renderer.js";

// ── Fixtures ────────────────────────────────────────────────────────────

const context: RenderContext = {
  projectName: "TestProject",
  language: "typescript",
  repoUrl: "https://github.com/test/test",
  framework: "none",
  domain: "none",
  sensitiveData: "NO",
  tags: ["UNIVERSAL"],
  releasePhase: "development",
};

/** Minimal helper to build an InstructionBlock for tests. */
function makeBlock(
  id: string,
  title: string,
  content: string,
): InstructionBlock {
  return { id, title, content };
}

/** Known architecture block ID (maps to `.claude/standards/architecture.md`). */
const architectureBlock = makeBlock(
  "production-code-standards",
  "Production Code Standards",
  "## Production Code Standards\nAll config via env vars.",
);

/** Known testing block ID (maps to `.claude/standards/testing.md`). */
const testingBlock = makeBlock(
  "testing-pyramid",
  "Testing Pyramid",
  "## Testing Pyramid\nUnit → integration → E2E.",
);

/** Block with an ID that is not in the domain map → falls back to protocols. */
const unknownBlock = makeBlock(
  "unknown-xyz-block",
  "Unknown Block",
  "## Unknown\nSome content.",
);

// ── Helpers ─────────────────────────────────────────────────────────────

function claudeMd(files: SentinelFile[]): SentinelFile {
  const found = files.find((f) => f.relativePath === "CLAUDE.md");
  if (!found) throw new Error("CLAUDE.md not found in rendered output");
  return found;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("renderSentinelTree", () => {
  it("returns_claude_md_as_first_file", () => {
    const files = renderSentinelTree([architectureBlock], context);

    expect(files.length).toBeGreaterThan(0);
    expect(files[0]!.relativePath).toBe("CLAUDE.md");
  });

  it("claude_md_is_sentinel_not_monolithic", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    const lineCount = content.split("\n").length;

    expect(lineCount).toBeLessThan(100);
    expect(content).toContain("ForgeCraft sentinel");
  });

  it("claude_md_contains_critical_rules", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);

    expect(content).toContain("Hygiene");
    expect(content).toContain("Code integrity");
    expect(content).toContain("Commits");
    expect(content).toContain("Data");
    expect(content).toContain("TDD");
  });

  it("claude_md_contains_project_name", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);

    expect(content).toContain(context.projectName);
  });

  it("domain_files_written_for_active_domains", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain(".claude/standards/architecture.md");
  });

  it("domain_file_paths_are_correct", () => {
    const files = renderSentinelTree(
      [architectureBlock, testingBlock],
      context,
    );
    const domainFiles = files.filter((f) => f.relativePath !== "CLAUDE.md");

    expect(domainFiles.length).toBeGreaterThan(0);
    for (const file of domainFiles) {
      expect(file.relativePath).toMatch(/^\.claude\/standards\/[^/]+\.md$/);
    }
  });

  it("unknown_block_ids_go_to_protocols", () => {
    const files = renderSentinelTree([unknownBlock], context);
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain(".claude/standards/protocols.md");
  });

  it("wayfinding_table_includes_project_specific", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);

    expect(content).toContain("project-specific.md");
  });

  it("empty_blocks_returns_only_claude_md", () => {
    const files = renderSentinelTree([], context);

    expect(files).toHaveLength(1);
    expect(files[0]!.relativePath).toBe("CLAUDE.md");
  });

  it("domain_file_has_forgecraft_sentinel_comment", () => {
    const files = renderSentinelTree(
      [architectureBlock, testingBlock],
      context,
    );
    const domainFiles = files.filter((f) => f.relativePath !== "CLAUDE.md");

    expect(domainFiles.length).toBeGreaterThan(0);
    for (const file of domainFiles) {
      expect(file.content).toContain("ForgeCraft sentinel:");
    }
  });
});
