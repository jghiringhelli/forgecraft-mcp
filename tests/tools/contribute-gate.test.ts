/**
 * Tests for src/tools/contribute-gate.ts
 *
 * Covers: disabled contribute_gates, evidence validation, deduplication,
 * dry-run mode, server failure queuing, and successful submission recording.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dump as yamlDump } from "js-yaml";
import { contributeGates } from "../../src/tools/contribute-gate.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `contribute-gate-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeForgecraftYaml(
  projectRoot: string,
  config: Record<string, unknown>,
): void {
  const lines = Object.entries(config)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  writeFileSync(join(projectRoot, "forgecraft.yaml"), lines + "\n", "utf-8");
}

function writeProjectGates(projectRoot: string, gates: object[]): void {
  const forgecraftDir = join(projectRoot, ".forgecraft");
  mkdirSync(forgecraftDir, { recursive: true });
  writeFileSync(
    join(forgecraftDir, "project-gates.yaml"),
    yamlDump({ version: "1", gates }),
    "utf-8",
  );
}

describe("contributeGates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns empty result when contribute_gates is false (not set)", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "false" });
    writeProjectGates(tempDir, [
      {
        id: "gate-1",
        title: "Gate 1",
        description: "desc",
        category: "security",
        gsProperty: "correctness",
        phase: "build",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    const result = await contributeGates({ projectRoot: tempDir });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips gates with empty evidence", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-no-evidence",
        title: "Gate No Evidence",
        description: "desc",
        category: "security",
        gsProperty: "correctness",
        phase: "build",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "",
      },
    ]);

    const result = await contributeGates({ projectRoot: tempDir });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].gateId).toBe("gate-no-evidence");
    expect(result.skipped[0].reason).toContain("evidence");
  });

  it("skips already-submitted gates", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-already-done",
        title: "Already Done",
        description: "desc",
        category: "security",
        gsProperty: "correctness",
        phase: "build",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    // Write existing contributions
    const forgecraftDir = join(tempDir, ".forgecraft");
    mkdirSync(forgecraftDir, { recursive: true });
    writeFileSync(
      join(forgecraftDir, "contributions.json"),
      JSON.stringify([
        { gateId: "gate-already-done", mode: "anonymous", status: "submitted" },
      ]),
      "utf-8",
    );

    const result = await contributeGates({ projectRoot: tempDir });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("already submitted");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("with dryRun:true returns pending without calling fetch", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "attributed" });
    writeProjectGates(tempDir, [
      {
        id: "gate-dry",
        title: "Dry Gate",
        description: "desc",
        category: "security",
        gsProperty: "correctness",
        phase: "build",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught Y",
      },
    ]);

    const result = await contributeGates({
      projectRoot: tempDir,
      dryRun: true,
    });
    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("pending");
    expect(result.submitted[0].gateId).toBe("gate-dry");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records pending to .forgecraft/pending-contributions.json on server failure", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-pending",
        title: "Pending Gate",
        description: "desc",
        category: "security",
        gsProperty: "correctness",
        phase: "build",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught Z",
      },
    ]);

    const result = await contributeGates({
      projectRoot: tempDir,
      serverUrl: "https://api.example.com",
    });

    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("pending");
    expect(result.pendingFile).toBeDefined();
    expect(existsSync(result.pendingFile!)).toBe(true);

    const pendingData = JSON.parse(
      readFileSync(result.pendingFile!, "utf-8"),
    ) as unknown[];
    expect(pendingData).toHaveLength(1);
  });

  it("records submission to .forgecraft/contributions.json on success", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "submitted",
        issueUrl: "https://github.com/org/repo/issues/1",
      }),
    } as Response);

    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-success",
        title: "Success Gate",
        description: "desc",
        category: "security",
        gsProperty: "correctness",
        phase: "build",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught the bug",
      },
    ]);

    const result = await contributeGates({
      projectRoot: tempDir,
      serverUrl: "https://api.example.com",
    });

    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("submitted");
    expect(result.submitted[0].issueUrl).toBe(
      "https://github.com/org/repo/issues/1",
    );

    const contributionsPath = join(
      tempDir,
      ".forgecraft",
      "contributions.json",
    );
    expect(existsSync(contributionsPath)).toBe(true);
    const saved = JSON.parse(
      readFileSync(contributionsPath, "utf-8"),
    ) as unknown[];
    expect(saved).toHaveLength(1);
  });

  it("skips gate when convergenceAttributes has failing attributes", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-bad-convergence",
        title: "Gate with failing convergence",
        description: "desc",
        domain: "security",
        gsProperty: "defended",
        phase: "development",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
        convergenceAttributes: {
          prescriptive: true,
          agnostic: false,
          promptHealthy: true,
          deterministic: false,
          convergent: true,
        },
      },
    ]);

    const result = await contributeGates({ projectRoot: tempDir });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain(
      "convergence attribute check failed",
    );
    expect(result.skipped[0].reason).toContain("agnostic");
    expect(result.skipped[0].reason).toContain("deterministic");
  });

  it("allows gate when all five convergenceAttributes are true", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-all-pass",
        title: "Gate passing all attributes",
        description: "desc",
        domain: "security",
        gsProperty: "defended",
        phase: "development",
        check:
          "Run npm audit --audit-level=high and fail if exit code non-zero",
        passCriterion: "Exit code 0",
        generalizable: true,
        evidence: "Would have caught the lodash prototype pollution CVE",
        convergenceAttributes: {
          prescriptive: true,
          agnostic: true,
          promptHealthy: true,
          deterministic: true,
          convergent: true,
        },
      },
    ]);

    const result = await contributeGates({
      projectRoot: tempDir,
      dryRun: true,
    });
    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].gateId).toBe("gate-all-pass");
    expect(result.skipped).toHaveLength(0);
  });

  it("allows gate with no convergenceAttributes (backward compat)", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-legacy",
        title: "Legacy gate no convergence attrs",
        description: "desc",
        domain: "security",
        gsProperty: "defended",
        phase: "development",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    const result = await contributeGates({
      projectRoot: tempDir,
      dryRun: true,
    });
    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].gateId).toBe("gate-legacy");
  });
});
