/**
 * Tests for CommitHooksArtifact — automated pre-commit enforcement layer.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CommitHooksArtifact, COMMIT_HOOKS_ARTIFACT_ID } from "../../src/artifacts/commit-hooks.js";

const TMP_DIR = join(tmpdir(), `forgecraft-test-hooks-${Date.now()}`);
const FULL_HOOKS_DIR = join(TMP_DIR, ".claude", "hooks");
const GIT_HOOKS_DIR = join(TMP_DIR, ".git", "hooks");
const SCRIPTS_DIR = join(TMP_DIR, "scripts");

beforeAll(() => {
  mkdirSync(FULL_HOOKS_DIR, { recursive: true });
  mkdirSync(GIT_HOOKS_DIR, { recursive: true });
  mkdirSync(SCRIPTS_DIR, { recursive: true });

  // Write all required hook files
  const required = [
    "pre-commit-no-temp-files.sh",
    "pre-commit-secrets.sh",
    "pre-commit-prod-quality.sh",
    "pre-commit-compile.sh",
    "pre-commit-test.sh",
  ];
  for (const h of required) {
    writeFileSync(join(FULL_HOOKS_DIR, h), "#!/usr/bin/env sh\nexit 0");
  }

  writeFileSync(join(GIT_HOOKS_DIR, "pre-commit"), "#!/usr/bin/env sh\n.claude/hooks/pre-commit-test.sh");
  writeFileSync(join(SCRIPTS_DIR, "setup-hooks.sh"), "#!/usr/bin/env sh\necho installed");
});

afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("CommitHooksArtifact", () => {
  describe("identity properties", () => {
    it("has the correct specId", () => {
      const artifact = new CommitHooksArtifact(TMP_DIR);
      expect(artifact.specId).toBe(COMMIT_HOOKS_ARTIFACT_ID);
    });

    it("has a non-empty name and purpose", () => {
      const artifact = new CommitHooksArtifact(TMP_DIR);
      expect(artifact.name).toContain("Hook");
      expect(artifact.purpose.length).toBeGreaterThan(0);
    });

    it("covers enforcement areas including secrets and compilation", () => {
      const artifact = new CommitHooksArtifact(TMP_DIR);
      const coversText = artifact.covers.join(" ");
      expect(coversText).toContain("Secret");
      expect(coversText).toContain("compilation");
    });

    it("excludes hook implementation details from its own spec", () => {
      const artifact = new CommitHooksArtifact(TMP_DIR);
      const excludesText = artifact.excludes.join(" ");
      expect(excludesText).toContain(".claude/hooks");
    });
  });

  describe("isInScope", () => {
    const artifact = new CommitHooksArtifact(TMP_DIR);

    it("returns true for .claude/hooks/ paths", () => {
      expect(artifact.isInScope(".claude/hooks/pre-commit-test.sh")).toBe(true);
    });

    it("returns true for .git/hooks/ paths", () => {
      expect(artifact.isInScope(".git/hooks/pre-commit")).toBe(true);
    });

    it("returns true for scripts/setup-hooks.sh", () => {
      expect(artifact.isInScope("scripts/setup-hooks.sh")).toBe(true);
    });

    it("returns false for unrelated paths", () => {
      expect(artifact.isInScope("src/index.ts")).toBe(false);
      expect(artifact.isInScope("CLAUDE.md")).toBe(false);
    });
  });

  describe("verify()", () => {
    const artifact = new CommitHooksArtifact(TMP_DIR);

    it("passes for an existing file", async () => {
      const results = await artifact.verify(".claude/hooks/pre-commit-test.sh");
      expect(results[0]?.passed).toBe(true);
      expect(results[0]?.criterion).toBe("file-exists");
    });

    it("fails for a non-existent file", async () => {
      const results = await artifact.verify(".claude/hooks/nonexistent.sh");
      expect(results[0]?.passed).toBe(false);
    });
  });

  describe("defend() with all hooks present", () => {
    it("passes all gates", async () => {
      const artifact = new CommitHooksArtifact(TMP_DIR);
      const { allPassed, results } = await artifact.defend();
      expect(allPassed).toBe(true);
      for (const r of results) {
        expect(r.exitCode).toBe(0);
      }
    });
  });

  describe("defend() with missing hooks directory", () => {
    it("fails hooks-directory-exists gate", async () => {
      const artifact = new CommitHooksArtifact("/nonexistent/path/project");
      const { allPassed, results } = await artifact.defend();
      expect(allPassed).toBe(false);
      const hooksGate = results.find((r) => r.gate.id === "hooks-directory-exists");
      expect(hooksGate?.exitCode).toBe(1);
    });
  });

  describe("composeWith()", () => {
    it("has no dependsOn (hooks are terminal — nothing depends on them)", () => {
      const artifact = new CommitHooksArtifact(TMP_DIR);
      // Hooks are the enforcement layer; they depend on everything but nothing depends on them
      expect(Array.isArray(artifact.dependsOn)).toBe(true);
    });

    it("returns empty conflicts when composed with another artifact", () => {
      const a = new CommitHooksArtifact(TMP_DIR);
      const b = new CommitHooksArtifact(TMP_DIR);
      const conflicts = a.composeWith(b);
      expect(conflicts).toHaveLength(0);
    });
  });
});
