/**
 * Tests for the analyze_harness tool handler.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeHarnessHandler } from "../../src/tools/analyze-harness.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-analyze-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("analyzeHarnessHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    // Create a minimal forgecraft.yaml so the handler can read tags
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      `tags: [UNIVERSAL]\nproject:\n  name: test-project\n`,
    );
    // Initialize .git to satisfy git checks
    mkdirSync(join(tempDir, ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a gap report when all artifacts are missing", async () => {
    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;
    expect(text).toMatch(/gap/i);
  });

  it("reports missing CLAUDE.md sentinel sections as gaps", async () => {
    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    const text = result.content[0]!.text;
    expect(text).toMatch(/Tool Sequencing|Corrections Log/);
  });

  it("reports missing required docs as gaps", async () => {
    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    const text = result.content[0]!.text;
    expect(text).toMatch(/PRD|use-cases|operation-classification/i);
  });

  it("reports missing hook scripts as gaps", async () => {
    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    const text = result.content[0]!.text;
    expect(text).toMatch(/pre-commit-coverage|pre-tool-use|prompt-guard/i);
  });

  it("reports no gaps when all required artifacts are present", async () => {
    // Create all required artifacts
    writeFileSync(
      join(tempDir, "CLAUDE.md"),
      [
        "# CLAUDE.md",
        "## Tool Sequencing",
        "| Task | Sequence |",
        "## Corrections Log",
        "| Date | Entry |",
        "## Prohibited Operations",
        "See operation-classification.md for Tier 0–3 classification.",
        "## Session Loop Invariant",
        "1. Read CLAUDE.md",
        "## Reading Map",
        ".claude/index.md → CNT routing",
      ].join("\n"),
    );
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "PRD.md"), "# PRD");
    writeFileSync(
      join(docsDir, "use-cases.md"),
      "# Use Cases\n### Bound Prompt",
    );
    writeFileSync(join(docsDir, "operation-classification.md"), "# Tiers");
    writeFileSync(join(docsDir, "architecture.md"), "# Architecture");
    writeFileSync(join(docsDir, "status.md"), "# Status");

    const agentsDir = join(tempDir, ".claude", "agents");
    mkdirSync(agentsDir, { recursive: true });
    for (const agent of [
      "test-hunter.md",
      "spec-guardian.md",
      "security-reviewer.md",
      "change-reviewer.md",
    ]) {
      writeFileSync(join(agentsDir, agent), `# ${agent}`);
    }

    const hooksDir = join(tempDir, ".claude", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    for (const hook of [
      "pre-commit-coverage.sh",
      "pre-commit-tdd-check.sh",
      "pre-tool-use.sh",
      "post-edit.sh",
      "prompt-guard.sh",
    ]) {
      writeFileSync(join(hooksDir, hook), "#!/bin/bash\nexit 0");
    }

    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    const text = result.content[0]!.text;
    // Local artifact gaps should be cleared; only remote-gate gaps may remain
    expect(text).not.toMatch(/Sentinel.*Missing/);
    expect(text).not.toMatch(/Required Documentation/);
    expect(text).not.toMatch(/Sub-Agent Definitions/);
    expect(text).not.toMatch(/Hook Scripts/);
    // Either no gaps at all OR only remote-gate category
    if (text.match(/Gap.*Found/)) {
      expect(text).not.toMatch(/sentinel|docs|agents|hooks/i.source);
    }
  });

  it("does not submit issues when submit_issues=false", async () => {
    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    const text = result.content[0]!.text;
    // Should not mention GitHub issues created
    expect(text).not.toMatch(/GitHub Issues Created/);
  });

  it("reads tags from inline YAML array in forgecraft.yaml", async () => {
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      `tags: [UNIVERSAL, API]\nproject:\n  name: test-project\n`,
    );
    const result = await analyzeHarnessHandler({
      project_dir: tempDir,
      submit_issues: false,
    });
    const text = result.content[0]!.text;
    expect(text).toMatch(/UNIVERSAL.*API|API.*UNIVERSAL/);
  });
});
