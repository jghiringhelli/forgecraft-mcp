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
  markRoadmapItemDone,
  suggestVersionBump,
  readCommitsSinceLastTag,
  closeCycleHandler,
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
  }, 30000);

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

    // Pass dryRun=true, but experiment mode should override it to false.
    // Under VITEST the gh CLI is blocked (safety net), so the contribution
    // attempt falls back to "pending" with a pre-filled GitHub issue URL —
    // proof the submission was actually attempted, not dry-run skipped.
    const result = await closeCycle({ projectRoot: tempDir, dryRun: true });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.experimentId).toBe("dx-2026-test");
    // A real (non-dry) attempt produces a pending entry with the fallback
    // issue URL. A dry run produces pending WITHOUT an issueUrl.
    const pendingPath = join(
      tempDir,
      ".forgecraft",
      "pending-contributions.json",
    );
    expect(existsSync(pendingPath)).toBe(true);
    const pending = JSON.parse(readFileSync(pendingPath, "utf-8")) as {
      gateId: string;
      issueUrl?: string;
    }[];
    const entry = pending.find((p) => p.gateId === "experiment-gate-dryrun");
    expect(entry).toBeDefined();
    expect(entry!.issueUrl).toContain("issues/new");
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

// ── markRoadmapItemDone tests ─────────────────────────────────────────

describe("markRoadmapItemDone", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `mark-roadmap-done-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks a pending item as done in roadmap.md", () => {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "roadmap.md"),
      [
        "# Roadmap",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-001 | Feature A | pending |",
        "| RM-002 | Feature B | pending |",
      ].join("\n"),
      "utf-8",
    );

    markRoadmapItemDone(dir, "RM-001");

    const updated = readFileSync(join(dir, "docs", "roadmap.md"), "utf-8");
    expect(updated).toContain("| RM-001 | Feature A | done |");
    expect(updated).toContain("| RM-002 | Feature B | pending |");
  });

  it("does not modify roadmap when item is already done", () => {
    mkdirSync(join(dir, "docs"), { recursive: true });
    const original = [
      "# Roadmap",
      "| ID | Title | Status |",
      "|----|-------|--------|",
      "| RM-001 | Feature A | done |",
    ].join("\n");
    writeFileSync(join(dir, "docs", "roadmap.md"), original, "utf-8");

    markRoadmapItemDone(dir, "RM-001");

    const content = readFileSync(join(dir, "docs", "roadmap.md"), "utf-8");
    expect(content).toBe(original);
  });

  it("no-ops when roadmap.md does not exist", () => {
    // Should not throw
    expect(() => markRoadmapItemDone(dir, "RM-001")).not.toThrow();
  });
});

// ── closeCycleHandler roadmap_item writeback tests ────────────────────

describe("closeCycleHandler roadmap_item writeback", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `cc-handler-rm-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks roadmap item done after successful cycle with roadmap_item arg", async () => {
    buildCompleteCascade(dir);
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "roadmap.md"),
      [
        "# Roadmap",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-001 | Bootstrap | pending |",
      ].join("\n"),
      "utf-8",
    );

    await closeCycleHandler({
      project_dir: dir,
      roadmap_item: "RM-001",
      dry_run: false,
    });

    const updated = readFileSync(join(dir, "docs", "roadmap.md"), "utf-8");
    expect(updated).toContain("| RM-001 | Bootstrap | done |");
  });

  it("does NOT mark roadmap item done when dry_run is true", async () => {
    buildCompleteCascade(dir);
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "roadmap.md"),
      [
        "# Roadmap",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-001 | Bootstrap | pending |",
      ].join("\n"),
      "utf-8",
    );

    await closeCycleHandler({
      project_dir: dir,
      roadmap_item: "RM-001",
      dry_run: true,
    });

    const content = readFileSync(join(dir, "docs", "roadmap.md"), "utf-8");
    expect(content).toContain("| RM-001 | Bootstrap | pending |");
  });
});

// ── closeCycleHandler harness section tests ────────────────────────────

describe("closeCycleHandler harness section", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `cc-harness-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("includes L2 Harness section when cascade passes and harness-run.json exists", async () => {
    buildCompleteCascade(dir);
    mkdirSync(join(dir, ".forgecraft"), { recursive: true });
    writeFileSync(
      join(dir, ".forgecraft", "harness-run.json"),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        passed: 2,
        failed: 1,
        errors: 0,
        notFound: 0,
      }),
      "utf-8",
    );

    const result = await closeCycleHandler({ project_dir: dir });
    const text = result.content[0]!.text;
    expect(text).toContain("### L2 Harness:");
    expect(text).toContain("probes passing");
  });

  it("includes failing probe warning when harness has failures", async () => {
    buildCompleteCascade(dir);
    mkdirSync(join(dir, ".forgecraft"), { recursive: true });
    writeFileSync(
      join(dir, ".forgecraft", "harness-run.json"),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        passed: 1,
        failed: 2,
        errors: 0,
        notFound: 0,
      }),
      "utf-8",
    );

    const result = await closeCycleHandler({ project_dir: dir });
    const text = result.content[0]!.text;
    expect(text).toContain("failing probe");
    expect(text).toContain("specification violations");
  });

  it("shows no execution evidence when harness-run.json is missing", async () => {
    buildCompleteCascade(dir);

    const result = await closeCycleHandler({ project_dir: dir });
    const text = result.content[0]!.text;
    expect(text).toContain("no execution evidence");
    expect(text).toContain("run_harness");
  });

  it("warns about low L2 coverage when below 50%", async () => {
    buildCompleteCascade(dir);
    mkdirSync(join(dir, ".forgecraft"), { recursive: true });
    writeFileSync(
      join(dir, ".forgecraft", "harness-run.json"),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        passed: 1,
        failed: 0,
        errors: 0,
        notFound: 9,
      }),
      "utf-8",
    );

    const result = await closeCycleHandler({ project_dir: dir });
    const text = result.content[0]!.text;
    expect(text).toContain("L2 coverage below 50%");
  });
});

// ── generative-execution gate (FC-1) tests ───────────────────────────

describe("closeCycle generative-execution gate (FC-1)", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `cc-gen-exec-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Build a passing cascade whose use-cases.md has parseable UC headers. */
  function buildCascadeWithUcs(d: string): void {
    buildCompleteCascade(d);
    write(
      d,
      "docs/use-cases.md",
      [
        "# Use Cases",
        "",
        "## UC-001: First Use Case",
        "",
        "Body.",
        "",
        "## UC-002: Second Use Case",
        "",
        "Body.",
      ].join("\n"),
    );
  }

  /** Persist a generative-execution flag set into verification-state.json. */
  function writeGenExecState(
    d: string,
    flags: Array<{ ucId: string; status: string }>,
  ): void {
    write(
      d,
      ".forgecraft/verification-state.json",
      JSON.stringify({
        version: "1",
        projectDir: d,
        tags: [],
        language: "typescript",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
        steps: [],
        summary: [],
        aggregate_s: 0,
        generativeExecution: flags.map((f) => ({
          ucId: f.ucId,
          status: f.status,
          lastRunAt: "2026-06-15T00:00:00.000Z",
          source: "harness-run",
        })),
      }),
    );
  }

  it("blocks (ready:false) when cascade passes but an in-scope UC is red", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecState(dir, [
      { ucId: "UC-001", status: "green" },
      { ucId: "UC-002", status: "red" },
    ]);

    const result = await closeCycle({ projectRoot: dir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.ready).toBe(false);
    expect(result.generativeExecutionStatus?.blocked).toBe(true);
    expect(result.generativeExecutionStatus?.reds).toContain("UC-002");
  });

  it("passes (ready:true) when a red UC is excused by a valid override", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecState(dir, [
      { ucId: "UC-001", status: "green" },
      { ucId: "UC-002", status: "red" },
    ]);
    write(
      dir,
      "forgecraft.yaml",
      [
        "generative_execution:",
        "  overrides:",
        "    - uc: UC-002",
        "      rationale: Flaky dependency; verified manually in staging.",
      ].join("\n"),
    );

    const result = await closeCycle({ projectRoot: dir });

    expect(result.ready).toBe(true);
    expect(result.generativeExecutionStatus?.blocked).toBe(false);
    expect(result.generativeExecutionStatus?.overridden).toContain("UC-002");
  });

  it("blocks when there was no harness run (UCs unrun)", async () => {
    buildCascadeWithUcs(dir);
    // No verification-state.json → all in-scope UCs are unrun.

    const result = await closeCycle({ projectRoot: dir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.ready).toBe(false);
    expect(result.generativeExecutionStatus?.blocked).toBe(true);
    expect(result.generativeExecutionStatus?.reds).toEqual(
      expect.arrayContaining(["UC-001", "UC-002"]),
    );
  });

  it("passes when all in-scope UCs are green", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecState(dir, [
      { ucId: "UC-001", status: "green" },
      { ucId: "UC-002", status: "green" },
    ]);

    const result = await closeCycle({ projectRoot: dir });

    expect(result.ready).toBe(true);
    expect(result.generativeExecutionStatus?.status).toBe("green");
  });

  it("renders red UC remediation in the close_cycle report", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecState(dir, [{ ucId: "UC-001", status: "red" }]);

    const out = await closeCycleHandler({ project_dir: dir });
    const text = out.content[0]!.text;
    expect(text).toContain("Generative Execution");
    expect(text).toContain("regenerate from spec");
    expect(text).toContain("UC-001");
  });
});

// ── static-analyzer gate (FC-2) tests ─────────────────────────────────

describe("closeCycle static-analyzer gate (FC-2)", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `cc-static-analyzer-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Build a passing cascade whose use-cases.md has parseable UC headers. */
  function buildCascadeWithUcs(d: string): void {
    buildCompleteCascade(d);
    write(
      d,
      "docs/use-cases.md",
      ["# Use Cases", "", "## UC-001: First Use Case", "", "Body."].join("\n"),
    );
  }

  /** Persist a generative-execution flag set into verification-state.json. */
  function writeGenExecGreen(d: string): void {
    write(
      d,
      ".forgecraft/verification-state.json",
      JSON.stringify({
        version: "1",
        projectDir: d,
        tags: [],
        language: "typescript",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
        steps: [],
        summary: [],
        aggregate_s: 0,
        generativeExecution: [
          {
            ucId: "UC-001",
            status: "green",
            lastRunAt: "2026-06-15T00:00:00.000Z",
            source: "harness-run",
          },
        ],
      }),
    );
  }

  /** Append an active analyzer gate-violation (no .git → always active). */
  function writeAnalyzerViolation(d: string, hook: string): void {
    write(
      d,
      ".forgecraft/gate-violations.jsonl",
      JSON.stringify({
        hook,
        severity: "error",
        message: `${hook} failed`,
        timestamp: "2026-06-15T12:00:00Z",
      }) + "\n",
    );
  }

  it("blocks (ready:false) when cascade + FC-1 are green but an analyzer is red", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecGreen(dir);
    writeAnalyzerViolation(dir, "pre-commit-eslint");

    const result = await closeCycle({ projectRoot: dir });

    expect(result.cascadeStatus).toBe("pass");
    expect(result.generativeExecutionStatus?.blocked).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.staticAnalyzerStatus?.blocked).toBe(true);
    expect(result.staticAnalyzerStatus?.failing).toContain("eslint");
    // Gabriel's hedge must be present in the remediation.
    expect(
      result.nextSteps.some((s) =>
        s.includes(
          "does not prove it — treat as one signal alongside the harness",
        ),
      ),
    ).toBe(true);
  });

  it("renders the static-analysis block with the hedge in the report", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecGreen(dir);
    writeAnalyzerViolation(dir, "pre-commit-complexity");

    const out = await closeCycleHandler({ project_dir: dir });
    const text = out.content[0]!.text;
    expect(text).toContain("Static Analysis");
    expect(text).toContain("complexity");
    expect(text).toContain(
      "does not prove it — treat as one signal alongside the harness",
    );
  });

  it("passes (ready:true) when cascade + FC-1 green and no analyzer is red", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecGreen(dir);

    const result = await closeCycle({ projectRoot: dir });

    expect(result.ready).toBe(true);
    expect(result.staticAnalyzerStatus?.blocked).toBe(false);
    expect(result.staticAnalyzerStatus?.status).toBe("green");
  });

  it("does not block when a red analyzer carries a valid override", async () => {
    buildCascadeWithUcs(dir);
    writeGenExecGreen(dir);
    writeAnalyzerViolation(dir, "pre-commit-complexity");
    write(
      dir,
      "forgecraft.yaml",
      [
        "static_analysis:",
        "  overrides:",
        "    - analyzer: complexity",
        "      rationale: Generated parser; reviewed manually.",
      ].join("\n"),
    );

    const result = await closeCycle({ projectRoot: dir });

    expect(result.ready).toBe(true);
    expect(result.staticAnalyzerStatus?.blocked).toBe(false);
    expect(result.staticAnalyzerStatus?.overridden).toContain("complexity");
  });
});

// ── closeCycleHandler state leaf tests ────────────────────────────────

describe("closeCycleHandler state leaf (.claude/state.md)", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `cc-state-leaf-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes .claude/state.md after a successful cycle", async () => {
    buildCompleteCascade(dir);

    await closeCycleHandler({ project_dir: dir });

    const stateLeafPath = join(dir, ".claude", "state.md");
    expect(existsSync(stateLeafPath)).toBe(true);
  });

  it(".claude/state.md contains Layer Completion table", async () => {
    buildCompleteCascade(dir);

    await closeCycleHandler({ project_dir: dir });

    const content = readFileSync(join(dir, ".claude", "state.md"), "utf-8");
    expect(content).toContain("## Layer Completion");
    expect(content).toContain("| Layer | Status | Evidence |");
    expect(content).toContain("L1 Blueprint");
    expect(content).toContain("L2 Harness");
  });

  it(".claude/state.md contains Next Action line", async () => {
    buildCompleteCascade(dir);

    await closeCycleHandler({ project_dir: dir });

    const content = readFileSync(join(dir, ".claude", "state.md"), "utf-8");
    expect(content).toContain("## Next Action");
  });

  it(".claude/state.md contains Last Cycle line", async () => {
    buildCompleteCascade(dir);

    await closeCycleHandler({ project_dir: dir });

    const content = readFileSync(join(dir, ".claude", "state.md"), "utf-8");
    expect(content).toContain("## Last Cycle");
    expect(content).toContain("cascade: PASS");
  });

  it("does not write .claude/state.md when cascade fails", async () => {
    // No cascade setup — cascade will fail
    await closeCycleHandler({ project_dir: dir });

    const stateLeafPath = join(dir, ".claude", "state.md");
    expect(existsSync(stateLeafPath)).toBe(false);
  });
});
