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
  readFileSync,
  existsSync,
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

/** Build a fully passing cascade in tempDir. */
function buildCompleteCascade(dir: string): void {
  write(
    dir,
    "docs/PRD.md",
    "# PRD\n## Functional Scope\nWhat the system does.\n",
  );
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(dir, "docs/diagrams/c4-context.md", "```mermaid\nC4Context\n```\n");
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
  write(dir, "docs/use-cases.md", "# Use Cases\n## UC-001\nActor: user\n");
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("checkCascadeHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

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
      expect(result.content[0]!.text).toContain(
        "No AI assistant instruction file",
      );
    });

    it("reports WARN when CLAUDE.md exceeds 300 lines", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      // 310 non-empty lines
      write(
        tempDir,
        "CLAUDE.md",
        Array.from({ length: 310 }, (_, i) => `- rule ${i}`).join("\n"),
      );
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("300-line threshold");
    });

    it("accepts .github/copilot-instructions.md as a constitution", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(
        tempDir,
        ".github/copilot-instructions.md",
        "# Copilot Instructions\nRules here.\n",
      );
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

    it("accepts MADR-style NNNN-description.md naming (no ADR prefix)", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/0001-use-typescript.md", "# ADR\n");
      write(tempDir, "docs/use-cases.md", "# Use Cases\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toMatch(/ADR\(s\) in docs\/adrs/);
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
      write(
        tempDir,
        "Status.md",
        "# Status\n## Next Steps\n- Add auth endpoint\n",
      );
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

    it("writes docs/session-prompt-initial.md when cascade first completes", async () => {
      buildCompleteCascade(tempDir);
      await checkCascadeHandler({ project_dir: tempDir });
      const promptPath = join(tempDir, "docs", "session-prompt-initial.md");
      expect(existsSync(promptPath)).toBe(true);
      const content = readFileSync(promptPath, "utf-8");
      expect(content).toContain("Initial Implementation Session Prompt");
      expect(content).toContain("UC-001");
      expect(content).toContain("check_cascade");
    });

    it("does not overwrite docs/session-prompt-initial.md on subsequent cascade checks", async () => {
      buildCompleteCascade(tempDir);
      await checkCascadeHandler({ project_dir: tempDir });
      const promptPath = join(tempDir, "docs", "session-prompt-initial.md");
      // Modify the file to detect overwrite
      writeFileSync(promptPath, "# Custom content", "utf-8");
      await checkCascadeHandler({ project_dir: tempDir });
      expect(readFileSync(promptPath, "utf-8")).toBe("# Custom content");
    });

    it("does not write session-prompt-initial.md when cascade is incomplete", async () => {
      // Only step 1 done — cascade not complete
      write(
        tempDir,
        "docs/PRD.md",
        "# PRD\n## Functional Scope\nWhat the system does.\n",
      );
      await checkCascadeHandler({ project_dir: tempDir });
      const promptPath = join(tempDir, "docs", "session-prompt-initial.md");
      expect(existsSync(promptPath)).toBe(false);
    });
  });

  // ── Fix 1: doc aliasing ───────────────────────────────────────────

  describe("doc aliasing — content-based fallback", () => {
    it("returns WARN (not FAIL) when docs/ has a non-standard spec file with structural sections", async () => {
      mkdirSync(join(tempDir, "docs"), { recursive: true });
      write(
        tempDir,
        "docs/master_playbook_v2.md",
        [
          "# Master Playbook",
          "",
          "## Background",
          "This project solves the problem of too many manual workflows.",
          "",
          "## Goals",
          "- Automate onboarding",
          "- Reduce time-to-deploy by 50%",
          "",
          "## Users",
          "- Platform engineers",
          "- DevOps teams",
          "",
          "## Requirements",
          "- Must integrate with GitHub Actions",
          "".padEnd(500, "x"),
        ].join("\n"),
      );
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("master_playbook_v2.md");
      expect(text).not.toContain("No functional specification found");
    });

    it("returns WARN with a hint to rename to docs/PRD.md", async () => {
      mkdirSync(join(tempDir, "docs"), { recursive: true });
      write(
        tempDir,
        "docs/master_playbook_v2.md",
        [
          "# Playbook",
          "## Problem",
          "We need a solution for X.",
          "## Background",
          "Context about X.",
          "## Goals",
          "Achieve Y.",
          "## Users",
          "Engineers.",
          "".padEnd(500, "x"),
        ].join("\n"),
      );
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("PRD.md");
    });

    it("step 5 returns WARN when docs/ has a *spec*.md fallback file", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n## Scope\nThe system does X.\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      write(
        tempDir,
        "docs/api-spec.md",
        "# API Spec\n\n## Overview\nThis spec describes the API.\n",
      );
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("api-spec.md");
      expect(text).not.toContain("No use cases and no Status.md");
    });
  });

  // ── Fix 4: Python package equivalents ─────────────────────────────

  describe("Python package file equivalents", () => {
    it("step 5 returns PASS when pyproject.toml and tests/ directory exist", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n## Scope\nThe system does X.\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      write(tempDir, "pyproject.toml", '[tool.poetry]\nname = "myapp"\n');
      mkdirSync(join(tempDir, "tests"), { recursive: true });
      write(tempDir, "tests/test_main.py", "def test_example(): assert True\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Test directory found");
    });

    it("step 5 returns PASS when requirements.txt and test/ directory exist", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n## Scope\nThe system does X.\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      write(tempDir, "requirements.txt", "fastapi==0.100.0\n");
      mkdirSync(join(tempDir, "test"), { recursive: true });
      write(tempDir, "test/test_api.py", "def test_ping(): assert True\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Test directory found");
    });
  });

  // ── Fix 5: zero-test-gate ─────────────────────────────────────────

  describe("zero-test-gate — placeholder test script", () => {
    it("step 5 returns FAIL when package.json test script is a placeholder echo", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      write(
        tempDir,
        "package.json",
        JSON.stringify({
          name: "my-app",
          scripts: { test: 'echo "Error: no test specified" && exit 1' },
        }),
      );
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("No test suite configured");
      expect(text).toContain("placeholder");
    });

    it("does NOT fail when package.json test script is a real test runner", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n## Scope\nSystem overview.\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4.md", "```mermaid\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n");
      write(
        tempDir,
        "package.json",
        JSON.stringify({
          name: "my-app",
          scripts: { test: "vitest run" },
        }),
      );
      mkdirSync(join(tempDir, "tests"), { recursive: true });
      write(tempDir, "tests/main.test.ts", "// tests\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).not.toContain("No test suite configured");
    });
  });
});
