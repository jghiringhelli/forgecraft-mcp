/**
 * Integration test for the step-gated session (ADR-0012 §6b).
 *
 * The harness FORCES the upstream session steps: the commit-msg-session-gate
 * hook blocks a test:/feat:/fix: commit until `intake` and `spec-validation`
 * are marked `done` in .claude/session-manifest.yaml. This exercises the actual
 * emitted bash hook against a real git repo — the only place the enforcement
 * truly surfaces. Skipped where no bash interpreter is present.
 */

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { scaffoldProjectHandler } from "../../src/tools/scaffold.js";

function bashAvailable(): boolean {
  try {
    execFileSync("bash", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Run the gate hook with a commit message; return its exit code. */
function runGate(projectDir: string, message: string): number {
  const msgFile = join(projectDir, "COMMIT_MSG");
  writeFileSync(msgFile, message, "utf-8");
  const hook = join(
    projectDir,
    ".claude",
    "hooks",
    "commit-msg-session-gate.sh",
  );
  try {
    execFileSync("bash", [hook, msgFile], {
      cwd: projectDir,
      stdio: "pipe",
      timeout: 15_000,
    });
    return 0;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      return Number((err as { status: unknown }).status);
    }
    throw err;
  }
}

function setManifestStep(
  projectDir: string,
  step: string,
  value: "pending" | "done",
): void {
  const path = join(projectDir, ".claude", "session-manifest.yaml");
  const content = readFileSync(path, "utf-8");
  const updated = content.replace(
    new RegExp(`(^\\s*${step}:\\s*)(pending|done)`, "m"),
    `$1${value}`,
  );
  writeFileSync(path, updated, "utf-8");
}

const hasBash = bashAvailable();

(hasBash ? describe : describe.skip)(
  "commit-msg-session-gate hook",
  () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    });

    async function scaffoldGitRepo(): Promise<string> {
      const dir = join(tmpdir(), `fc-session-gate-${Date.now()}`);
      await scaffoldProjectHandler({
        project_dir: dir,
        project_name: "SessionGate",
        tags: ["UNIVERSAL"],
        language: "typescript",
        force: false,
        sentinel: true,
        dry_run: false,
        output_targets: ["claude"],
      });
      // The hook resolves the manifest via `git rev-parse --show-toplevel`.
      execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
      return dir;
    }

    it("blocks a code commit while intake/spec-validation are pending", async () => {
      tempDir = await scaffoldGitRepo();
      expect(
        existsSync(join(tempDir, ".claude", "session-manifest.yaml")),
      ).toBe(true);
      expect(runGate(tempDir, "feat(x): [GREEN] add the thing")).toBe(1);
    });

    it("allows the code commit once both upstream steps are done", async () => {
      tempDir = await scaffoldGitRepo();
      setManifestStep(tempDir, "intake", "done");
      setManifestStep(tempDir, "spec-validation", "done");
      expect(runGate(tempDir, "feat(x): [GREEN] add the thing")).toBe(0);
    });

    it("still blocks when only one upstream step is done", async () => {
      tempDir = await scaffoldGitRepo();
      setManifestStep(tempDir, "intake", "done");
      expect(runGate(tempDir, "test(x): [RED] failing test")).toBe(1);
    });

    it("does not gate non-code commits (docs/chore)", async () => {
      tempDir = await scaffoldGitRepo();
      // intake/spec-validation still pending, but docs is never gated.
      expect(runGate(tempDir, "docs: update README")).toBe(0);
      expect(runGate(tempDir, "chore: bump deps")).toBe(0);
    });

    it("never gates merge commits", async () => {
      tempDir = await scaffoldGitRepo();
      expect(runGate(tempDir, "Merge branch 'feature'")).toBe(0);
    });

    it("is opt-in: no manifest means no enforcement", async () => {
      tempDir = await scaffoldGitRepo();
      rmSync(join(tempDir, ".claude", "session-manifest.yaml"), {
        force: true,
      });
      expect(runGate(tempDir, "feat(x): [GREEN] add the thing")).toBe(0);
    });

    it("honors the FORGECRAFT_SKIP_SESSION_GATE escape hatch", async () => {
      tempDir = await scaffoldGitRepo();
      const msgFile = join(tempDir, "COMMIT_MSG");
      writeFileSync(msgFile, "feat(x): [GREEN] add the thing", "utf-8");
      const hook = join(
        tempDir,
        ".claude",
        "hooks",
        "commit-msg-session-gate.sh",
      );
      // Pending steps would normally block; the env var bypasses for one commit.
      let code = 0;
      try {
        execFileSync("bash", [hook, msgFile], {
          cwd: tempDir,
          stdio: "pipe",
          timeout: 15_000,
          env: { ...process.env, FORGECRAFT_SKIP_SESSION_GATE: "1" },
        });
      } catch (err) {
        code =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status: unknown }).status)
            : 1;
      }
      expect(code).toBe(0);
    });
  },
  // Scaffolds + git-inits several temp repos and shells out to bash per case.
  120_000,
);
