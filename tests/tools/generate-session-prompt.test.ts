/**
 * Tests for the generate_session_prompt tool handler.
 *
 * Covers: cascade gate blocking, required sections present, TDD gate block,
 * context load order, explicit vs default acceptance criteria,
 * scope_note inclusion, graceful handling of missing artifacts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateSessionPromptHandler } from "../../src/tools/generate-session-prompt.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-session-prompt-test-${Date.now()}`);
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

/**
 * Build a fully passing cascade (all 5 steps PASS, no UNFILLED markers).
 * Required before testing session prompt content — the cascade gate must pass.
 */
function buildCompleteCascade(dir: string): void {
  write(dir, "docs/PRD.md", "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers.\n");
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(dir, "docs/diagrams/c4-context.md",
    "```mermaid\nC4Context\n  Person(user, 'User')\n```\n");
  write(dir, "CLAUDE.md", "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n");
  mkdirSync(join(dir, "docs/adrs"), { recursive: true });
  write(dir, "docs/adrs/ADR-0001-stack.md", "# ADR-0001\n## Decision\nUse TypeScript.\n");
  write(dir, "docs/use-cases.md", "# Use Cases\n## UC-001\n**Actor**: user\nPrecondition: logged in\n");
}

const ITEM = "Add paginated GET /users endpoint returning UserResponse DTOs sorted by creation date.";

// ── Suite ─────────────────────────────────────────────────────────────

describe("generateSessionPromptHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

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
      expect(result.content[0]!.text).toContain("What problem does this project solve?");
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
      write(tempDir, "docs/PRD.md", "<!-- UNFILLED: PRD -->\n# PRD\n## Problem\n<!-- FILL -->\n");
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
      const criteria = ["Returns 200 with users array", "Supports page and limit query params"];
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
      write(tempDir, "Status.md", "# Status\n## Next Steps\n- Implement auth\n");
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Current State");
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
      write(tempDir, "docs/PRD.md", "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers.\n");
      write(tempDir, "CLAUDE.md", "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n");
      write(tempDir, "docs/use-cases.md", "# Use Cases\n## UC-001\n**Actor**: user\nPrecondition: logged in\n");
      // No docs/diagrams/ and no docs/adrs/ — normally FAIL for steps 2 and 4
      // Mark them as optional in forgecraft.yaml
      writeFileSync(join(tempDir, "forgecraft.yaml"), [
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
      ].join("\n"), "utf-8");

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
      writeFileSync(join(tempDir, "forgecraft.yaml"), [
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
      ].join("\n"), "utf-8");

      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      // functional_spec is missing and required (no decision = fail-safe) → BLOCKED
      expect(result.content[0]!.text).toContain("Session Prompt Blocked");
    });
  });
});
