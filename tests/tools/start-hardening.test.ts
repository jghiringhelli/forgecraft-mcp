/**
 * Tests for src/tools/start-hardening.ts
 *
 * Covers: blocked states, phase generation, file output, deployment URL override,
 * skip_load_test behavior, and project-specific gate inclusion.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
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
  startHardening,
  startHardeningHandler,
} from "../../src/tools/start-hardening.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-test-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

function buildCompletedRoadmap(dir: string): void {
  write(
    dir,
    "docs/roadmap.md",
    [
      "# Roadmap",
      "",
      "## Phase 1",
      "| ID | Title | Status |",
      "|----|-------|--------|",
      "| RM-001 | Feature A | done |",
      "| RM-002 | Feature B | in-progress |",
    ].join("\n"),
  );
}

function buildPendingRoadmap(dir: string): void {
  write(
    dir,
    "docs/roadmap.md",
    [
      "# Roadmap",
      "",
      "## Phase 1",
      "| ID | Title | Status |",
      "|----|-------|--------|",
      "| RM-001 | Feature A | done |",
      "| RM-002 | Feature B | pending |",
    ].join("\n"),
  );
}

function writeActiveGate(dir: string, gate: Record<string, unknown>): void {
  const gateDir = join(dir, ".forgecraft", "gates", "project", "active");
  mkdirSync(gateDir, { recursive: true });
  writeFileSync(
    join(gateDir, `${gate["id"] as string}.yaml`),
    yamlDump(gate),
    "utf-8",
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("startHardening", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("returns blocked when docs/roadmap.md does not exist", () => {
    const dir = makeTempDir();
    dirs.push(dir);

    const result = startHardening({ project_dir: dir });

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toMatch(/No roadmap found/);
    expect(result.phases).toHaveLength(0);
  });

  it("returns blocked when roadmap has pending items", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildPendingRoadmap(dir);

    const result = startHardening({ project_dir: dir });

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toMatch(/pending items/);
    expect(result.phases).toHaveLength(0);
  });

  it("allows hardening when Phase 1 is complete and Phase 2 is pending (future phase)", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    write(
      dir,
      "docs/roadmap.md",
      [
        "# Roadmap",
        "",
        "## Phase 1: MVP",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-001 | Feature A | done |",
        "| RM-002 | Feature B | done |",
        "",
        "## Phase 2: Extensions",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-010 | Feature C | pending |",
        "| RM-011 | Feature D | pending |",
      ].join("\n"),
    );
    write(dir, "forgecraft.yaml", "projectName: Test Project\n");

    const result = startHardening({ project_dir: dir });

    // Phase 1 is done, Phase 2 is future — hardening should be allowed
    expect(result.ready).toBe(true);
  });

  it("blocks hardening when current phase has mixed done and pending items", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    write(
      dir,
      "docs/roadmap.md",
      [
        "# Roadmap",
        "",
        "## Phase 1: MVP",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-001 | Feature A | done |",
        "| RM-002 | Feature B | pending |",
        "",
        "## Phase 2: Extensions",
        "| ID | Title | Status |",
        "|----|-------|--------|",
        "| RM-010 | Feature C | pending |",
      ].join("\n"),
    );
    write(dir, "forgecraft.yaml", "projectName: Test Project\n");

    const result = startHardening({ project_dir: dir });

    // Phase 1 has pending RM-002 — blocked
    expect(result.ready).toBe(false);
    expect(result.blockedReason).toMatch(/RM-002/);
  });

  it("generates 3 phases when roadmap is complete and no project gates exist", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);
    write(dir, "forgecraft.yaml", "projectName: Test Project\n");

    const result = startHardening({ project_dir: dir, skip_load_test: false });

    expect(result.ready).toBe(true);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0]!.id).toBe("HARDEN-001");
    expect(result.phases[1]!.id).toBe("HARDEN-002");
    expect(result.phases[2]!.id).toBe("HARDEN-003");
    expect(result.phases.every((p) => !p.skipped)).toBe(true);
  });

  it("skips HARDEN-003 when skip_load_test is true and no load gates", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);

    const result = startHardening({ project_dir: dir, skip_load_test: true });

    expect(result.ready).toBe(true);
    expect(result.phases).toHaveLength(3);
    const loadPhase = result.phases.find((p) => p.id === "HARDEN-003")!;
    expect(loadPhase.skipped).toBe(true);
  });

  it("writes HARDEN-001.md to docs/session-prompts/", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);
    write(dir, "forgecraft.yaml", "projectName: My App\n");

    const result = startHardening({ project_dir: dir });

    expect(result.ready).toBe(true);
    const promptPath = join(dir, "docs", "session-prompts", "HARDEN-001.md");
    expect(existsSync(promptPath)).toBe(true);
    const content = readFileSync(promptPath, "utf-8");
    expect(content).toContain("Pre-Release Gate");
    expect(content).toContain("My App");
    expect(content).toContain("npm audit");
  });

  it("writes HARDEN-002.md with deployment URL from input", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);

    const result = startHardening({
      project_dir: dir,
      deployment_url: "https://staging.example.com",
    });

    expect(result.ready).toBe(true);
    const promptPath = join(dir, "docs", "session-prompts", "HARDEN-002.md");
    const content = readFileSync(promptPath, "utf-8");
    expect(content).toContain("https://staging.example.com");
  });

  it("reads deployment URL from forgecraft.yaml when not overridden", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);
    const config = {
      projectName: "Configured App",
      deployment: {
        environments: {
          staging: { provider: "railway", url: "https://app.railway.app" },
        },
      },
    };
    write(dir, "forgecraft.yaml", yamlDump(config));

    const result = startHardening({ project_dir: dir });

    expect(result.ready).toBe(true);
    const promptPath = join(dir, "docs", "session-prompts", "HARDEN-002.md");
    const content = readFileSync(promptPath, "utf-8");
    expect(content).toContain("https://app.railway.app");
  });

  it("includes pre-release project-specific gates in HARDEN-001 prompt", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);
    writeActiveGate(dir, {
      id: "check-secrets",
      title: "No hardcoded secrets",
      description: "Verify no secrets are hardcoded",
      domain: "security",
      implementation: "tooled",
      gsProperty: "defended",
      phase: "pre-release",
      hook: "pre-push",
      os: "cross-platform",
      status: "ready",
      source: "project",
      check: "Run trufflehog",
      passCriterion: "Zero secrets found",
      addedAt: "2024-01-01T00:00:00Z",
    });

    const result = startHardening({ project_dir: dir });

    expect(result.ready).toBe(true);
    const phase = result.phases.find((p) => p.id === "HARDEN-001")!;
    expect(phase.gates).toContain("No hardcoded secrets — Zero secrets found");

    const promptPath = join(dir, "docs", "session-prompts", "HARDEN-001.md");
    const content = readFileSync(promptPath, "utf-8");
    expect(content).toContain("No hardcoded secrets");
  });

  it("includes use-case titles in HARDEN-002 smoke test steps", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    buildCompletedRoadmap(dir);
    write(
      dir,
      "docs/use-cases.md",
      "# Use Cases\n## UC-001 User login\n## UC-002 Add item to cart\n",
    );

    startHardening({ project_dir: dir });

    const promptPath = join(dir, "docs", "session-prompts", "HARDEN-002.md");
    const content = readFileSync(promptPath, "utf-8");
    expect(content).toContain("UC-001 User login");
    expect(content).toContain("UC-002 Add item to cart");
  });
});

describe("startHardeningHandler", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("returns error text when project_dir is missing", () => {
    const result = startHardeningHandler({});
    expect(result.content[0]!.text).toContain("Missing required parameter");
  });

  it("returns blocked message when roadmap has pending items", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "roadmap.md"),
      "| RM-001 | Feature | pending |\n",
      "utf-8",
    );

    const result = startHardeningHandler({ project_dir: dir });
    expect(result.content[0]!.text).toContain("Hardening Blocked");
  });

  it("returns success text when roadmap is complete", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "roadmap.md"),
      "| RM-001 | Feature | done |\n",
      "utf-8",
    );

    const result = startHardeningHandler({ project_dir: dir });
    expect(result.content[0]!.text).toContain("Hardening Initiated");
    expect(result.content[0]!.text).toContain("HARDEN-001");
  });
});
