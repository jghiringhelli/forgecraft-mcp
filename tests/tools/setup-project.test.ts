/**
 * Tests for the setup_project two-phase onboarding handler.
 *
 * Covers: phase 1 (analysis + questions), phase 2 (cascade decisions + artifacts),
 * spec intake, existing project detection, and consumer overrides.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupProjectHandler } from "../../src/tools/setup-project.js";

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
      expect(text).toContain("mvp");
      expect(text).toContain("scope_complete");
      expect(text).toContain("has_consumers");
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
      writeFileSync(join(tempDir, "docs", "PRD.md"), "# Existing PRD\nKeep me.", "utf-8");
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
});

