/**
 * Tests for src/tools/layer-status.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseUseCases,
  buildLayerReport,
  buildL1Status,
  buildL2Status,
  buildL3Status,
  buildL4Status,
  formatLayerReport,
  layerStatusHandler,
} from "../../src/tools/layer-status.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `layer-status-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

const MINIMAL_USE_CASES = `# Use Cases

## UC-001: Setup Project

**Actor**: Developer
**Trigger**: \`setup_project\`
**Acceptance Criteria**:
  - [ ] forgecraft.yaml exists

---

## UC-002: Verify Cascade

**Actor**: Developer
**Trigger**: \`check_cascade\`
**Acceptance Criteria**:
  - [ ] Output contains steps
`;

const UC_001_PROBE = `uc: UC-001
title: Setup Project
action: setup_project
probes:
  - id: probe-setup-scaffold
    type: mcp_call
    description: Assert scaffold artifacts are created
    inputs:
      action: setup_project
    assertions:
      - type: file_exists
        path: forgecraft.yaml
  - id: probe-setup-file
    type: file_system
    description: Verify CLAUDE.md exists
    inputs:
      path: CLAUDE.md
    assertions:
      - type: file_exists
        path: CLAUDE.md
`;

// ── parseUseCases ──────────────────────────────────────────────────────

describe("parseUseCases", () => {
  it("extracts UC records from markdown content", () => {
    const ucs = parseUseCases(MINIMAL_USE_CASES);
    expect(ucs).toHaveLength(2);
    expect(ucs[0]!.id).toBe("UC-001");
    expect(ucs[0]!.title).toBe("Setup Project");
    expect(ucs[1]!.id).toBe("UC-002");
    expect(ucs[1]!.title).toBe("Verify Cascade");
  });

  it("returns empty array for content with no UC headers", () => {
    const ucs = parseUseCases("# Use Cases\n\nNo formal UCs here.");
    expect(ucs).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseUseCases("")).toHaveLength(0);
  });
});

// ── buildL2Status ──────────────────────────────────────────────────────

describe("buildL2Status", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("marks probe as present when .forgecraft/harness/uc-001.yaml exists", () => {
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const ucs = [{ id: "UC-001", title: "Setup Project" }];
    const l2 = buildL2Status(tempDir, ucs);
    expect(l2[0]!.hasProbe).toBe(true);
  });

  it("marks probe as missing when harness file is absent", () => {
    const ucs = [{ id: "UC-002", title: "Verify Cascade" }];
    const l2 = buildL2Status(tempDir, ucs);
    expect(l2[0]!.hasProbe).toBe(false);
    expect(l2[0]!.probeTypes).toHaveLength(0);
  });

  it("extracts probe types from yaml file", () => {
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const ucs = [{ id: "UC-001", title: "Setup Project" }];
    const l2 = buildL2Status(tempDir, ucs);
    expect(l2[0]!.probeTypes).toContain("mcp_call");
    expect(l2[0]!.probeTypes).toContain("file_system");
  });

  it("returns empty probe types for missing file", () => {
    const ucs = [{ id: "UC-001", title: "Setup Project" }];
    const l2 = buildL2Status(tempDir, ucs);
    expect(l2[0]!.probeTypes).toHaveLength(0);
  });

  it("handles multiple UCs with mixed probe presence", () => {
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const ucs = [
      { id: "UC-001", title: "Setup Project" },
      { id: "UC-002", title: "Verify Cascade" },
    ];
    const l2 = buildL2Status(tempDir, ucs);
    expect(l2[0]!.hasProbe).toBe(true);
    expect(l2[1]!.hasProbe).toBe(false);
  });
});

// ── buildL1Status ──────────────────────────────────────────────────────

describe("buildL1Status", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("marks all UCs as documented (L1 = UC exists)", () => {
    const ucs = [
      { id: "UC-001", title: "Setup" },
      { id: "UC-002", title: "Verify" },
    ];
    const l1 = buildL1Status(tempDir, ucs);
    expect(l1).toHaveLength(2);
    expect(l1[0]!.documented).toBe(true);
    expect(l1[1]!.documented).toBe(true);
  });

  it("returns testsFound false when no test files reference the UC id", () => {
    const ucs = [{ id: "UC-099", title: "Nonexistent" }];
    const l1 = buildL1Status(tempDir, ucs);
    expect(l1[0]!.testsFound).toBe(false);
  });
});

// ── buildL3Status ──────────────────────────────────────────────────────

describe("buildL3Status", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns not-started when no infra files exist", () => {
    const { status } = buildL3Status(tempDir);
    expect(status).toBe("not-started");
  });

  it("returns partial when some infra files exist", () => {
    write(
      tempDir,
      "package.json",
      JSON.stringify({ scripts: { test: "vitest" } }),
    );
    const { status } = buildL3Status(tempDir);
    expect(status).toBe("partial");
  });

  it("returns complete when all infra checks pass", () => {
    write(tempDir, ".github/workflows/ci.yml", "name: CI");
    write(
      tempDir,
      "package.json",
      JSON.stringify({ scripts: { test: "vitest" } }),
    );
    write(tempDir, ".env.example", "API_KEY=");
    write(tempDir, "Dockerfile", "FROM node:20");
    const { status } = buildL3Status(tempDir);
    expect(status).toBe("complete");
  });

  it("includes check labels in the checks record", () => {
    const { checks } = buildL3Status(tempDir);
    expect(Object.keys(checks)).toContain("CI config");
    expect(Object.keys(checks)).toContain("Test command");
    expect(Object.keys(checks)).toContain("Env schema");
    expect(Object.keys(checks)).toContain("Deployment config");
  });
});

// ── buildL4Status ──────────────────────────────────────────────────────

describe("buildL4Status", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns not-started when no monitoring artifacts exist", () => {
    const { status } = buildL4Status(tempDir);
    expect(status).toBe("not-started");
  });

  it("detects health probes directory", () => {
    mkdirSync(join(tempDir, ".forgecraft", "health"), { recursive: true });
    const { checks } = buildL4Status(tempDir);
    expect(checks["Health probes"]).toBe(true);
  });

  it("detects drift detection directory", () => {
    mkdirSync(join(tempDir, ".forgecraft", "monitoring"), { recursive: true });
    const { checks } = buildL4Status(tempDir);
    expect(checks["Drift detection"]).toBe(true);
  });
});

// ── buildLayerReport ───────────────────────────────────────────────────

describe("buildLayerReport", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty ucs when docs/use-cases.md is absent", () => {
    const report = buildLayerReport(tempDir);
    expect(report.ucs).toHaveLength(0);
  });

  it("parses UCs from docs/use-cases.md when present", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    expect(report.ucs).toHaveLength(2);
  });

  it("detects L2 probe when .forgecraft/harness/uc-001.yaml exists", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const report = buildLayerReport(tempDir);
    const uc001 = report.l2.find((u) => u.id === "UC-001");
    expect(uc001?.hasProbe).toBe(true);
  });

  it("marks L2 probe as missing when harness file is absent", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const uc002 = report.l2.find((u) => u.id === "UC-002");
    expect(uc002?.hasProbe).toBe(false);
  });

  it("includes L3 and L4 statuses", () => {
    const report = buildLayerReport(tempDir);
    expect(["not-started", "partial", "complete"]).toContain(report.l3);
    expect(["not-started", "partial", "complete"]).toContain(report.l4);
  });

  it("includes generatedAt timestamp", () => {
    const report = buildLayerReport(tempDir);
    expect(report.generatedAt).toBeTruthy();
    expect(() => new Date(report.generatedAt)).not.toThrow();
  });

  it("does not throw when docs/use-cases.md is empty", () => {
    write(tempDir, "docs/use-cases.md", "");
    expect(() => buildLayerReport(tempDir)).not.toThrow();
  });
});

// ── formatLayerReport ──────────────────────────────────────────────────

describe("formatLayerReport", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes Layer Status header", () => {
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("## Layer Status");
  });

  it("shows no use cases message when docs/use-cases.md is absent", () => {
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("No use cases found");
  });

  it("includes L1 section with UC table when UCs are present", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("### L1: Blueprint");
    expect(text).toContain("UC-001");
    expect(text).toContain("UC-002");
  });

  it("includes L2 section showing probe presence", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("### L2: Behavioral Harness");
    // UC-001 has a harness spec; UC-002 does not
    expect(text).toContain("1/2 use cases have harness specs");
    expect(text).toContain("❌ missing");
  });

  it("includes L2 coverage percentage", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("L2 coverage:");
    expect(text).toContain("50%");
  });

  it("includes L3 and L4 sections", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("### L3: Environment");
    expect(text).toContain("### L4: Self-Monitoring");
  });

  it("includes Summary table", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("### Summary");
    expect(text).toContain("L1 Blueprint");
    expect(text).toContain("L2 Harness");
  });

  it("includes Next action line", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("**Next action**:");
  });
});

// ── layerStatusHandler ─────────────────────────────────────────────────

describe("layerStatusHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a ToolResult with text content", async () => {
    const result = await layerStatusHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("returns layer report when docs/use-cases.md exists", async () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const result = await layerStatusHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("UC-001");
    expect(result.content[0]!.text).toContain("UC-002");
  });

  it("detects L2 probe when .forgecraft/harness/uc-001.yaml exists", async () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const result = await layerStatusHandler({ project_dir: tempDir });
    // 1/2 UCs have harness specs — confirms UC-001 probe is detected
    expect(result.content[0]!.text).toContain(
      "1/2 use cases have harness specs",
    );
  });

  it("shows missing probe for uc-002 when harness file absent", async () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE);
    const result = await layerStatusHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("❌ missing");
  });

  it("gracefully handles missing docs/use-cases.md", async () => {
    const result = await layerStatusHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("No use cases found");
  });

  it("uses the fixture project for integration verification", async () => {
    const fixtureDir = join(
      process.cwd(),
      "tests",
      "fixtures",
      "layer-test-project",
    );
    const result = await layerStatusHandler({ project_dir: fixtureDir });
    const text = result.content[0]!.text;
    // Fixture has 2 UCs, uc-001.yaml probe, no uc-002.yaml
    expect(text).toContain("UC-001");
    expect(text).toContain("UC-002");
    // L2 coverage shows 1/2 UCs have probes
    expect(text).toContain("1/2 use cases have harness specs");
    expect(text).toContain("❌ missing");
  });
});

// ── L2 happy/error breakdown ───────────────────────────────────────────

describe("formatLayerReport L2 happy/error breakdown", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("shows Happy and Error Paths columns in L2 table", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("Happy");
    expect(text).toContain("Error Paths");
  });

  it("shows happy probe as present when uc-NNN-happy.sh exists", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-happy.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    const report = buildLayerReport(tempDir);
    const uc001 = report.l2.find((u) => u.id === "UC-001");
    expect(uc001?.hasHappyProbe).toBe(true);
  });

  it("shows happy probe as missing when no happy file exists", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const uc001 = report.l2.find((u) => u.id === "UC-001");
    expect(uc001?.hasHappyProbe).toBe(false);
  });

  it("counts error probe files for a UC", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-error-auth.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    write(
      tempDir,
      "tests/harness/uc-001-error-input.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    const report = buildLayerReport(tempDir);
    const uc001 = report.l2.find((u) => u.id === "UC-001");
    expect(uc001?.errorProbeCount).toBe(2);
  });

  it("shows 0 error probes when no error files exist", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const uc001 = report.l2.find((u) => u.id === "UC-001");
    expect(uc001?.errorProbeCount).toBe(0);
  });

  it("reads last run status from harness-run.json", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      ".forgecraft/harness-run.json",
      JSON.stringify({
        timestamp: "2026-04-16T00:00:00.000Z",
        passed: 1,
        failed: 1,
        errors: 0,
        notFound: 0,
        results: [
          { ucId: "UC-001", status: "pass", durationMs: 100 },
          { ucId: "UC-002", status: "fail", durationMs: 200 },
        ],
      }),
    );
    const report = buildLayerReport(tempDir);
    const uc001 = report.l2.find((u) => u.id === "UC-001");
    const uc002 = report.l2.find((u) => u.id === "UC-002");
    expect(uc001?.lastRunStatus).toBe("pass");
    expect(uc002?.lastRunStatus).toBe("fail");
  });

  it("shows last run status in formatted output", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      ".forgecraft/harness-run.json",
      JSON.stringify({
        timestamp: "2026-04-16T00:00:00.000Z",
        passed: 1,
        failed: 1,
        errors: 0,
        notFound: 0,
        results: [
          { ucId: "UC-001", status: "pass", durationMs: 100 },
          { ucId: "UC-002", status: "fail", durationMs: 200 },
        ],
      }),
    );
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("✅ pass");
    expect(text).toContain("❌ fail");
  });

  it("shows Last Run column in L2 table header", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("Last Run");
  });

  it("includes Scenario coverage summary line", () => {
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("Scenario coverage");
    expect(text).toContain("happy paths");
    expect(text).toContain("error paths");
  });
});

// ── env-probe-run.json evidence in L3 ─────────────────────────────────

describe("buildL3Status — env-probe-run.json evidence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns complete when env-probe-run.json has all passing and no failures", () => {
    write(
      tempDir,
      ".forgecraft/env-probe-run.json",
      JSON.stringify({
        passed: 3,
        failed: 0,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const { status } = buildL3Status(tempDir);
    expect(status).toBe("complete");
  });

  it("returns partial when env-probe-run.json has failures", () => {
    write(
      tempDir,
      ".forgecraft/env-probe-run.json",
      JSON.stringify({
        passed: 2,
        failed: 1,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const { status } = buildL3Status(tempDir);
    expect(status).toBe("partial");
  });

  it("returns envProbeEvidence when env-probe-run.json exists", () => {
    write(
      tempDir,
      ".forgecraft/env-probe-run.json",
      JSON.stringify({
        passed: 2,
        failed: 0,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const { envProbeEvidence } = buildL3Status(tempDir);
    expect(envProbeEvidence).not.toBeNull();
    expect(envProbeEvidence!.passed).toBe(2);
    expect(envProbeEvidence!.failed).toBe(0);
  });

  it("returns null envProbeEvidence when env-probe-run.json is absent", () => {
    const { envProbeEvidence } = buildL3Status(tempDir);
    expect(envProbeEvidence).toBeNull();
  });
});

// ── slo-probe-run.json evidence in L4 ─────────────────────────────────

describe("buildL4Status — slo-probe-run.json evidence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns complete when slo-probe-run.json has all passing and no failures", () => {
    write(
      tempDir,
      ".forgecraft/slo-probe-run.json",
      JSON.stringify({
        passed: 2,
        failed: 0,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const { status } = buildL4Status(tempDir);
    expect(status).toBe("complete");
  });

  it("returns partial when slo-probe-run.json has failures", () => {
    write(
      tempDir,
      ".forgecraft/slo-probe-run.json",
      JSON.stringify({
        passed: 1,
        failed: 1,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const { status } = buildL4Status(tempDir);
    expect(status).toBe("partial");
  });

  it("returns sloProbeEvidence when slo-probe-run.json exists", () => {
    write(
      tempDir,
      ".forgecraft/slo-probe-run.json",
      JSON.stringify({
        passed: 1,
        failed: 0,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const { sloProbeEvidence } = buildL4Status(tempDir);
    expect(sloProbeEvidence).not.toBeNull();
    expect(sloProbeEvidence!.passed).toBe(1);
  });
});

// ── formatLayerReport shows env/slo probe evidence ─────────────────────

describe("formatLayerReport — env/slo probe evidence lines", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("shows env probe evidence line when env-probe-run.json exists with passing probes", () => {
    write(
      tempDir,
      ".forgecraft/env-probe-run.json",
      JSON.stringify({
        passed: 3,
        failed: 0,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("Env probe evidence");
    expect(text).toContain("3 passed");
    expect(text).toContain("0 failed");
    expect(text).toContain("2026-04-17T00:00:00.000Z");
  });

  it("shows not yet run warning when env-probe-run.json is absent", () => {
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("Env probe evidence");
    expect(text).toContain("not yet run");
    expect(text).toContain("run_env_probe");
  });

  it("shows SLO probe evidence line when slo-probe-run.json exists with passing probes", () => {
    write(
      tempDir,
      ".forgecraft/slo-probe-run.json",
      JSON.stringify({
        passed: 2,
        failed: 0,
        timestamp: "2026-04-17T00:00:00.000Z",
      }),
    );
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("SLO probe evidence");
    expect(text).toContain("2 passed");
  });

  it("shows not yet run warning when slo-probe-run.json is absent", () => {
    const report = buildLayerReport(tempDir);
    const text = formatLayerReport(report);
    expect(text).toContain("SLO probe evidence");
    expect(text).toContain("not yet run");
    expect(text).toContain("run_slo_probe");
  });
});
