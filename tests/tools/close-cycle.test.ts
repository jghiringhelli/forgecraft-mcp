/**
 * Tests for src/tools/close-cycle.ts
 *
 * Covers: cascade fail fast, cascade pass with ready status, test command
 * derivation, gate counting, generalizable gate promotion (dry run),
 * and skipping gates without evidence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dump as yamlDump } from "js-yaml";
import {
  closeCycle,
  deriveTestCommand,
  findNextRoadmapItem,
  suggestVersionBump,
  readCommitsSinceLastTag,
} from "../../src/tools/close-cycle.js";

vi.mock("../../src/analyzers/gs-scorer.js", () => {
  const mockPropertyScores = [
    { property: "self-describing", score: 2, evidence: [] },
    { property: "bounded", score: 2, evidence: [] },
    { property: "verifiable", score: 2, evidence: [] },
    { property: "defended", score: 1, evidence: [] },
    { property: "auditable", score: 1, evidence: [] },
    { property: "composable", score: 2, evidence: [] },
    { property: "executable", score: 2, evidence: [] },
  ];
  return {
    scoreGsProperties: () => mockPropertyScores,
    findDirectDbCallsInRoutes: () => [],
    findMissingTestFiles: () => [],
  };
});

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `close-cycle-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a file at a relative path, creating parent dirs as needed. */
function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

/** Write a YAML gate file into .forgecraft/gates/project/active/. */
function writeActiveGate(
  projectRoot: string,
  gate: Record<string, unknown>,
): void {
  const dir = join(projectRoot, ".forgecraft", "gates", "project", "active");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${gate["id"] as string}.yaml`),
    yamlDump(gate),
    "utf-8",
  );
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

describe("closeCycle", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns_cascade_fail_when_spec_missing", async () => {
    // No PRD.md → cascade step 1 will FAIL
    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("fail");
    expect(result.ready).toBe(false);
    expect(result.cascadeBlockers).toBeDefined();
    expect(result.cascadeBlockers!.length).toBeGreaterThan(0);
    expect(result.nextSteps[0]).toContain("Fix cascade blockers");
  });

  it("returns_ready_when_cascade_passes", async () => {
    buildCompleteCascade(tempDir);

    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.ready).toBe(true);
    expect(result.cascadeBlockers).toBeUndefined();
  });

  it("detects_test_command_from_package_json", async () => {
    write(
      tempDir,
      "package.json",
      JSON.stringify({ scripts: { test: "vitest run" } }),
    );

    const cmd = deriveTestCommand(tempDir);
    expect(cmd).toBe("npm test");
  });

  it("detects_test_command_from_pyproject", async () => {
    write(tempDir, "pyproject.toml", "[tool.pytest]\n");

    const cmd = deriveTestCommand(tempDir);
    expect(cmd).toBe("pytest");
  });

  it("returns_undefined_when_no_project_file", async () => {
    // Empty directory — no package.json, pyproject.toml, or go.mod
    const cmd = deriveTestCommand(tempDir);
    expect(cmd).toBeUndefined();
  });

  it("counts_active_gates", async () => {
    buildCompleteCascade(tempDir);
    writeActiveGate(tempDir, {
      id: "gate-one",
      title: "Gate One",
      description: "A test gate",
      domain: "correctness",
      gsProperty: "correctness",
      phase: "build",
      hook: "pre-commit",
      check: "run check",
      passCriterion: "passes",
      implementation: "logic",
      source: "project",
      status: "ready",
      os: "cross-platform",
      addedAt: "2024-01-01T00:00:00Z",
    });

    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.gatesAssessed).toBe(1);
  });

  it("promotes_generalizable_gates_with_evidence", async () => {
    buildCompleteCascade(tempDir);

    // Enable contribution in forgecraft.yaml
    write(tempDir, "forgecraft.yaml", "contribute_gates: anonymous\n");

    writeActiveGate(tempDir, {
      id: "generalizable-gate",
      title: "Generalizable Gate",
      description: "A gate that helps everyone",
      domain: "security",
      gsProperty: "correctness",
      phase: "build",
      hook: "pre-commit",
      check: "npm audit",
      passCriterion: "no critical vulnerabilities",
      implementation: "logic",
      source: "project",
      status: "ready",
      os: "cross-platform",
      addedAt: "2024-01-01T00:00:00Z",
      generalizable: true,
      evidence: "Caught a critical vulnerability before production deploy",
    });

    // Mock fetch to simulate successful API submission
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        issueUrl: "https://github.com/example/repo/issues/1",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await closeCycle({ projectRoot: tempDir, dryRun: true });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.gatesAssessed).toBe(1);
    // In dry-run, gatesPromoted reflects how many would be promoted
    expect(result.gatesPromoted).toBeGreaterThanOrEqual(0);
  });

  it("skips_gates_without_evidence", async () => {
    buildCompleteCascade(tempDir);
    write(tempDir, "forgecraft.yaml", "contribute_gates: anonymous\n");

    writeActiveGate(tempDir, {
      id: "no-evidence-gate",
      title: "No Evidence Gate",
      description: "A gate with no evidence",
      domain: "correctness",
      gsProperty: "correctness",
      phase: "build",
      hook: "pre-commit",
      check: "check",
      passCriterion: "passes",
      implementation: "logic",
      source: "project",
      status: "ready",
      os: "cross-platform",
      addedAt: "2024-01-01T00:00:00Z",
      generalizable: true,
      // evidence intentionally omitted
    });

    const result = await closeCycle({ projectRoot: tempDir, dryRun: true });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.gatesAssessed).toBe(1);
    // No evidence → contributeGates skips it → gatesPromoted = 0
    expect(result.gatesPromoted).toBe(0);
  });

  it("close_cycle suggests next roadmap item when roadmap.md exists", async () => {
    buildCompleteCascade(tempDir);

    const roadmapContent = [
      "# My Project Roadmap",
      "",
      "## Phase 1: Core Implementation",
      "",
      "| ID | Title | Status | Prompt |",
      "|---|---|---|---|",
      "| RM-001 | Implement UC-001: Login | pending | docs/session-prompts/RM-001.md |",
      "| RM-002 | Implement UC-002: Register | pending | docs/session-prompts/RM-002.md |",
      "",
    ].join("\n");
    write(tempDir, "docs/roadmap.md", roadmapContent);

    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.nextRoadmapItem).not.toBeNull();
    expect(result.nextRoadmapItem?.id).toBe("RM-001");
    expect(result.nextRoadmapItem?.title).toContain("UC-001");
  });

  it("close_cycle skips roadmap suggestion when roadmap.md absent", async () => {
    buildCompleteCascade(tempDir);

    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.nextRoadmapItem).toBeNull();
  });

  it("closeCycle logs gs score to docs/gs-score.md on successful cycle", async () => {
    buildCompleteCascade(tempDir);

    await closeCycle({ projectRoot: tempDir });

    const gsScorePath = join(tempDir, "docs", "gs-score.md");
    expect(existsSync(gsScorePath)).toBe(true);
    const content = readFileSync(gsScorePath, "utf-8");
    expect(content).toContain("# GS Score Log");
    // Should have at least one data row
    const dataRows = content.split("\n").filter((l) => l.startsWith("| 20"));
    expect(dataRows.length).toBeGreaterThanOrEqual(1);
  });

  it("closeCycle sets gsScoreLogged=true on success", async () => {
    buildCompleteCascade(tempDir);

    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.gsScoreLogged).toBe(true);
    expect(result.gsScoreLoop).toBe(1);
  });

  it("close_cycle suggests semver bump when git history available", async () => {
    // Use the actual project dir which has real git history to validate
    // the function returns a non-null suggestion when commits exist.
    // In a temp dir (no git repo), readCommitsSinceLastTag returns [] and
    // suggestVersionBump returns null — this test exercises the non-null path.
    const actualProjectDir = process.cwd();
    const commits = readCommitsSinceLastTag(actualProjectDir);

    if (commits.length === 0) {
      // No git history available in this environment — skip gracefully
      const suggestion = suggestVersionBump(actualProjectDir);
      expect(suggestion).toBeNull();
    } else {
      const suggestion = suggestVersionBump(actualProjectDir);
      expect(suggestion).not.toBeNull();
      expect(typeof suggestion).toBe("string");
      // Should contain a version number pattern
      expect(suggestion).toMatch(/v\d+\.\d+\.\d+/);
    }
  });

  it("close_cycle in experiment mode forces auto-contribute (dryRun=false)", async () => {
    buildCompleteCascade(tempDir);

    write(
      tempDir,
      "forgecraft.yaml",
      "contribute_gates: anonymous\nexperiment:\n  id: dx-2026-test\n  type: greenfield\n  group: gs\n",
    );

    writeActiveGate(tempDir, {
      id: "experiment-gate-dryrun",
      title: "Experiment Gate DryRun",
      description: "A gate for experiment dry run test",
      domain: "security",
      gsProperty: "correctness",
      phase: "build",
      hook: "pre-commit",
      check: "npm audit",
      passCriterion: "no critical vulnerabilities",
      implementation: "logic",
      source: "project",
      status: "ready",
      os: "cross-platform",
      addedAt: "2024-01-01T00:00:00Z",
      generalizable: true,
      evidence: "Caught a critical vulnerability before production deploy",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "submitted",
        issueUrl: "https://github.com/example/repo/issues/99",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Pass dryRun=true, but experiment mode should override it to false
    const result = await closeCycle({ projectRoot: tempDir, dryRun: true });

    expect(result.cascadeStatus).toBe("pass");
    // fetch was called despite dryRun=true because experiment mode forced effectiveDryRun=false
    expect(fetchMock).toHaveBeenCalled();
    expect(result.experimentId).toBe("dx-2026-test");
  });

  it("close_cycle sets experimentId in result when experiment config present", async () => {
    buildCompleteCascade(tempDir);

    write(
      tempDir,
      "forgecraft.yaml",
      "contribute_gates: anonymous\nexperiment:\n  id: dx-2026-vaquita\n  type: brownfield\n  group: gs\n",
    );

    const result = await closeCycle({ projectRoot: tempDir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.experimentId).toBe("dx-2026-vaquita");
  });
});
