/**
 * Tests for the check_cascade tool handler.
 *
 * Covers: each cascade step failing independently, all steps passing,
 * constitution size warning, and partial (WARN-only) results.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkCascadeHandler } from "../../src/tools/check-cascade.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-cascade-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a file at a relative path, creating parent dirs as needed. */
function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(join(dir, relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : ""), {
    recursive: true,
  });
  writeFileSync(fullPath, content, "utf-8");
}

/** Build a fully passing cascade in tempDir. */
function buildCompleteCascade(dir: string): void {
  write(dir, "docs/PRD.md", "# PRD\n## Functional Scope\nWhat the system does.\n");
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(dir, "docs/diagrams/c4-context.md", "```mermaid\nC4Context\n```\n");
  write(dir, "CLAUDE.md", "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n");
  mkdirSync(join(dir, "docs/adrs"), { recursive: true });
  write(dir, "docs/adrs/ADR-0001-stack.md", "# ADR-0001\n## Decision\nUse TypeScript.\n");
  write(dir, "docs/use-cases.md", "# Use Cases\n## UC-001\nActor: user\n");
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("checkCascadeHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── Step 1: Functional Specification ─────────────────────────────

  describe("step 1 — functional specification", () => {
    it("reports FAIL when no functional spec file exists", async () => {
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Functional Specification");
      expect(text).toContain("BLOCKED");
    });

    it("reports PASS when docs/PRD.md exists", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toMatch(/Step 1.*Functional Specification/);
      expect(text).toContain("COMPLETE");
    });

    it("accepts docs/TechSpec.md as a valid functional spec", async () => {
      write(tempDir, "docs/TechSpec.md", "# Tech Spec\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("TechSpec.md");
    });
  });

  // ── Step 2: Diagrams ──────────────────────────────────────────────

  describe("step 2 — architecture diagrams", () => {
    it("reports FAIL when docs/diagrams/ does not exist", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("Architecture Diagrams");
    });

    it("reports WARN when docs/diagrams/ is empty", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("no diagram files");
    });

    it("reports PASS when docs/diagrams/ has at least one .md file", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("1 diagram file");
    });
  });

  // ── Step 3: Constitution ──────────────────────────────────────────

  describe("step 3 — architectural constitution", () => {
    it("reports FAIL when no constitution file exists", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("No AI assistant instruction file");
    });

    it("reports WARN when CLAUDE.md exceeds 300 lines", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      // 310 non-empty lines
      write(tempDir, "CLAUDE.md", Array.from({ length: 310 }, (_, i) => `- rule ${i}`).join("\n"));
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("300-line threshold");
    });

    it("accepts .github/copilot-instructions.md as a constitution", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, ".github/copilot-instructions.md", "# Copilot Instructions\nRules here.\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("copilot-instructions.md");
    });
  });

  // ── Step 4: ADRs ─────────────────────────────────────────────────

  describe("step 4 — ADRs", () => {
    it("reports FAIL when no ADRs found in docs/adrs/ or docs/adr/", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("No ADRs found");
    });

    it("reports PASS when docs/adrs/ contains an ADR", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toMatch(/ADR\(s\) in docs\/adrs/);
    });

    it("accepts ADRs in docs/adr/ (without trailing s)", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adr"), { recursive: true });
      write(tempDir, "docs/adr/ADR-0001.md", "# ADR\n");
      write(tempDir, "docs/use-cases.md", "# Use Cases\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("ADR");
    });
  });

  // ── Step 5: Behavioral Contracts ────────────────────────────────

  describe("step 5 — behavioral contracts", () => {
    it("reports FAIL when no use cases and no Status.md with next steps", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("No use cases");
    });

    it("reports WARN when Status.md has next-steps but no use-cases.md", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      write(tempDir, "Status.md", "# Status\n## Next Steps\n- Add auth endpoint\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("partial coverage only");
    });

    it("reports PASS when docs/use-cases.md exists", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("use-cases.md");
    });
  });

  // ── Full cascade ─────────────────────────────────────────────────

  describe("complete cascade", () => {
    it("reports COMPLETE with 5/5 steps passing", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("5/5 steps passing");
      expect(text).toContain("COMPLETE");
      expect(text).toContain("derivability criterion");
    });

    it("includes generate_session_prompt in next-step guidance when complete", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("generate_session_prompt");
    });

    it("includes files_created and next_steps in output", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("files_created");
      expect(result.content[0]!.text).toContain("next_steps");
    });
  });
});
