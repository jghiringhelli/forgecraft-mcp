/**
 * Tests for the generate_session_prompt tool handler.
 *
 * Covers: cascade gate blocking, required sections present, TDD gate block,
 * context load order, explicit vs default acceptance criteria,
 * scope_note inclusion, graceful handling of missing artifacts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateSessionPromptHandler } from "../../src/tools/generate-session-prompt.js";
import { buildClarificationWarning } from "../../src/tools/session-prompt-builders.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-session-prompt-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(
    join(
      dir,
      relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "",
    ),
    {
      recursive: true,
    },
  );
  writeFileSync(fullPath, content, "utf-8");
}

/**
 * Build a fully passing cascade (all 5 steps PASS, no UNFILLED markers).
 * Required before testing session prompt content — the cascade gate must pass.
 */
function buildCompleteCascade(dir: string): void {
  write(
    dir,
    "docs/PRD.md",
    "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers.\n",
  );
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(
    dir,
    "docs/diagrams/c4-context.md",
    "```mermaid\nC4Context\n  Person(user, 'User')\n```\n",
  );
  write(
    dir,
    "CLAUDE.md",
    "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n",
  );
  mkdirSync(join(dir, "docs/adrs"), { recursive: true });
  write(
    dir,
    "docs/adrs/ADR-0001-stack.md",
    "# ADR-0001\n## Decision\nUse TypeScript.\n",
  );
  write(
    dir,
    "docs/use-cases.md",
    "# Use Cases\n## UC-001\n**Actor**: user\nPrecondition: logged in\n",
  );
}

const ITEM =
  "Add paginated GET /users endpoint returning UserResponse DTOs sorted by creation date.";

// ── Suite ─────────────────────────────────────────────────────────────

describe("generateSessionPromptHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Cascade gate ──────────────────────────────────────────────────

  describe("cascade gate", () => {
    it("returns a blocked message when cascade is incomplete", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Session Prompt Blocked");
      expect(result.content[0]!.text).toContain("Cascade Incomplete");
    });

    it("blocked message explains why cascade is required", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("derivation cascade");
    });

    it("blocked message includes guided remediation with failing steps", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Failing Cascade Steps");
    });

    it("blocked message includes artifact path for the first failing step", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("docs/PRD.md");
    });

    it("blocked message includes specific questions for the first failing step", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      // Step 1 questions contain "problem" related content
      expect(result.content[0]!.text).toContain(
        "What problem does this project solve?",
      );
    });

    it("blocked message does not include TDD Gate (session prompt was not generated)", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).not.toContain("TDD Gate");
    });

    it("generates session prompt when cascade is complete", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).not.toContain("Session Prompt Blocked");
      expect(result.content[0]!.text).toContain("TDD Gate");
    });

    it("blocks when PRD.md exists but has UNFILLED markers", async () => {
      write(
        tempDir,
        "docs/PRD.md",
        "<!-- UNFILLED: PRD -->\n# PRD\n## Problem\n<!-- FILL -->\n",
      );
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Session Prompt Blocked");
    });
  });

  // ── Required structure (requires complete cascade) ────────────────

  describe("required prompt sections", () => {
    it("returns a single text content item", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });

    it("includes a Context Load Order section", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Context Load Order");
    });

    it("includes a TDD Gate section with RED-GREEN-REFACTOR", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("TDD Gate");
      expect(text).toContain("RED");
      expect(text).toContain("GREEN");
      expect(text).toContain("REFACTOR");
    });

    it("includes an Acceptance Criteria section", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Acceptance Criteria");
    });

    it("includes a Session Close section", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Session Close");
    });

    it("includes the item_description in the output", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain(ITEM);
    });
  });

  // ── Conventional commit type ──────────────────────────────────────

  describe("session_type commit format", () => {
    it("uses 'fix' in commit sequence for fix session type", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "fix",
      });
      expect(result.content[0]!.text).toContain("fix(scope)");
    });

    it("uses 'refactor' in commit sequence for refactor session type", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "refactor",
      });
      expect(result.content[0]!.text).toContain("refactor(scope)");
    });
  });

  // ── Acceptance criteria ───────────────────────────────────────────

  describe("acceptance_criteria", () => {
    it("uses default criteria when acceptance_criteria is not provided", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Coverage thresholds");
      expect(text).toContain("Status.md");
    });

    it("uses provided acceptance_criteria instead of defaults", async () => {
      buildCompleteCascade(tempDir);
      const criteria = [
        "Returns 200 with users array",
        "Supports page and limit query params",
      ];
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        acceptance_criteria: criteria,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Returns 200 with users array");
      expect(result.content[0]!.text).toContain("page and limit query params");
    });
  });

  // ── Scope note ────────────────────────────────────────────────────

  describe("scope_note", () => {
    it("includes Out of Scope section when scope_note is provided", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        scope_note: "Do not touch the auth service or billing module",
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Out of Scope");
      expect(text).toContain("auth service");
    });

    it("omits Out of Scope section when scope_note is not provided", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).not.toContain("Out of Scope");
    });
  });

  // ── Artifact discovery (complete cascade + specific extras) ───────

  describe("artifact discovery", () => {
    it("references CLAUDE.md in context load when cascade passes", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("CLAUDE.md");
      expect(result.content[0]!.text).toContain("operative grammar");
    });

    it("warns about missing Status.md even when cascade passes", async () => {
      buildCompleteCascade(tempDir);
      // Status.md is NOT part of the cascade check, so prompt can still generate without it
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Status.md missing");
    });

    it("includes Status.md content snippet when present", async () => {
      buildCompleteCascade(tempDir);
      write(
        tempDir,
        "Status.md",
        "# Status\n## Next Steps\n- Implement auth\n",
      );
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Project Status Snapshot");
      expect(text).toContain("Next Steps");
    });

    it("references ADR directory when ADRs exist (from cascade-complete setup)", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("docs/adrs/");
    });

    it("includes use-cases.md in context load when present", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("docs/use-cases.md");
    });
  });

  // ── Output structure ──────────────────────────────────────────────

  describe("output metadata", () => {
    it("includes files_created and next_steps in output", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("files_created");
      expect(text).toContain("next_steps");
    });

    it("includes check_cascade in next_steps guidance", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("check_cascade");
    });
  });

  // ── SKIP steps (cascade decisions) ───────────────────────────────

  describe("cascade decisions: SKIP steps do not block prompt generation", () => {
    it("generates a prompt when required steps PASS and optional steps would have failed", async () => {
      // Build only the required steps — skip adrs and diagrams
      write(
        tempDir,
        "docs/PRD.md",
        "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers.\n",
      );
      write(
        tempDir,
        "CLAUDE.md",
        "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n",
      );
      write(
        tempDir,
        "docs/use-cases.md",
        "# Use Cases\n## UC-001\n**Actor**: user\nPrecondition: logged in\n",
      );
      // No docs/diagrams/ and no docs/adrs/ — normally FAIL for steps 2 and 4
      // Mark them as optional in forgecraft.yaml
      writeFileSync(
        join(tempDir, "forgecraft.yaml"),
        [
          "cascade:",
          "  steps:",
          "    - step: architecture_diagrams",
          "      required: false",
          '      rationale: "CLI project — no external integration surface."',
          "      decidedAt: '2025-01-01'",
          "      decidedBy: scaffold",
          "    - step: adrs",
          "      required: false",
          '      rationale: "Simple script with no complex decisions."',
          "      decidedAt: '2025-01-01'",
          "      decidedBy: scaffold",
        ].join("\n"),
        "utf-8",
      );

      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      // Should NOT be blocked
      expect(result.content[0]!.text).not.toContain("Session Prompt Blocked");
    });

    it("still blocks when required steps fail even if optional steps would have passed", async () => {
      // No files at all, but mark all steps as optional except functional_spec
      writeFileSync(
        join(tempDir, "forgecraft.yaml"),
        [
          "cascade:",
          "  steps:",
          "    - step: architecture_diagrams",
          "      required: false",
          '      rationale: "Optional."',
          "      decidedAt: '2025-01-01'",
          "      decidedBy: scaffold",
          "    - step: adrs",
          "      required: false",
          '      rationale: "Optional."',
          "      decidedAt: '2025-01-01'",
          "      decidedBy: scaffold",
          "    - step: behavioral_contracts",
          "      required: false",
          '      rationale: "Optional."',
          "      decidedAt: '2025-01-01'",
          "      decidedBy: scaffold",
          "    - step: constitution",
          "      required: false",
          '      rationale: "Optional."',
          "      decidedAt: '2025-01-01'",
          "      decidedBy: scaffold",
          // functional_spec is NOT in the decisions list — fail-safe: defaults to required
        ].join("\n"),
        "utf-8",
      );

      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      // functional_spec is missing and required (no decision = fail-safe) → BLOCKED
      expect(result.content[0]!.text).toContain("Session Prompt Blocked");
    });
  });

  // ── Execution Loop + Active MCP Tools ─────────────────────────────

  describe("execution loop and active MCP tools sections", () => {
    it("includes an Execution Loop section", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Execution Loop");
      expect(text).toContain("loop until green");
    });

    it("derives test command from package.json scripts.test field", async () => {
      buildCompleteCascade(tempDir);
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "vitest run" } }),
        "utf-8",
      );
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("npm test");
    });

    it("includes Active MCP Tools section when .claude/settings.json exists", async () => {
      buildCompleteCascade(tempDir);
      mkdirSync(join(tempDir, ".claude"), { recursive: true });
      writeFileSync(
        join(tempDir, ".claude", "settings.json"),
        JSON.stringify({
          mcpServers: {
            forgecraft: { command: "npx", args: ["-y", "forgecraft-mcp"] },
            context7: {
              command: "npx",
              args: ["-y", "@upstash/context7-mcp@latest"],
            },
          },
        }),
        "utf-8",
      );
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Active MCP Tools");
      expect(text).toContain("forgecraft");
      expect(text).toContain("context7");
    });

    it("includes fallback message in Active MCP Tools when .claude/settings.json not found", async () => {
      buildCompleteCascade(tempDir);
      // No .claude/settings.json created
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Active MCP Tools");
      expect(text).toContain("configure_mcp");
    });
  });

  // ── Prompt hygiene: reference not inline ─────────────────────────

  describe("prompt hygiene", () => {
    it("does_not_inline_adr_content — ADR file content not included in prompt output", async () => {
      buildCompleteCascade(tempDir);
      // buildCompleteCascade writes ADR-0001 with "Use TypeScript." content
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      // Path should be referenced
      expect(text).toContain("docs/adrs/");
      // ADR file content must NOT be inlined
      expect(text).not.toContain("Use TypeScript.");
    });

    it("references_gates_by_path_not_content — gate YAML content not inlined", async () => {
      buildCompleteCascade(tempDir);
      mkdirSync(join(tempDir, ".forgecraft/gates/project/active"), {
        recursive: true,
      });
      writeFileSync(
        join(
          tempDir,
          ".forgecraft/gates/project/active",
          "no-console-log.yaml",
        ),
        [
          "id: no-console-log",
          "title: No console.log in production",
          "description: Console.log statements pollute production logs — use a structured logger.",
          "check: grep -r 'console.log' src/",
          "passCriterion: Zero matches",
          "gsProperty: observability",
          "phase: commit",
        ].join("\n"),
        "utf-8",
      );
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      // Path must be referenced
      expect(text).toContain(".forgecraft/gates/project/active/");
      // Gate file content must NOT be inlined
      expect(text).not.toContain(
        "Console.log statements pollute production logs",
      );
      expect(text).not.toContain("passCriterion");
    });

    it("includes_codeseeker_context_retrieval_when_available — context retrieval section present when codeseeker configured", async () => {
      buildCompleteCascade(tempDir);
      mkdirSync(join(tempDir, ".claude"), { recursive: true });
      writeFileSync(
        join(tempDir, ".claude", "settings.json"),
        JSON.stringify({
          mcpServers: {
            forgecraft: { command: "npx", args: ["-y", "forgecraft-mcp"] },
            codeseeker: { command: "npx", args: ["-y", "codeseeker-mcp"] },
          },
        }),
        "utf-8",
      );
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Context Retrieval Strategy");
      expect(text).toContain("codeseeker_search");
      expect(text).toContain("codeseeker_duplicates");
    });

    it("includes context retrieval section without codeseeker guidance when codeseeker not configured", async () => {
      buildCompleteCascade(tempDir);
      // No settings.json — codeseeker not configured
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Context Retrieval Strategy");
      expect(text).not.toContain("codeseeker_search");
    });

    it("includes_close_cycle_reminder — close_cycle appears after execution loop", async () => {
      buildCompleteCascade(tempDir);
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("close_cycle");
      // The reminder appears after the execution loop
      const executionLoopIdx = text.indexOf("Execution Loop");
      const closeCycleIdx = text.lastIndexOf("close_cycle");
      expect(executionLoopIdx).toBeGreaterThan(-1);
      expect(closeCycleIdx).toBeGreaterThan(executionLoopIdx);
    });
  });
});

// ── Roadmap integration ───────────────────────────────────────────────

describe("generateSessionPromptHandler — roadmap integration", () => {
  let tempDir: string;

  function write(dir: string, relPath: string, content: string): void {
    const fullPath = join(dir, relPath);
    mkdirSync(
      join(
        dir,
        relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "",
      ),
      { recursive: true },
    );
    writeFileSync(fullPath, content, "utf-8");
  }

  function buildCompleteCascade(dir: string): void {
    write(
      dir,
      "docs/PRD.md",
      "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers.\n",
    );
    mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
    write(
      dir,
      "docs/diagrams/c4-context.md",
      "```mermaid\nC4Context\n  Person(user, 'User')\n```\n",
    );
    write(
      dir,
      "CLAUDE.md",
      "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n",
    );
    mkdirSync(join(dir, "docs/adrs"), { recursive: true });
    write(
      dir,
      "docs/adrs/ADR-0001-stack.md",
      "# ADR-0001\n## Decision\nUse TypeScript.\n",
    );
    write(
      dir,
      "docs/use-cases.md",
      "# Use Cases\n## UC-001\n**Actor**: user\nPrecondition: logged in\n",
    );
  }

  const ROADMAP_CONTENT = `# Test Roadmap

## Phase 1: Core Implementation

| ID | Title | Status | Prompt |
|---|---|---|---|
| RM-001 | Implement UC-001: user login | pending | docs/session-prompts/RM-001.md |
| RM-002 | Implement UC-002: user profile | pending | docs/session-prompts/RM-002.md |
`;

  beforeEach(() => {
    tempDir = join(
      require("os").tmpdir(),
      `forgecraft-roadmap-test-${Date.now()}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("auto-selects next pending roadmap item when item_description is omitted", async () => {
    buildCompleteCascade(tempDir);
    write(tempDir, "docs/roadmap.md", ROADMAP_CONTENT);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain("RM-001");
    expect(result.content[0]!.text).toContain("Implement UC-001");
  });

  it("selects specific roadmap item when roadmap_item_id is provided", async () => {
    buildCompleteCascade(tempDir);
    write(tempDir, "docs/roadmap.md", ROADMAP_CONTENT);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      roadmap_item_id: "RM-002",
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain("RM-002");
    expect(result.content[0]!.text).toContain("Implement UC-002");
  });

  it("marks selected roadmap item as in-progress in roadmap.md", async () => {
    buildCompleteCascade(tempDir);
    write(tempDir, "docs/roadmap.md", ROADMAP_CONTENT);
    await generateSessionPromptHandler({
      project_dir: tempDir,
      session_type: "feature",
    });
    const updated = readFileSync(join(tempDir, "docs", "roadmap.md"), "utf-8");
    expect(updated).toContain("in-progress");
    expect(updated).not.toMatch(/RM-001.*pending/);
  });

  it("writes bound prompt to docs/session-prompts/RM-001.md", async () => {
    buildCompleteCascade(tempDir);
    write(tempDir, "docs/roadmap.md", ROADMAP_CONTENT);
    await generateSessionPromptHandler({
      project_dir: tempDir,
      session_type: "feature",
    });
    const promptPath = join(tempDir, "docs", "session-prompts", "RM-001.md");
    expect(existsSync(promptPath)).toBe(true);
    expect(readFileSync(promptPath, "utf-8")).toContain("Implement UC-001");
  });

  it("returns error when no roadmap and no item_description provided", async () => {
    buildCompleteCascade(tempDir);
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain("Session Prompt Blocked");
    expect(result.content[0]!.text).toContain("No docs/roadmap.md found");
  });

  it("returns error when roadmap has no pending items", async () => {
    buildCompleteCascade(tempDir);
    write(
      tempDir,
      "docs/roadmap.md",
      "# Roadmap\n| RM-001 | Done item | done | docs/session-prompts/RM-001.md |\n",
    );
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain("no pending items");
  });

  it("explicit item_description takes precedence over roadmap auto-select", async () => {
    buildCompleteCascade(tempDir);
    write(tempDir, "docs/roadmap.md", ROADMAP_CONTENT);
    const EXPLICIT =
      "Add an explicit endpoint not in the roadmap for testing purposes.";
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: EXPLICIT,
      session_type: "feature",
    });
    expect(result.content[0]!.text).toContain(EXPLICIT);
    // RM-001 appears in the roadmap snapshot section but the task uses the explicit description
    expect(result.content[0]!.text).toContain("### Task");
    expect(result.content[0]!.text).not.toContain(`### Task\n\nRM-001`);
  });
});

describe("generateSessionPromptHandler — DAG dependency gate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    buildCompleteCascade(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeRoadmap(dir: string, content: string): void {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "roadmap.md"), content, "utf-8");
  }

  it("blocks session prompt when dependency is pending", async () => {
    writeRoadmap(
      tempDir,
      [
        "| ID | Title | Depends On | Status | Prompt |",
        "|---|---|---|---|---|",
        "| RM-001 | Login | — | pending | docs/session-prompts/RM-001.md |",
        "| RM-002 | Dashboard | RM-001 | pending | docs/session-prompts/RM-002.md |",
      ].join("\n"),
    );

    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      roadmap_item_id: "RM-002",
    });
    const text = result.content[0]!.text;

    expect(text).toContain("Unmet Dependencies");
    expect(text).toContain("RM-001");
  });

  it("allows session prompt when dependency is done", async () => {
    writeRoadmap(
      tempDir,
      [
        "| ID | Title | Depends On | Status | Prompt |",
        "|---|---|---|---|---|",
        "| RM-001 | Login | — | done | docs/session-prompts/RM-001.md |",
        "| RM-002 | Dashboard | RM-001 | pending | docs/session-prompts/RM-002.md |",
      ].join("\n"),
    );

    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      roadmap_item_id: "RM-002",
    });
    const text = result.content[0]!.text;

    expect(text).not.toContain("Unmet Dependencies");
    expect(text).toContain("Dashboard");
  });

  it("auto-select skips blocked items and picks first unblocked pending item", async () => {
    writeRoadmap(
      tempDir,
      [
        "| ID | Title | Depends On | Status | Prompt |",
        "|---|---|---|---|---|",
        "| RM-001 | Login | — | done | docs/session-prompts/RM-001.md |",
        "| RM-002 | Profile | RM-001 | pending | docs/session-prompts/RM-002.md |",
        "| RM-003 | Dashboard | RM-002 | pending | docs/session-prompts/RM-003.md |",
      ].join("\n"),
    );

    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
    });
    const text = result.content[0]!.text;

    // RM-002 is the first unblocked pending item (RM-001 is done)
    expect(text).toContain("RM-002");
    expect(text).not.toContain("Unmet Dependencies");
  });

  it("blocks with list of ALL pending dependencies", async () => {
    writeRoadmap(
      tempDir,
      [
        "| ID | Title | Depends On | Status | Prompt |",
        "|---|---|---|---|---|",
        "| RM-001 | Login | — | pending | docs/session-prompts/RM-001.md |",
        "| RM-002 | Register | — | pending | docs/session-prompts/RM-002.md |",
        "| RM-010 | Integration | RM-001, RM-002 | pending | docs/session-prompts/RM-010.md |",
      ].join("\n"),
    );

    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      roadmap_item_id: "RM-010",
    });
    const text = result.content[0]!.text;

    expect(text).toContain("Unmet Dependencies");
    expect(text).toContain("RM-001");
    expect(text).toContain("RM-002");
  });
});

// ── State leaf (.claude/state.md) tests ───────────────────────────────

describe("generateSessionPromptHandler — state leaf", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    buildCompleteCascade(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes state leaf content when .claude/state.md exists", async () => {
    mkdirSync(join(tempDir, ".claude"), { recursive: true });
    writeFileSync(
      join(tempDir, ".claude", "state.md"),
      "# Project State\n_Last updated by close_cycle: 2026-04-16T00:00:00.000Z_\n\n## Next Action\nAll layers verified.\n",
      "utf-8",
    );

    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: ITEM,
      session_type: "feature",
    });
    const text = result.content[0]!.text;

    expect(text).toContain("Current Project State");
    expect(text).toContain("Last updated by close_cycle");
    expect(text).toContain("All layers verified.");
  });

  it("falls back gracefully when .claude/state.md is absent", async () => {
    // No .claude/state.md written — should still generate a valid prompt
    const result = await generateSessionPromptHandler({
      project_dir: tempDir,
      item_description: ITEM,
      session_type: "feature",
    });
    const text = result.content[0]!.text;

    expect(text).not.toContain("Session Prompt Blocked");
    expect(text).toContain("TDD Gate");
    // State leaf block should not appear
    expect(text).not.toContain("Current Project State");
  });
});

describe("buildClarificationWarning", () => {
  it("returns empty string when markers array is empty", () => {
    expect(buildClarificationWarning([])).toBe("");
  });

  it("builds warning table for non-empty markers", () => {
    const result = buildClarificationWarning([
      {
        file: "docs/adrs/ADR-001.md",
        marker: "[NEEDS CLARIFICATION: auth strategy]",
      },
      { file: "docs/use-cases.md", marker: "[NEEDS CLARIFICATION: edge case]" },
    ]);
    expect(result).toContain("Unresolved Clarifications");
    expect(result).toContain("docs/adrs/ADR-001.md");
    expect(result).toContain("[NEEDS CLARIFICATION: auth strategy]");
    expect(result).toContain("docs/use-cases.md");
    expect(result).toContain("| File | Marker |");
  });
});
