/**
 * Tests for the set_cascade_requirement tool handler.
 * Covers: updating decisions, writing to yaml, format validation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { setCascadeRequirementHandler } from "../../src/tools/set-cascade-requirement.js";
import type { ForgeCraftConfig } from "../../src/shared/types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-set-cascade-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readConfig(projectDir: string): ForgeCraftConfig {
  const content = readFileSync(join(projectDir, "forgecraft.yaml"), "utf-8");
  return yaml.load(content) as ForgeCraftConfig;
}

function writeConfig(projectDir: string, config: Record<string, unknown>): void {
  writeFileSync(join(projectDir, "forgecraft.yaml"), yaml.dump(config), "utf-8");
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("setCascadeRequirementHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── Basic write ───────────────────────────────────────────────────

  describe("creates forgecraft.yaml when missing", () => {
    it("creates forgecraft.yaml if it does not exist", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "architecture_diagrams",
        required: false,
        rationale: "CLI project — no integration surface requiring a C4 diagram.",
      });
      expect(existsSync(join(tempDir, "forgecraft.yaml"))).toBe(true);
    });

    it("writes the cascade.steps array into the new file", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Small script with no non-obvious decisions.",
      });
      const config = readConfig(tempDir);
      expect(config.cascade?.steps).toHaveLength(1);
      expect(config.cascade?.steps[0]?.step).toBe("adrs");
    });
  });

  describe("updates existing forgecraft.yaml", () => {
    it("adds a new step to existing cascade.steps", async () => {
      writeConfig(tempDir, {
        projectName: "Test",
        cascade: { steps: [{ step: "adrs", required: false, rationale: "old", decidedAt: "2024-01-01", decidedBy: "scaffold" }] },
      });
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "architecture_diagrams",
        required: false,
        rationale: "CLI project.",
      });
      const config = readConfig(tempDir);
      expect(config.cascade?.steps).toHaveLength(2);
    });

    it("replaces an existing decision for the same step", async () => {
      writeConfig(tempDir, {
        projectName: "Test",
        cascade: { steps: [{ step: "adrs", required: true, rationale: "original", decidedAt: "2024-01-01", decidedBy: "scaffold" }] },
      });
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Revised: no complex decisions.",
      });
      const config = readConfig(tempDir);
      const adrsDecision = config.cascade?.steps.find((d) => d.step === "adrs");
      expect(adrsDecision?.required).toBe(false);
      expect(adrsDecision?.rationale).toBe("Revised: no complex decisions.");
      expect(config.cascade?.steps).toHaveLength(1);
    });

    it("preserves other existing config fields", async () => {
      writeConfig(tempDir, { projectName: "My Project", tags: ["CLI"], tier: "core" });
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "architecture_diagrams",
        required: false,
        rationale: "CLI project.",
      });
      const config = readConfig(tempDir);
      expect(config.projectName).toBe("My Project");
      expect(config.tags).toContain("CLI");
      expect(config.tier).toBe("core");
    });
  });

  describe("decision fields", () => {
    it("records required: true correctly", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "architecture_diagrams",
        required: true,
        rationale: "API project — all steps required.",
      });
      const config = readConfig(tempDir);
      expect(config.cascade?.steps[0]?.required).toBe(true);
    });

    it("records required: false correctly", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Simple project.",
      });
      const config = readConfig(tempDir);
      expect(config.cascade?.steps[0]?.required).toBe(false);
    });

    it("sets decidedBy to assistant by default", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Simple project.",
      });
      const config = readConfig(tempDir);
      expect(config.cascade?.steps[0]?.decidedBy).toBe("assistant");
    });

    it("uses decided_by when provided", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "User decision.",
        decided_by: "user",
      });
      const config = readConfig(tempDir);
      expect(config.cascade?.steps[0]?.decidedBy).toBe("user");
    });

    it("sets decidedAt to today's ISO date", async () => {
      await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Simple project.",
      });
      const config = readConfig(tempDir);
      const today = new Date().toISOString().slice(0, 10);
      expect(config.cascade?.steps[0]?.decidedAt).toBe(today);
    });
  });

  describe("return message format", () => {
    it("returns a confirmation message with OPTIONAL for required: false", async () => {
      const result = await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "architecture_diagrams",
        required: false,
        rationale: "CLI project.",
      });
      expect(result.content[0]!.text).toContain("OPTIONAL");
      expect(result.content[0]!.text).toContain("architecture_diagrams");
    });

    it("returns a confirmation message with REQUIRED for required: true", async () => {
      const result = await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "architecture_diagrams",
        required: true,
        rationale: "API project.",
      });
      expect(result.content[0]!.text).toContain("REQUIRED");
    });

    it("includes the rationale in the return message", async () => {
      const result = await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "No complex architecture decisions in this script.",
      });
      expect(result.content[0]!.text).toContain("No complex architecture decisions");
    });

    it("suggests running check_cascade to see updated status", async () => {
      const result = await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Simple project.",
      });
      expect(result.content[0]!.text).toContain("check_cascade");
    });

    it("uses ○ icon for optional decisions", async () => {
      const result = await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: false,
        rationale: "Simple project.",
      });
      expect(result.content[0]!.text).toContain("○");
    });

    it("uses ✓ icon for required decisions", async () => {
      const result = await setCascadeRequirementHandler({
        project_dir: tempDir,
        step: "adrs",
        required: true,
        rationale: "Complex project.",
      });
      expect(result.content[0]!.text).toContain("✓");
    });
  });
});
