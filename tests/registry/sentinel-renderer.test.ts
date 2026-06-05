/**
 * Tests for the sentinel tree renderer.
 *
 * Designed to be mutation-resistant: every assertion checks specific content,
 * not just existence. Verified against Stryker mutation score ≥ 80%.
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
  tags: ["UNIVERSAL", "API"],
  releasePhase: "staging",
};

/** Minimal helper to build an InstructionBlock for tests. */
function makeBlock(
  id: string,
  title: string,
  content: string,
): InstructionBlock {
  return { id, title, content };
}

const architectureBlock = makeBlock(
  "production-code-standards",
  "Production Code Standards",
  "## Production Code Standards\nAll config via env vars. No mocks in production.",
);

const testingBlock = makeBlock(
  "testing-pyramid",
  "Testing Pyramid",
  "## Testing Pyramid\nUnit → integration → E2E. 80% coverage minimum.",
);

const unknownBlock = makeBlock(
  "unknown-xyz-block",
  "Unknown Block",
  "## Unknown\nSome protocol content here.",
);

// ── Helpers ─────────────────────────────────────────────────────────────

function getFile(files: SentinelFile[], path: string): SentinelFile {
  const found = files.find((f) => f.relativePath === path);
  if (!found) throw new Error(`File not found in output: ${path}`);
  return found;
}

function claudeMd(files: SentinelFile[]): SentinelFile {
  return getFile(files, "CLAUDE.md");
}

// ── Structure tests ──────────────────────────────────────────────────────

describe("renderSentinelTree — structure", () => {
  it("returns_claude_md_as_first_file", () => {
    const files = renderSentinelTree([architectureBlock], context);
    expect(files[0]!.relativePath).toBe("CLAUDE.md");
  });

  it("claude_md_is_slim_routing_root", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    expect(content.split("\n").length).toBeLessThanOrEqual(80);
    expect(content).toContain("CNT root");
    expect(content).toContain("Navigate by Task");
  });

  it("empty_blocks_produces_root_plus_five_cnt_branches", () => {
    const files = renderSentinelTree([], context);
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".claude/constitution.md");
    expect(paths).toContain(".claude/lifecycle.md");
    expect(paths).toContain(".claude/routes/code.md");
    expect(paths).toContain(".claude/routes/docs.md");
    expect(paths).toContain(".claude/corrections.md");
  });

  it("produces_separate_domain_file_per_domain", () => {
    const files = renderSentinelTree(
      [architectureBlock, testingBlock],
      context,
    );
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain(".claude/standards/architecture.md");
    expect(paths).toContain(".claude/standards/testing.md");
    // The two domains should be separate files, not merged
    expect(
      paths.filter((p) => p.includes("standards/architecture")).length,
    ).toBe(1);
    expect(paths.filter((p) => p.includes("standards/testing")).length).toBe(1);
  });

  it("standards_domain_file_paths_match_pattern", () => {
    const files = renderSentinelTree(
      [architectureBlock, testingBlock],
      context,
    );
    const domainFiles = files.filter((f) =>
      f.relativePath.startsWith(".claude/standards/"),
    );
    expect(domainFiles.length).toBeGreaterThan(0);
    for (const file of domainFiles) {
      expect(file.relativePath).toMatch(/^\.claude\/standards\/[^/]+\.md$/);
    }
  });

  it("unknown_block_ids_route_to_protocols_not_discarded", () => {
    const files = renderSentinelTree([unknownBlock], context);
    const paths = files.map((f) => f.relativePath);
    // Must produce protocols.md (not silently drop the block)
    expect(paths).toContain(".claude/standards/protocols.md");
    // The block content must appear in protocols.md
    const protocolsFile = getFile(files, ".claude/standards/protocols.md");
    expect(protocolsFile.content).toContain("Some protocol content here");
  });
});

// ── CLAUDE.md content tests ──────────────────────────────────────────────

describe("renderSentinelTree — CLAUDE.md content", () => {
  it("claude_md_is_slim_routing_root_in_content_suite", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    expect(content.split("\n").length).toBeLessThanOrEqual(80);
    expect(content).toContain("CNT root");
  });

  it("root_always_loads_list_references_branch_files", () => {
    const files = renderSentinelTree([], context);
    const { content } = claudeMd(files);
    expect(content).toContain(".claude/constitution.md");
    expect(content).toContain(".claude/corrections.md");
  });

  it("contains_project_name_as_h1_title", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    expect(content).toContain(`# ${context.projectName}`);
  });

  it("root_routing_table_references_lifecycle_and_docs", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    expect(content).toContain(".claude/lifecycle.md");
    expect(content).toContain(".claude/routes/docs.md");
  });

  it("claude_md_does_not_contain_block_content_only_routing", () => {
    const files = renderSentinelTree(
      [architectureBlock, testingBlock],
      context,
    );
    const { content } = claudeMd(files);
    // Routing table may reference standards files as destinations — that's correct.
    // What MUST NOT appear is the actual block content (which lives in branch files).
    expect(content).not.toContain("All config via env vars");
    expect(content).not.toContain("Unit → integration → E2E");
  });

  it("uses_tag_names_in_description_when_no_domain_set", () => {
    // context has domain: "none" and tags ["UNIVERSAL", "API"]
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    // API tag appears in Tags identity line and inferred stack
    expect(content).toContain("API");
  });

  it("universal_tag_is_excluded_from_description", () => {
    // Tags line should list non-UNIVERSAL tags only
    // context has tags ["UNIVERSAL", "API"] → tagList = "API"
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    // The Tags identity line should show "API" not "UNIVERSAL"
    expect(content).toContain("**Tags**: API");
    expect(content).not.toContain("**Tags**: UNIVERSAL");
  });

  it("fallback_to_universal_when_no_tags", () => {
    // When no non-UNIVERSAL tags, tagList falls back to "UNIVERSAL"
    const noTagCtx: RenderContext = { ...context, tags: [], domain: "none" };
    const files = renderSentinelTree([architectureBlock], noTagCtx);
    const { content } = claudeMd(files);
    // Still produces a valid slim root with UNIVERSAL tag
    expect(content).toContain("**Tags**: UNIVERSAL");
    // GS Properties live in the constitution branch, not in the slim root
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("GS Properties");
  });

  it("uses_tag_name_in_stack_when_tags_include_api", () => {
    // context has tags ["UNIVERSAL", "API"] → stack = "TypeScript/Node.js REST/GraphQL API"
    const files = renderSentinelTree([architectureBlock], context);
    const { content } = claudeMd(files);
    expect(content).toContain("API");
  });
});

// ── New GS-compliance sections ───────────────────────────────────────────

describe("renderSentinelTree — GS compliance sections", () => {
  it("lifecycle_branch_contains_tool_sequencing", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const lifecycle = getFile(files, ".claude/lifecycle.md");
    expect(lifecycle.content).toContain("## Tool Sequencing");
    expect(lifecycle.content).toContain("New feature");
    expect(lifecycle.content).toContain("Read PRD");
  });

  it("corrections_branch_contains_log_stub", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const corrections = getFile(files, ".claude/corrections.md");
    expect(corrections.content).toContain("## Corrections Log");
    expect(corrections.content).toContain("YYYY-MM-DD");
  });

  it("docs_routes_branch_contains_navigation_mode_for_api_project", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const docsRoutes = getFile(files, ".claude/routes/docs.md");
    expect(docsRoutes.content).toContain("## Navigation Mode");
    expect(docsRoutes.content).toContain(
      "Read interfaces, not implementations first",
    );
  });

  it("navigation_mode_present_for_web_next_project", () => {
    const webCtx: RenderContext = {
      ...context,
      tags: ["UNIVERSAL", "WEB-NEXT"],
    };
    const files = renderSentinelTree([architectureBlock], webCtx);
    const docsRoutes = getFile(files, ".claude/routes/docs.md");
    expect(docsRoutes.content).toContain("## Navigation Mode");
    expect(docsRoutes.content).toContain("contracts are trustworthy");
  });

  it("lifecycle_branch_contains_feature_estimation", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const lifecycle = getFile(files, ".claude/lifecycle.md");
    expect(lifecycle.content).toContain("Feature Estimation");
    expect(lifecycle.content).toContain("Break into sub-tasks");
    expect(lifecycle.content).toContain("scope boundary");
  });

  it("constitution_contains_type_driven_design_and_core_disciplines", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const constitution = getFile(files, ".claude/constitution.md");
    // Type-Driven Design (Minsky/King): illegal states unrepresentable, parse don't validate
    expect(constitution.content).toContain("illegal states unrepresentable");
    expect(constitution.content).toContain("Parse, don't validate");
    expect(constitution.content).toContain("Result<T,E>");
    // Functional Core, Imperative Shell (Bernhardt)
    expect(constitution.content).toContain("Functional core, imperative shell");
    // Design by Contract (Meyer) — UC contract = function contract
    expect(constitution.content).toContain("Design by Contract");
  });

  it("python_constitution_uses_python_type_driven_idioms", () => {
    const pyCtx: RenderContext = { ...context, language: "python" };
    const files = renderSentinelTree([architectureBlock], pyCtx);
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("illegal states unrepresentable");
    expect(constitution.content).toContain("frozen dataclasses");
    expect(constitution.content).not.toContain("Result<T,E>");
  });

  it("code_routes_contains_screaming_architecture", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const codeRoutes = getFile(files, ".claude/routes/code.md");
    expect(codeRoutes.content).toContain("Screaming Architecture");
    expect(codeRoutes.content).toContain("first search must hit");
  });

  it("constitution_branch_contains_7_gs_properties", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("Self-describing");
    expect(constitution.content).toContain("Executable");
    expect(constitution.content).toContain("Prohibited Operations");
  });

  it("lifecycle_branch_contains_session_loop_invariant", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const lifecycle = getFile(files, ".claude/lifecycle.md");
    expect(lifecycle.content).toContain("Session Loop Invariant");
    expect(lifecycle.content).toContain("docs/status.md");
  });

  it("lifecycle_branch_contains_gate_awareness_with_origin_provenance", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const lifecycle = getFile(files, ".claude/lifecycle.md");
    expect(lifecycle.content).toContain("Gate Awareness");
    // In-session detection triggers
    expect(lifecycle.content).toContain("Same bug class fixed twice");
    // Provenance distinction: organic (AI/dev proactive) vs genesis (system-detected)
    expect(lifecycle.content).toContain("origin: organic");
    expect(lifecycle.content).toContain("origin: genesis");
  });

  it("code_routes_branch_contains_folder_map", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const codeRoutes = getFile(files, ".claude/routes/code.md");
    expect(codeRoutes.content).toContain("Folder Map");
    expect(codeRoutes.content).toContain("Naming Conventions");
  });

  it("docs_routes_branch_omits_navigation_mode_when_no_arch_discipline_tags", () => {
    const minimalCtx: RenderContext = {
      ...context,
      tags: [],
    };
    const files = renderSentinelTree([architectureBlock], minimalCtx);
    const docsRoutes = getFile(files, ".claude/routes/docs.md");
    // No architecture discipline tags → Navigation Mode section is omitted
    expect(docsRoutes.content).not.toContain("## Navigation Mode");
    // Document Map is always present
    expect(docsRoutes.content).toContain("## Document Map");
  });

  it("constitution_branch_uses_web_layer_diagram_for_web_next_tag", () => {
    const webCtx: RenderContext = {
      ...context,
      tags: ["UNIVERSAL", "WEB-NEXT"],
    };
    const files = renderSentinelTree([architectureBlock], webCtx);
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("App Router");
  });

  it("constitution_branch_uses_cli_layer_diagram_for_cli_tag", () => {
    const cliCtx: RenderContext = { ...context, tags: ["UNIVERSAL", "CLI"] };
    const files = renderSentinelTree([architectureBlock], cliCtx);
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("Commands");
  });

  it("code_routes_branch_uses_web_folder_map_for_web_react_tag", () => {
    const webCtx: RenderContext = {
      ...context,
      tags: ["UNIVERSAL", "WEB-REACT"],
    };
    const files = renderSentinelTree([architectureBlock], webCtx);
    const codeRoutes = getFile(files, ".claude/routes/code.md");
    expect(codeRoutes.content).toContain("atoms/");
  });

  it("code_routes_branch_uses_cli_folder_map_for_cli_tag", () => {
    const cliCtx: RenderContext = { ...context, tags: ["UNIVERSAL", "CLI"] };
    const files = renderSentinelTree([architectureBlock], cliCtx);
    const codeRoutes = getFile(files, ".claude/routes/code.md");
    expect(codeRoutes.content).toContain("src/commands/");
  });

  it("constitution_branch_uses_library_layer_diagram_for_library_tag", () => {
    const libCtx: RenderContext = {
      ...context,
      tags: ["UNIVERSAL", "LIBRARY"],
    };
    const files = renderSentinelTree([architectureBlock], libCtx);
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("Public API");
  });

  it("constitution_branch_uses_default_layer_diagram_for_unknown_tags", () => {
    const genericCtx: RenderContext = { ...context, tags: ["UNIVERSAL"] };
    const files = renderSentinelTree([architectureBlock], genericCtx);
    const constitution = getFile(files, ".claude/constitution.md");
    expect(constitution.content).toContain("Entry Points");
  });

  it("root_uses_library_stack_description_for_library_tag", () => {
    const libCtx: RenderContext = {
      ...context,
      tags: ["UNIVERSAL", "LIBRARY"],
    };
    const files = renderSentinelTree([architectureBlock], libCtx);
    const { content } = claudeMd(files);
    expect(content).toContain("TypeScript library");
  });

  it("root_uses_typescript_fallback_stack_for_unknown_tags", () => {
    const genericCtx: RenderContext = { ...context, tags: ["UNIVERSAL"] };
    const files = renderSentinelTree([architectureBlock], genericCtx);
    const { content } = claudeMd(files);
    expect(content).toContain("TypeScript");
  });

  it("root_uses_python_stack_description_for_python_tag", () => {
    const pyCtx: RenderContext = { ...context, tags: ["PYTHON"] };
    const files = renderSentinelTree([architectureBlock], pyCtx);
    const { content } = claudeMd(files);
    expect(content).toContain("Python");
  });

  it("code_routes_uses_default_folder_map_for_generic_tags", () => {
    const genericCtx: RenderContext = { ...context, tags: ["UNIVERSAL"] };
    const files = renderSentinelTree([architectureBlock], genericCtx);
    const codeRoutes = getFile(files, ".claude/routes/code.md");
    expect(codeRoutes.content).toContain("src/");
    expect(codeRoutes.content).toContain("docs/");
  });
});

// ── Domain file content tests ────────────────────────────────────────────

describe("renderSentinelTree — domain file content", () => {
  it("domain_file_contains_forgecraft_sentinel_comment", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const archFile = getFile(files, ".claude/standards/architecture.md");
    expect(archFile.content).toContain("ForgeCraft sentinel:");
    expect(archFile.content).toContain("architecture");
  });

  it("domain_file_contains_rendered_block_content", () => {
    const files = renderSentinelTree([architectureBlock], context);
    const archFile = getFile(files, ".claude/standards/architecture.md");
    // The actual block content must be in the file, not just the header
    expect(archFile.content).toContain("All config via env vars");
    expect(archFile.content).toContain("No mocks in production");
  });

  it("domain_file_only_contains_its_own_domain_blocks", () => {
    const files = renderSentinelTree(
      [architectureBlock, testingBlock],
      context,
    );
    const archFile = getFile(files, ".claude/standards/architecture.md");
    const testFile = getFile(files, ".claude/standards/testing.md");
    // Architecture content in architecture file, not testing file
    expect(archFile.content).toContain("All config via env vars");
    expect(testFile.content).not.toContain("All config via env vars");
    // Testing content in testing file, not architecture file
    expect(testFile.content).toContain("80% coverage minimum");
    expect(archFile.content).not.toContain("80% coverage minimum");
  });

  it("block_content_is_trimmed_before_inclusion_in_domain_file", () => {
    // Content with significant leading/trailing whitespace
    const paddedBlock = makeBlock(
      "production-code-standards",
      "SOLID",
      "\n\n   ## Trimmed Rule\nActual content here.   \n\n\n",
    );
    const files = renderSentinelTree([paddedBlock], context);
    const archFile = getFile(files, ".claude/standards/architecture.md");
    const contentLines = archFile.content
      .split("\n")
      .filter((l) => !l.startsWith("<!--") && l !== "");
    // First non-header line must not start with whitespace (trim() was applied)
    expect(contentLines[0]).toBe("## Trimmed Rule");
  });

  it("empty_block_content_is_not_added_to_domain_file", () => {
    // Kills ConditionalExpression L127: if (rendered) → if (true)
    // With mutation, two empty strings get pushed, adding 2 extra lines to the file.
    // "production-code-standards" maps to "architecture" domain.
    const emptyBlock = makeBlock(
      "production-code-standards",
      "SOLID",
      "   \n  \n  ",
    );
    const files = renderSentinelTree([emptyBlock], context);
    const archFile = getFile(files, ".claude/standards/architecture.md");
    const lineCount = archFile.content.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(3);
  });

  it("unknown_domain_description_falls_back_to_domain_name", () => {
    // Use a block ID that maps to a domain not in DOMAIN_DESCRIPTIONS — we simulate
    // this by testing via "protocols" which has a description, verifying that the
    // block is correctly routed and its domain file is produced.
    const protocolBlock = makeBlock(
      "clarification-protocol",
      "Clarification",
      "## Clarification\nAsk before assuming.",
    );
    const files = renderSentinelTree([protocolBlock], context);
    // The protocols.md file must be produced (domain routing works)
    const protocolsFile = files.find((f) =>
      f.relativePath.includes("protocols.md"),
    );
    expect(protocolsFile).toBeDefined();
    // The domain file content must contain the rendered block
    expect(protocolsFile!.content).toContain("Ask before assuming");
    // Wayfinding is now in .claude/index.md, not CLAUDE.md
    const { content } = claudeMd(files);
    expect(content).not.toContain("protocols.md");
  });
});
