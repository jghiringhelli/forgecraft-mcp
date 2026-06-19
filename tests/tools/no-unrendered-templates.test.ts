/**
 * Ratchet pawl: no scaffolded file may ship with an unrendered Liquid
 * placeholder.
 *
 * The bug this locks out (reported by field analysis of v1.8.0): hook scripts
 * were written raw, so `{{coverage_minimum | default: 80}}` reached disk
 * verbatim and produced invalid bash that failed on the first commit. Skills
 * and standards were rendered; hooks were the one path that wrote raw.
 *
 * This test scaffolds a broad tag set and asserts that NOTHING emitted contains
 * `{{` — the failure is silent at scaffold time, so a test is the only place it
 * surfaces before a user hits it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { scaffoldProjectHandler } from "../../src/tools/scaffold.js";

/** True when a `bash` interpreter is available to parse-check scripts. */
function bashAvailable(): boolean {
  try {
    execFileSync("bash", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

describe("scaffold emits no unrendered Liquid placeholders", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("leaves no `{{` in any emitted file across a broad tag set", async () => {
    tempDir = join(tmpdir(), `fc-no-liquid-${Date.now()}`);
    await scaffoldProjectHandler({
      project_dir: tempDir,
      project_name: "NoLiquid",
      tags: ["UNIVERSAL", "API", "WEB-REACT", "DATABASE", "CLI"],
      language: "typescript",
      force: false,
      sentinel: true,
      dry_run: false,
      output_targets: ["claude"],
    });

    const offenders: string[] = [];
    for (const file of walk(tempDir)) {
      // Skip binary-ish / large files defensively.
      if (statSync(file).size > 1_000_000) continue;
      let content: string;
      try {
        content = readFileSync(file, "utf-8");
      } catch {
        continue;
      }
      if (content.includes("{{")) {
        const line = content.split("\n").find((l) => l.includes("{{"));
        offenders.push(`${file.replace(tempDir, "")}: ${line?.trim() ?? ""}`);
      }
    }

    expect(
      offenders,
      `Unrendered Liquid placeholders shipped in:\n${offenders.join("\n")}`,
    ).toHaveLength(0);
  });

  it("renders the threshold hooks to concrete numeric defaults", async () => {
    tempDir = join(tmpdir(), `fc-no-liquid-nums-${Date.now()}`);
    await scaffoldProjectHandler({
      project_dir: tempDir,
      project_name: "NoLiquidNums",
      tags: ["UNIVERSAL"],
      language: "typescript",
      force: false,
      sentinel: true,
      dry_run: false,
      output_targets: ["claude"],
    });

    const coverage = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit-coverage.sh"),
      "utf-8",
    );
    expect(coverage).toContain("cov-fail-under=80");
    expect(coverage).not.toContain("{{");

    const complexity = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit-complexity.sh"),
      "utf-8",
    );
    expect(complexity).toMatch(/MAX=\d+/);
    expect(complexity).not.toContain("{{");
  });
});

describe("every scaffolded hook is syntactically valid bash", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  const hasBash = bashAvailable();

  // Skips only where no bash exists (e.g. a bare Windows CI without git-bash).
  // Runs everywhere bash is present — CI Linux and local git-bash — which is
  // where an unparseable hook (unrendered {{...}} OR a missing `done`) surfaces.
  (hasBash ? it : it.skip)(
    "passes `bash -n` for every emitted .claude/hooks/*.sh",
    async () => {
      tempDir = join(tmpdir(), `fc-bash-n-${Date.now()}`);
      await scaffoldProjectHandler({
        project_dir: tempDir,
        project_name: "BashN",
        tags: [
          "UNIVERSAL",
          "API",
          "WEB-REACT",
          "DATABASE",
          "CLI",
          "ML",
          "INFRA",
          "MOBILE",
          "EXPO",
        ],
        language: "typescript",
        force: false,
        sentinel: true,
        dry_run: false,
        output_targets: ["claude"],
      });

      const hooksDir = join(tempDir, ".claude", "hooks");
      const scripts = readdirSync(hooksDir).filter((f) => f.endsWith(".sh"));
      expect(scripts.length).toBeGreaterThan(0);

      const broken: string[] = [];
      for (const script of scripts) {
        try {
          execFileSync("bash", ["-n", join(hooksDir, script)], {
            stdio: "pipe",
            timeout: 10_000,
          });
        } catch (err) {
          const stderr =
            err && typeof err === "object" && "stderr" in err
              ? String((err as { stderr: unknown }).stderr)
              : String(err);
          broken.push(`${script}: ${stderr.trim()}`);
        }
      }

      expect(
        broken,
        `Hooks with bash syntax errors:\n${broken.join("\n")}`,
      ).toHaveLength(0);
    },
    // Spawns `bash -n` once per emitted hook (~27 processes). Under heavy
    // parallel-suite load on Windows, bash startup can exceed the default 10s
    // test budget even though each check is fast — give it real headroom.
    60_000,
  );
});
