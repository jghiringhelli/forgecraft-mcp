/**
 * Tests for the generate_session_prompt tool handler.
 *
 * Covers: required sections present, TDD gate block, context load order,
 * explicit vs default acceptance criteria, scope_note inclusion,
 * graceful handling of missing artifacts.
 */
// @ts-nocheck


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

const ITEM = "Add paginated GET /users endpoint returning UserResponse DTOs sorted by creation date.";

// ── Suite ─────────────────────────────────────────────────────────────

describe("generateSessionPromptHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── Required structure ────────────────────────────────────────────

  describe("required prompt sections", () => {
    it("returns a single text content item", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });

    it("includes a Context Load Order section", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Context Load Order");
    });

    it("includes a TDD Gate section with RED-GREEN-REFACTOR", async () => {
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
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Acceptance Criteria");
    });

    it("includes a Session Close section", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Session Close");
    });

    it("includes the item_description in the output", async () => {
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
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "fix",
      });
      expect(result.content[0]!.text).toContain("fix(scope)");
    });

    it("uses 'refactor' in commit sequence for refactor session type", async () => {
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
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      // Default criteria includes coverage gate and Status.md update
      const text = result.content[0]!.text;
      expect(text).toContain("Coverage thresholds");
      expect(text).toContain("Status.md");
    });

    it("uses provided acceptance_criteria instead of defaults", async () => {
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
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).not.toContain("Out of Scope");
    });
  });

  // ── Artifact discovery ────────────────────────────────────────────

  describe("artifact discovery", () => {
    it("warns about missing constitution when CLAUDE.md is absent", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("No constitution found");
    });

    it("references CLAUDE.md in context load when it exists", async () => {
      write(tempDir, "CLAUDE.md", "# Rules\n");
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("CLAUDE.md");
      expect(result.content[0]!.text).toContain("operative grammar");
    });

    it("warns about missing Status.md", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("Status.md missing");
    });

    it("includes Status.md content snippet when present", async () => {
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

    it("warns about missing ADRs", async () => {
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("No ADRs found");
    });

    it("references ADR directory when ADRs exist", async () => {
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("docs/adrs/");
    });

    it("includes use-cases.md in context load when present", async () => {
      write(tempDir, "docs/use-cases.md", "# Use Cases\n");
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
      const result = await generateSessionPromptHandler({
        project_dir: tempDir,
        item_description: ITEM,
        session_type: "feature",
      });
      expect(result.content[0]!.text).toContain("check_cascade");
    });
  });
});
