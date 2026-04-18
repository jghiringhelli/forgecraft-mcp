/**
 * Tests for src/tools/forgecraft-dispatch-extended.ts
 *
 * Verifies that the new L3/L4 probe actions (generate_env_probe, run_env_probe,
 * generate_slo_probe, run_slo_probe) are routed to their respective handlers
 * and do NOT return the "unknown action" fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helpers ────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-dispatch-ext-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Mock probe handlers ────────────────────────────────────────────────
// We mock the dynamically-imported tool modules so tests don't depend on
// the parallel-agent tool files existing on disk.

const mockResult = (label: string) => ({
  content: [{ type: "text" as const, text: `mock: ${label}` }],
});

vi.mock("../../src/tools/generate-env-probe.js", () => ({
  generateEnvProbeHandler: vi.fn(async () => mockResult("generateEnvProbe")),
  generateEnvProbeSchema: {},
}));

vi.mock("../../src/tools/run-env-probe.js", () => ({
  runEnvProbeHandler: vi.fn(async () => mockResult("runEnvProbe")),
  runEnvProbeSchema: {},
}));

vi.mock("../../src/tools/generate-slo-probe.js", () => ({
  generateSloProbeHandler: vi.fn(async () => mockResult("generateSloProbe")),
  generateSloProbeSchema: {},
}));

vi.mock("../../src/tools/run-slo-probe.js", () => ({
  runSloProbeHandler: vi.fn(async () => mockResult("runSloProbe")),
  runSloProbeSchema: {},
}));

// ── Tests ──────────────────────────────────────────────────────────────

describe("dispatchExtendedAction — new L3/L4 probe routes", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("dispatches generate_env_probe action to generateEnvProbeHandler", async () => {
    const { dispatchExtendedAction } =
      await import("../../src/tools/forgecraft-dispatch-extended.js");
    const result = await dispatchExtendedAction("generate_env_probe", {
      action: "generate_env_probe",
      project_dir: tempDir,
    } as never);
    expect(result.content[0]!.text).toBe("mock: generateEnvProbe");
  });

  it("dispatches run_env_probe action to runEnvProbeHandler", async () => {
    const { dispatchExtendedAction } =
      await import("../../src/tools/forgecraft-dispatch-extended.js");
    const result = await dispatchExtendedAction("run_env_probe", {
      action: "run_env_probe",
      project_dir: tempDir,
    } as never);
    expect(result.content[0]!.text).toBe("mock: runEnvProbe");
  });

  it("dispatches generate_slo_probe action to generateSloProbeHandler", async () => {
    const { dispatchExtendedAction } =
      await import("../../src/tools/forgecraft-dispatch-extended.js");
    const result = await dispatchExtendedAction("generate_slo_probe", {
      action: "generate_slo_probe",
      project_dir: tempDir,
    } as never);
    expect(result.content[0]!.text).toBe("mock: generateSloProbe");
  });

  it("dispatches run_slo_probe action to runSloProbeHandler", async () => {
    const { dispatchExtendedAction } =
      await import("../../src/tools/forgecraft-dispatch-extended.js");
    const result = await dispatchExtendedAction("run_slo_probe", {
      action: "run_slo_probe",
      project_dir: tempDir,
    } as never);
    expect(result.content[0]!.text).toBe("mock: runSloProbe");
  });

  it("still returns unknownActionResult for unrecognized actions", async () => {
    const { dispatchExtendedAction } =
      await import("../../src/tools/forgecraft-dispatch-extended.js");
    const result = await dispatchExtendedAction("not_a_real_action", {
      action: "not_a_real_action" as never,
      project_dir: tempDir,
    } as never);
    expect(result.content[0]!.text).toContain("not_a_real_action");
  });
});
