/**
 * Tests for ClaudeInstructionsArtifact — verifies well-formed instruction files.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeInstructionsArtifact, CLAUDE_INSTRUCTIONS_ARTIFACT_ID } from "../../src/artifacts/claude-instructions.js";

const TMP_DIR = join(tmpdir(), `forgecraft-test-claude-${Date.now()}`);

beforeAll(() => mkdirSync(TMP_DIR, { recursive: true }));
afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("ClaudeInstructionsArtifact", () => {
  describe("identity properties", () => {
    it("has the correct specId", () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      expect(artifact.specId).toBe(CLAUDE_INSTRUCTIONS_ARTIFACT_ID);
    });

    it("has a non-empty name and purpose", () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      expect(artifact.name.length).toBeGreaterThan(0);
      expect(artifact.purpose.length).toBeGreaterThan(0);
    });

    it("covers and excludes are non-empty arrays", () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      expect(artifact.covers.length).toBeGreaterThan(0);
      expect(artifact.excludes.length).toBeGreaterThan(0);
    });

    it("accepts a custom version", () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR, "2.0.0");
      expect(artifact.version).toBe("2.0.0");
    });

    it("defaults version to 1.0.0", () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      expect(artifact.version).toBe("1.0.0");
    });
  });

  describe("isInScope", () => {
    const artifact = new ClaudeInstructionsArtifact(TMP_DIR);

    it("returns true for CLAUDE.md", () => {
      expect(artifact.isInScope("CLAUDE.md")).toBe(true);
    });

    it("returns true for GitHub Copilot instructions", () => {
      expect(artifact.isInScope(".github/copilot-instructions.md")).toBe(true);
    });

    it("returns true for .cursorrules", () => {
      expect(artifact.isInScope(".cursorrules")).toBe(true);
    });

    it("returns false for unrelated files", () => {
      expect(artifact.isInScope("src/index.ts")).toBe(false);
      expect(artifact.isInScope("package.json")).toBe(false);
    });
  });

  describe("verify()", () => {
    it("returns file-not-found result when file is missing", async () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      const results = await artifact.verify("NONEXISTENT.md");
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.criterion).toBe("file-exists");
    });

    it("passes has-sections for a file with ## headers", async () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      const filePath = join(TMP_DIR, "CLAUDE-test.md");
      writeFileSync(filePath, "## Project Identity\n- Repo: example\n## Code Standards\n- Max 50 lines");
      const results = await artifact.verify("CLAUDE-test.md");
      const sectionsResult = results.find((r) => r.criterion === "has-sections");
      expect(sectionsResult?.passed).toBe(true);
    });

    it("fails token-budget when file exceeds 200 lines", async () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      const longContent = Array.from({ length: 250 }, (_, i) => `Line ${i}: content here`).join("\n");
      const filePath = join(TMP_DIR, "CLAUDE-long.md");
      writeFileSync(filePath, longContent);
      const results = await artifact.verify("CLAUDE-long.md");
      const budgetResult = results.find((r) => r.criterion === "token-budget");
      expect(budgetResult?.passed).toBe(false);
      expect(budgetResult?.detail).toContain("250");
    });

    it("passes token-budget for a file under 200 lines", async () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      const shortContent = Array.from({ length: 100 }, (_, i) => `## Section ${i}`).join("\n");
      const filePath = join(TMP_DIR, "CLAUDE-short.md");
      writeFileSync(filePath, shortContent);
      const results = await artifact.verify("CLAUDE-short.md");
      const budgetResult = results.find((r) => r.criterion === "token-budget");
      expect(budgetResult?.passed).toBe(true);
    });

    it("fails no-hook-duplication when file contains hook details", async () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      writeFileSync(join(TMP_DIR, "CLAUDE-hooks.md"), "## Config\npre-commit runs lint\n");
      const results = await artifact.verify("CLAUDE-hooks.md");
      const hookResult = results.find((r) => r.criterion === "no-hook-duplication");
      expect(hookResult?.passed).toBe(false);
    });
  });

  describe("defend()", () => {
    it("returns allPassed and results array", async () => {
      const artifact = new ClaudeInstructionsArtifact("/nonexistent/project");
      const { allPassed, results } = await artifact.defend();
      expect(typeof allPassed).toBe("boolean");
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(artifact.gates.length);
    });

    it("each result contains gate, exitCode, message", async () => {
      const artifact = new ClaudeInstructionsArtifact("/nonexistent/project");
      const { results } = await artifact.defend();
      for (const r of results) {
        expect(r.gate).toBeDefined();
        expect(typeof r.exitCode).toBe("number");
        expect(typeof r.message).toBe("string");
      }
    });
  });

  describe("findDecision()", () => {
    it("returns undefined when decisions array is empty", () => {
      const artifact = new ClaudeInstructionsArtifact(TMP_DIR);
      expect(artifact.findDecision("authentication")).toBeUndefined();
    });
  });

  describe("composeWith()", () => {
    it("returns empty array when composed with itself (no conflict)", () => {
      const a = new ClaudeInstructionsArtifact(TMP_DIR);
      const b = new ClaudeInstructionsArtifact(TMP_DIR);
      const conflicts = a.composeWith(b);
      expect(Array.isArray(conflicts)).toBe(true);
      expect(conflicts).toHaveLength(0);
    });
  });
});
