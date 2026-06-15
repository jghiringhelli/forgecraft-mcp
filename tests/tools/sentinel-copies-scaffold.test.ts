/**
 * Integration test for PT-2 sentinel-copy generation via scaffold_project.
 *
 * Asserts:
 *  - default copy-set writes AGENTS.md (and only AGENTS.md as a copy)
 *  - opt-in targets (sentinel.targets) write the corresponding copies
 *  - CLAUDE.md / the CNT tree are unchanged (still written, not a copy)
 *  - generate → check is idempotent-green (the canonical body is deterministic,
 *    so the freshly written copies match a fresh re-render byte-for-byte)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProjectHandler } from "../../src/tools/scaffold.js";
import { evaluateSentinelCopies } from "../../src/tools/sentinel-copies-gate.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-sentinel-scaffold-"));
}

describe("sentinel-copy generation (scaffold)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("default copy-set writes AGENTS.md and leaves CLAUDE.md intact", async () => {
    await scaffoldProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      project_name: "DefaultCopySet",
      language: "typescript",
      dry_run: false,
      force: false,
      output_targets: ["claude"],
    });

    expect(existsSync(join(tempDir, "AGENTS.md"))).toBe(true);
    // CLAUDE.md (CNT root) still written via its own path, unchanged behavior.
    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    // non-opted copies are NOT written by default
    expect(
      existsSync(join(tempDir, ".github", "copilot-instructions.md")),
    ).toBe(false);
    expect(existsSync(join(tempDir, ".clinerules"))).toBe(false);
  });

  it("writes opt-in copies from sentinel.targets", async () => {
    // forgecraft.yaml must exist BEFORE scaffold so loadUserOverrides sees the
    // opt-in targets.
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      "tags:\n  - UNIVERSAL\nsentinel:\n  targets:\n    - copilot\n    - cline\n    - cursor\n",
      "utf-8",
    );

    await scaffoldProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      project_name: "OptInCopies",
      language: "typescript",
      dry_run: false,
      force: false,
      output_targets: ["claude"],
    });

    expect(
      existsSync(join(tempDir, ".github", "copilot-instructions.md")),
    ).toBe(true);
    expect(existsSync(join(tempDir, ".clinerules"))).toBe(true);
    expect(existsSync(join(tempDir, ".cursor", "rules", "agents.mdc"))).toBe(
      true,
    );
    // agents-md was not opted in here, so it is NOT written
    expect(existsSync(join(tempDir, "AGENTS.md"))).toBe(false);
  });

  it("generate → check is idempotent-green", async () => {
    // The gate reconstructs context from forgecraft.yaml, so projectName must be
    // persisted there for a target whose projection embeds it (cursor MDC
    // frontmatter). With projectName in config, writer and evaluator agree.
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      "projectName: Idempotent\ntags:\n  - UNIVERSAL\nsentinel:\n  targets:\n    - copilot\n    - cline\n    - windsurf\n    - cursor\n",
      "utf-8",
    );

    await scaffoldProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      project_name: "Idempotent",
      language: "typescript",
      dry_run: false,
      force: false,
      output_targets: ["claude"],
    });

    const result = evaluateSentinelCopies(tempDir);
    expect(result.status).toBe("green");
    expect(result.drifted).toEqual([]);
    expect(result.blocked).toBe(false);
  });
});
