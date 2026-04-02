/**
 * Tests for the setup_project two-phase onboarding handler.
 *
 * Covers: phase 1 (analysis + questions), phase 2 (cascade decisions + artifacts),
 * spec intake, existing project detection, and consumer overrides.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setupProjectHandler,
  detectProjectMode,
} from "../../src/tools/setup-project.js";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-setup-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const SAMPLE_SPEC = `# My Project

## Problem
Teams waste hours on manual deployment workflows.

## Users
- DevOps engineers
- Platform teams

## Goals
- Reduce deploy time by 80%
- Zero-downtime deployments

## Components
- Deployment orchestrator
- Config manager
- Health check service
`;

// ── Suite ─────────────────────────────────────────────────────────────

describe("setupProjectHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Phase 1: analysis + questions ────────────────────────────────

  describe("phase 1 — no mvp/scope_complete/has_consumers", () => {
    it("returns phase 1 response with three questions for empty project with no spec", async () => {
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Project Setup");
      expect(text).toContain("Q1");
      expect(text).toContain("Q2");
      expect(text).toContain("Q3");
      expect(text).toContain("Q4");
      expect(text).toContain("mvp");
      expect(text).toContain("scope_complete");
      expect(text).toContain("has_consumers");
      expect(text).toContain("use_codeseeker");
    });

    it("returns phase 1 response with spec summary when spec_text provided", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        spec_text: SAMPLE_SPEC,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("What I found");
      expect(text).toContain("My Project");
    });

    it("reads spec from spec_path and includes summary in phase 1", async () => {
      const specFile = join(tempDir, "spec.md");
      writeFileSync(specFile, SAMPLE_SPEC, "utf-8");
      const result = await setupProjectHandler({
        project_dir: tempDir,
        spec_path: specFile,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("What I found");
      expect(text).toContain(specFile);
    });

    it("auto-discovers README.md as spec when no spec arg provided", async () => {
      writeFileSync(join(tempDir, "README.md"), SAMPLE_SPEC, "utf-8");
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("What I found");
    });

    it("detects existing project mode when src/ directory has files", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(join(tempDir, "src", "index.ts"), "export {};", "utf-8");
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Existing project");
    });

    it("reports new project mode when no source dirs exist", async () => {
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("New project");
    });

    it("throws when spec_path does not exist", async () => {
      await expect(
        setupProjectHandler({
          project_dir: tempDir,
          spec_path: join(tempDir, "nonexistent.md"),
        }),
      ).rejects.toThrow("not found");
    });
  });

  // ── Phase 2: cascade decisions + artifacts ───────────────────────

  describe("phase 2 — mvp/scope_complete/has_consumers provided", () => {
    it("creates forgecraft.yaml in phase 2", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      expect(existsSync(join(tempDir, "forgecraft.yaml"))).toBe(true);
    });

    it("forgecraft.yaml contains cascade decisions in phase 2", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const yaml = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
      expect(yaml).toContain("cascade");
      expect(yaml).toContain("functional_spec");
    });

    it("mvp=true makes architecture_diagrams optional", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: true,
        has_consumers: false,
      });
      const text = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
      // architecture_diagrams required: false
      expect(text).toMatch(/architecture_diagrams[\s\S]{0,200}required: false/);
    });

    it("has_consumers=true makes behavioral_contracts required regardless of mvp", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: true,
      });
      const yaml = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
      // behavioral_contracts required: true
      expect(yaml).toMatch(/behavioral_contracts[\s\S]{0,200}required: true/);
    });

    it("scope_complete=false makes adrs optional", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: false,
        has_consumers: false,
      });
      const yaml = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
      expect(yaml).toMatch(/adrs[\s\S]{0,200}required: false/);
    });

    it("creates docs/PRD.md when spec_text provided in phase 2", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        spec_text: SAMPLE_SPEC,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      expect(existsSync(join(tempDir, "docs", "PRD.md"))).toBe(true);
    });

    it("PRD.md contains spec content mapped to sections", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        spec_text: SAMPLE_SPEC,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const prd = readFileSync(join(tempDir, "docs", "PRD.md"), "utf-8");
      expect(prd).toContain("## Problem");
      expect(prd).toContain("## Users");
    });

    it("does not overwrite existing docs/PRD.md", async () => {
      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(
        join(tempDir, "docs", "PRD.md"),
        "# Existing PRD\nKeep me.",
        "utf-8",
      );
      await setupProjectHandler({
        project_dir: tempDir,
        spec_text: SAMPLE_SPEC,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const prd = readFileSync(join(tempDir, "docs", "PRD.md"), "utf-8");
      expect(prd).toContain("Keep me.");
    });

    it("phase 2 response contains cascade decisions summary", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Cascade decisions");
      expect(text).toContain("functional_spec");
    });

    it("phase 2 response mentions check_cascade next step", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("check_cascade");
    });
  });

  // ── Ambiguity detection ──────────────────────────────────────────

  describe("ambiguity detection", () => {
    it("phase 1 with pure docs project includes Ambiguity Detected section", async () => {
      // No package.json — only a markdown file — triggers project_type ambiguity
      writeFileSync(
        join(tempDir, "README.md"),
        "# Storycraft Design System\n\nA narrative design system for interactive fiction.",
        "utf-8",
      );
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Ambiguity Detected");
      expect(text).toContain("project_type");
      expect(text).toContain("markdown files present");
    });

    it("phase 1 ambiguity section appears BEFORE the three calibration questions", async () => {
      writeFileSync(
        join(tempDir, "SPEC.md"),
        "# Design System\n\nPure docs project.",
        "utf-8",
      );
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      const ambiguityIdx = text.indexOf("Ambiguity Detected");
      const questionsIdx = text.indexOf("Before I proceed");
      expect(ambiguityIdx).toBeGreaterThan(-1);
      expect(questionsIdx).toBeGreaterThan(-1);
      expect(ambiguityIdx).toBeLessThan(questionsIdx);
    });

    it("phase 1 with no ambiguities does NOT include Ambiguity Detected section", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "my-api", dependencies: { express: "^4.0.0" } }),
        "utf-8",
      );
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).not.toContain("Ambiguity Detected");
    });

    it("phase 2 with project_type_override='docs' uses DOCS cascade defaults", async () => {
      writeFileSync(
        join(tempDir, "README.md"),
        "# Design System\n\nPure docs project.",
        "utf-8",
      );
      await setupProjectHandler({
        project_dir: tempDir,
        project_type_override: "docs",
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      // DOCS: constitution is optional
      expect(yamlContent).toMatch(/constitution[\s\S]{0,300}required: false/);
      // DOCS: functional_spec is still required
      expect(yamlContent).toMatch(/functional_spec[\s\S]{0,300}required: true/);
    });

    it("phase 2 with project_type_override='cli' applies CLI tag decisions", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        project_type_override: "cli",
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      // CLI: architecture_diagrams is optional
      expect(yamlContent).toMatch(
        /architecture_diagrams[\s\S]{0,300}required: false/,
      );
    });

    // ── findRichestSpecFile fallback ─────────────────────────────

    it("uses richest spec file when standard spec search fails", async () => {
      // Create a large non-standard spec file (not in standard SPEC_SEARCH_PATHS)
      const docsDir = join(tempDir, "docs");
      mkdirSync(docsDir, { recursive: true });
      const richContent = `# Rich Spec\n\n## Problem\nThis is a detailed spec.\n\n${"detail ".repeat(100)}`;
      writeFileSync(join(docsDir, "design.md"), richContent, "utf-8");

      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      // Phase 1 should pick up the spec
      expect(text).toContain("What I found");
    });

    // ── sensitiveData detection ───────────────────────────────────

    it("sets sensitiveData in forgecraft.yaml when spec mentions health keywords", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        spec_text:
          "# Health Monitor\n\n## Problem\nA patient health monitoring system tracking medical records.\n\n## Users\n- Hospital staff\n- Patients",
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).toContain("sensitiveData: true");
    });

    it("includes sensitive data warning in phase 2 response when detected", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        spec_text:
          "# Payment System\n\n## Problem\nA payment processing platform handling financial transactions.\n\n## Users\n- Merchants",
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Sensitive data detected");
    });

    it("does NOT set sensitiveData for non-sensitive project", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        spec_text:
          "# Static Blog\n\n## Problem\nA static site generator for personal blogs.\n\n## Users\n- Bloggers",
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).not.toContain("sensitiveData: true");
    });

    // ── LLM tag override (tags param in Phase 2) ─────────────────────

    it("phase 2 with tags param overrides directory-inferred tags in forgecraft.yaml", async () => {
      // Simulate compass: only a docs folder, no package.json → directory scan would produce wrong tags
      const docsDir = join(tempDir, "docs");
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        join(docsDir, "spec.md"),
        "# ETL Pipeline\n\n## Overview\nExtracts state from cloud services.",
        "utf-8",
      );
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
        tags: ["DATA-PIPELINE", "UNIVERSAL"],
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).toContain("DATA-PIPELINE");
      expect(yamlContent).not.toContain("API");
      expect(yamlContent).not.toContain("MOBILE");
    });

    it("phase 2 tags param always includes UNIVERSAL even if not passed", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
        tags: ["CLI"],
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).toContain("UNIVERSAL");
      expect(yamlContent).toContain("CLI");
    });

    it("phase 2 without tags param uses directory-inferred tags", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "my-api", dependencies: { express: "^4.0.0" } }),
        "utf-8",
      );
      mkdirSync(join(tempDir, "src", "routes"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "routes", "users.ts"),
        "export {};",
        "utf-8",
      );
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
        // no tags param — directory infers API
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).toContain("API");
    });
  });

  // ── CNT generation ───────────────────────────────────────────────────

  describe("CNT generation", () => {
    it("setup_project generates .claude/index.md with navigation protocol", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const indexPath = join(tempDir, ".claude", "index.md");
      expect(existsSync(indexPath)).toBe(true);
      const content = readFileSync(indexPath, "utf-8");
      expect(content).toContain("Context Index");
      expect(content).toContain("Navigation Protocol");
      expect(content).toContain(".claude/core.md");
      expect(content).toContain("Architecture decisions");
    });

    it("setup_project generates .claude/core.md under 50 lines", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        spec_text: SAMPLE_SPEC,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const corePath = join(tempDir, ".claude", "core.md");
      expect(existsSync(corePath)).toBe(true);
      const content = readFileSync(corePath, "utf-8");
      const lineCount = content.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(50);
      expect(content).toContain("Core");
      expect(content).toContain("Layer Map");
      expect(content).toContain("Invariants");
    });

    it("setup_project generates .claude/adr/index.md", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const adrIndexPath = join(tempDir, ".claude", "adr", "index.md");
      expect(existsSync(adrIndexPath)).toBe(true);
      const content = readFileSync(adrIndexPath, "utf-8");
      expect(content).toContain("Architecture Decisions");
      expect(content).toContain("| ID | Decision | Status | Node |");
    });

    it("setup_project generates .claude/gates/index.md", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const gatesIndexPath = join(tempDir, ".claude", "gates", "index.md");
      expect(existsSync(gatesIndexPath)).toBe(true);
      const content = readFileSync(gatesIndexPath, "utf-8");
      expect(content).toContain("Active Quality Gates");
      expect(content).toContain("close_cycle");
    });

    it("CLAUDE.md is 3-5 lines (identity + pointer only)", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const claudePath = join(tempDir, "CLAUDE.md");
      expect(existsSync(claudePath)).toBe(true);
      const content = readFileSync(claudePath, "utf-8");
      const nonEmptyLines = content
        .split("\n")
        .filter((l) => l.trim().length > 0);
      expect(nonEmptyLines.length).toBeLessThanOrEqual(5);
      expect(content).toContain(".claude/index.md");
    });

    it("ADR-000 is created on first setup", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: false,
        scope_complete: true,
        has_consumers: false,
      });
      const adr000Path = join(tempDir, "docs", "adrs", "ADR-000-cnt-init.md");
      expect(existsSync(adr000Path)).toBe(true);
      const content = readFileSync(adr000Path, "utf-8");
      expect(content).toContain("ADR-000");
      expect(content).toContain("Context Navigation Tree");
      expect(content).toContain("Accepted");
    });
  });

  // ── Brownfield detection ─────────────────────────────────────────────

  describe("brownfield detection", () => {
    it("detectProjectMode returns brownfield when src/*.ts exists and no spec doc", () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "index.ts"),
        "export const x = 1;",
        "utf-8",
      );
      expect(detectProjectMode(tempDir)).toBe("brownfield");
    });

    it("detectProjectMode returns greenfield when no src files exist", () => {
      expect(detectProjectMode(tempDir)).toBe("greenfield");
    });

    it("setupProjectHandler phase1 uses brownfield questions when brownfield detected", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "server.ts"),
        "export const x = 1;",
        "utf-8",
      );
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Brownfield Project Detected");
      expect(text).toContain("What is currently broken or incomplete");
      expect(text).toContain("docs/PRD.md");
    });
  });

  // ── CodeSeeker opt-in ────────────────────────────────────────────────

  describe("CodeSeeker opt-in", () => {
    it("phase 1 response includes Q4 asking about CodeSeeker", async () => {
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Q4");
      expect(text).toContain("CodeSeeker");
      expect(text).toContain("use_codeseeker");
    });

    it("phase 2 with use_codeseeker=false excludes codeseeker from .claude/settings.json", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        use_codeseeker: false,
      });
      const settingsPath = join(tempDir, ".claude", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(settings.mcpServers).not.toHaveProperty("codeseeker");
    });

    it("phase 2 with use_codeseeker=true includes codeseeker in .claude/settings.json", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        use_codeseeker: true,
      });
      const settingsPath = join(tempDir, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(settings.mcpServers).toHaveProperty("codeseeker");
    });

    it("phase 2 omitting use_codeseeker defaults to including codeseeker", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
      });
      const settingsPath = join(tempDir, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(settings.mcpServers).toHaveProperty("codeseeker");
    });
  });

  // ── Git pre-flight ───────────────────────────────────────────────────

  describe("git pre-flight", () => {
    it("normal phase 1 flow proceeds when VITEST guard returns repo status", async () => {
      // VITEST guard returns 'repo' so setup always reaches phase 1 in tests.
      // Confirms neither blocker message appears in the normal path.
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Project Setup");
      expect(text).not.toContain("Git Required");
      expect(text).not.toContain("Repository Required");
    });
  });

  // ── Tool vs. sample output ───────────────────────────────────────────

  describe("tool_sample_split", () => {
    it("phase 2 with tool_sample_split=tool_and_sample writes docs/sample-outcome.md", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        tool_sample_split: "tool_and_sample",
      });
      expect(existsSync(join(tempDir, "docs", "sample-outcome.md"))).toBe(true);
    });

    it("phase 2 with tool_sample_split=tool_only does NOT write docs/sample-outcome.md", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        tool_sample_split: "tool_only",
      });
      expect(existsSync(join(tempDir, "docs", "sample-outcome.md"))).toBe(
        false,
      );
    });

    it("phase 2 omitting tool_sample_split does NOT write docs/sample-outcome.md", async () => {
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
      });
      expect(existsSync(join(tempDir, "docs", "sample-outcome.md"))).toBe(
        false,
      );
    });

    it("phase 2 response with tool_and_sample includes split callout text", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        tool_sample_split: "tool_and_sample",
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Tool vs. Sample Output");
      expect(text).toContain("sample-outcome.md");
    });

    it("phase 2 response with tool_only does NOT include split callout", async () => {
      const result = await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        tool_sample_split: "tool_only",
      });
      const text = result.content[0]!.text;
      expect(text).not.toContain("Tool vs. Sample Output");
    });
  });

  // ── Playwright MCP opt-in ─────────────────────────────────────────────

  describe("Playwright MCP opt-in", () => {
    it("phase 1 for a non-web/API project does NOT include Q5 about Playwright", async () => {
      // tempDir has no package.json → infers UNIVERSAL + LIBRARY → no playwright tags
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).not.toContain("Q5");
      expect(text).not.toContain("use_playwright");
    });

    it("phase 1 for a WEB-REACT project includes Q5 about Playwright", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
        }),
        "utf-8",
      );
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Q5");
      expect(text).toContain("Playwright MCP");
      expect(text).toContain("use_playwright");
    });

    it("phase 1 for an API project includes Q5 about Playwright", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "utf-8",
      );
      const result = await setupProjectHandler({ project_dir: tempDir });
      const text = result.content[0]!.text;
      expect(text).toContain("Q5");
      expect(text).toContain("Playwright MCP");
      expect(text).toContain("use_playwright");
    });

    it("phase 2 with use_playwright=false excludes playwright from .claude/settings.json", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" } }),
        "utf-8",
      );
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        use_playwright: false,
      });
      const settingsPath = join(tempDir, ".claude", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(settings.mcpServers).not.toHaveProperty("playwright");
    });

    it("phase 2 with use_playwright=true includes playwright for WEB-REACT project", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" } }),
        "utf-8",
      );
      await setupProjectHandler({
        project_dir: tempDir,
        mvp: true,
        scope_complete: false,
        has_consumers: false,
        use_playwright: true,
      });
      const settingsPath = join(tempDir, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(settings.mcpServers).toHaveProperty("playwright");
    });
  });
});
