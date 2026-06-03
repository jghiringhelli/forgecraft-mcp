/**
 * Tests for src/tools/contribute-gate.ts
 *
 * Covers: disabled contribute_gates, evidence validation, deduplication,
 * dry-run mode, gh CLI failure → pre-filled issue URL fallback, and
 * successful gh issue creation recording.
 *
 * Submission mechanism: GitHub issues on the public quality-gates repo —
 * gh CLI primary, pre-filled issue URL fallback. No API server.
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
import {
  contributeGates,
  runGhCli,
  type GhRunner,
} from "../../src/tools/contribute-gate.js";

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

/** gh runner that always succeeds, returning a fixed issue URL. */
function successGh(issueUrl: string): GhRunner {
  return vi.fn(() => ({ ok: true, stdout: issueUrl }));
}

/** gh runner that always fails (gh missing / unauthenticated / network). */
function failingGh(): GhRunner {
  return vi.fn(() => ({ ok: false, stdout: "" }));
}

describe("contributeGates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
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

    const gh = failingGh();
    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: gh,
    });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(gh).not.toHaveBeenCalled();
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

    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: failingGh(),
    });
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

    const gh = failingGh();
    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: gh,
    });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("already submitted");
    expect(gh).not.toHaveBeenCalled();
  });

  it("with dryRun:true returns pending without invoking gh", async () => {
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

    const gh = failingGh();
    const result = await contributeGates({
      projectRoot: tempDir,
      dryRun: true,
      ghRunner: gh,
    });
    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("pending");
    expect(result.submitted[0].gateId).toBe("gate-dry");
    expect(gh).not.toHaveBeenCalled();
  });

  it("falls back to pre-filled issue URL when gh CLI fails", async () => {
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
      ghRunner: failingGh(),
    });

    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("pending");
    // Fallback is a one-click pre-filled GitHub issue URL on the registry repo
    expect(result.submitted[0].issueUrl).toContain(
      "github.com/jghiringhelli/quality-gates/issues/new",
    );
    expect(result.submitted[0].issueUrl).toContain("Gate+Proposal");

    expect(result.pendingFile).toBeDefined();
    expect(existsSync(result.pendingFile!)).toBe(true);
    const pendingData = JSON.parse(
      readFileSync(result.pendingFile!, "utf-8"),
    ) as { issueUrl?: string }[];
    expect(pendingData).toHaveLength(1);
    // Pending file carries the URL so manual retry is one click
    expect(pendingData[0].issueUrl).toContain("issues/new");
  });

  it("records submission to .forgecraft/contributions.json when gh succeeds", async () => {
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
      ghRunner: successGh(
        "https://github.com/jghiringhelli/quality-gates/issues/42",
      ),
    });

    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("submitted");
    expect(result.submitted[0].issueUrl).toBe(
      "https://github.com/jghiringhelli/quality-gates/issues/42",
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

  it("invokes gh with the registry repo, proposal title, and labels", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-args",
        title: "Args Gate",
        description: "desc",
        category: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    const gh = successGh(
      "https://github.com/jghiringhelli/quality-gates/issues/7",
    );
    await contributeGates({ projectRoot: tempDir, ghRunner: gh });

    expect(gh).toHaveBeenCalledOnce();
    const args = vi.mocked(gh).mock.calls[0][0];
    expect(args).toContain("issue");
    expect(args).toContain("create");
    expect(args).toContain("jghiringhelli/quality-gates");
    expect(args).toContain("[Gate Proposal] gate-args");
    expect(args.join(" ")).toContain("gate-proposal,status:pending-review");
  });

  it("issue body matches the registry template and includes experimentId", async () => {
    writeForgecraftYaml(tempDir, {
      contribute_gates: "attributed",
      github_user: "testdev",
    });
    writeProjectGates(tempDir, [
      {
        id: "gate-experiment",
        title: "Experiment Gate",
        description: "Catches missing schema validation",
        domain: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "Run schema check on staged files",
        passCriterion: "Zero violations",
        generalizable: true,
        evidence: "Would have caught the unvalidated webhook payload bug",
      },
    ]);

    let capturedBody = "";
    const gh: GhRunner = vi.fn((args: string[]) => {
      // Read the --body-file content while the temp file still exists
      const bodyFileIdx = args.indexOf("--body-file");
      if (bodyFileIdx >= 0) {
        capturedBody = readFileSync(args[bodyFileIdx + 1]!, "utf-8");
      }
      return {
        ok: true,
        stdout: "https://github.com/jghiringhelli/quality-gates/issues/9",
      };
    });

    await contributeGates({
      projectRoot: tempDir,
      experimentId: "dx-2026-vaquita",
      ghRunner: gh,
    });

    expect(capturedBody).toContain("## Gate Proposal");
    expect(capturedBody).toContain("**Contributor**: @testdev");
    expect(capturedBody).toContain("**ID**: `gate-experiment`");
    expect(capturedBody).toContain("**Experiment**: dx-2026-vaquita");
    expect(capturedBody).toContain("### Evidence");
    expect(capturedBody).toContain("unvalidated webhook payload");
  });

  it("custom registry_repo in forgecraft.yaml overrides the default", async () => {
    writeForgecraftYaml(tempDir, {
      contribute_gates: "anonymous",
      registry_repo: "my-org/my-gates",
    });
    writeProjectGates(tempDir, [
      {
        id: "gate-custom-repo",
        title: "Custom Repo Gate",
        description: "desc",
        category: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    const gh = successGh("https://github.com/my-org/my-gates/issues/1");
    await contributeGates({ projectRoot: tempDir, ghRunner: gh });

    const args = vi.mocked(gh).mock.calls[0][0];
    expect(args).toContain("my-org/my-gates");
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

    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: failingGh(),
    });
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

  it("truncates oversized issue bodies in the fallback URL", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-huge",
        title: "Huge Gate",
        description: "x".repeat(8000), // forces body > 5500 chars
        category: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: failingGh(),
    });
    expect(result.submitted).toHaveLength(1);
    const url = result.submitted[0].issueUrl!;
    // Truncation marker present, URL bounded under GitHub's ~8KB cap
    expect(url).toContain("truncated");
    expect(url.length).toBeLessThan(8500);
  });
});

describe("contributeGates — error resilience", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty result when forgecraft.yaml does not exist", async () => {
    const result = await contributeGates({ projectRoot: tempDir });
    expect(result.submitted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("treats malformed contributions.json as no prior submissions", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-after-corrupt",
        title: "Gate",
        description: "desc",
        category: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);
    const forgecraftDir = join(tempDir, ".forgecraft");
    mkdirSync(forgecraftDir, { recursive: true });
    writeFileSync(
      join(forgecraftDir, "contributions.json"),
      "{ not valid json",
      "utf-8",
    );

    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: successGh(
        "https://github.com/jghiringhelli/quality-gates/issues/3",
      ),
    });
    // Corrupt log ignored — gate submits normally
    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("submitted");
  });

  it("falls back to issue URL when the gh runner throws", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "anonymous" });
    writeProjectGates(tempDir, [
      {
        id: "gate-throwing-gh",
        title: "Gate",
        description: "desc",
        category: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    const throwingGh: GhRunner = () => {
      throw new Error("gh exploded");
    };
    const result = await contributeGates({
      projectRoot: tempDir,
      ghRunner: throwingGh,
    });
    expect(result.submitted).toHaveLength(1);
    expect(result.submitted[0].status).toBe("pending");
    expect(result.submitted[0].issueUrl).toContain("issues/new");
  });

  it("anonymous contributor when attributed mode lacks github_user", async () => {
    writeForgecraftYaml(tempDir, { contribute_gates: "attributed" }); // no github_user
    writeProjectGates(tempDir, [
      {
        id: "gate-no-user",
        title: "Gate",
        description: "desc",
        category: "security",
        gsProperty: "defended",
        phase: "development",
        hook: "pre-commit",
        check: "check",
        passCriterion: "passes",
        generalizable: true,
        evidence: "Would have caught X",
      },
    ]);

    let capturedBody = "";
    const gh: GhRunner = (args: string[]) => {
      const idx = args.indexOf("--body-file");
      if (idx >= 0) capturedBody = readFileSync(args[idx + 1]!, "utf-8");
      return {
        ok: true,
        stdout: "https://github.com/jghiringhelli/quality-gates/issues/5",
      };
    };
    await contributeGates({ projectRoot: tempDir, ghRunner: gh });
    expect(capturedBody).toContain("**Contributor**: anonymous");
  });
});

describe("runGhCli", () => {
  it("returns ok:false for an invalid gh invocation (gh missing or non-zero exit)", () => {
    // Deterministic regardless of environment: if gh is absent → spawn error;
    // if gh is present → unknown flag exits non-zero. Never touches the network.
    const result = runGhCli(["--definitely-not-a-real-flag-xyz"]);
    expect(result.ok).toBe(false);
  });
});
