/**
 * The generative-execution skill — the manual QA loop (ADR-0012 §6 / phase 6).
 *
 * Field gap this closes: ForgeCraft scaffolded skills for unit tests, review,
 * TDD, and refactor — but nothing that drives the per-UC `run_harness`
 * multimodal verification loop, the loop that catches the bugs unit tests miss.
 * Every scaffolded project must ship `/generative-execution` as a core skill.
 */

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProjectHandler } from "../../src/tools/scaffold.js";

describe("generative-execution skill (manual QA loop)", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  async function scaffold(tags: string[]): Promise<string> {
    tempDir = join(tmpdir(), `fc-genexec-skill-${Date.now()}`);
    await scaffoldProjectHandler({
      project_dir: tempDir,
      project_name: "GenExec",
      tags,
      language: "typescript",
      force: false,
      sentinel: true,
      dry_run: false,
      output_targets: ["claude"],
    });
    return tempDir;
  }

  it("ships as a core skill in every project (even a bare UNIVERSAL one)", async () => {
    const dir = await scaffold(["UNIVERSAL"]);
    const skill = join(dir, ".claude", "commands", "generative-execution.md");
    expect(existsSync(skill)).toBe(true);
  });

  it("drives run_harness, the per-UC flags, and red=spec-violation framing", async () => {
    const dir = await scaffold(["UNIVERSAL", "API"]);
    const content = readFileSync(
      join(dir, ".claude", "commands", "generative-execution.md"),
      "utf-8",
    );
    expect(content).toContain("run_harness");
    expect(content).toMatch(/green \| red \| unrun|green.*red.*unrun/i);
    expect(content).toMatch(/specification violation/i);
    // It must distinguish itself from `npm test` (the gap it closes).
    expect(content).toMatch(/NOT `npm test`/);
    // It must route runtime discoveries into the §6c discovery log.
    expect(content).toContain("docs/discovery-log.md");
    // It must carry the stochastic audit-RUN caveat (§6f).
    expect(content).toMatch(/audit-RUN|pass-rate/i);
    expect(content).not.toContain("{{");
  });

  it("is surfaced in the lifecycle Tool Sequencing table", async () => {
    const dir = await scaffold(["UNIVERSAL"]);
    const lifecycle = readFileSync(
      join(dir, ".claude", "lifecycle.md"),
      "utf-8",
    );
    expect(lifecycle).toContain("/generative-execution");
  });
});
