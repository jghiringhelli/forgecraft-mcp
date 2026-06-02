/**
 * Tests for src/tools/score-rubric.ts
 *
 * Covers: handler returns text, evidence sections present for all 7 properties,
 * scoring criteria present in output, LLM judge invitation present,
 * scorecard template included, evidence reflects project state correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreRubricHandler } from "../../src/tools/score-rubric.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-score-rubric-${Date.now()}`);
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

describe("scoreRubricHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns text content", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    expect(result.content[0]?.type).toBe("text");
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text.length).toBeGreaterThan(100);
  });

  it("includes all 7 GS property sections", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Self-describing");
    expect(text).toContain("Bounded");
    expect(text).toContain("Verifiable");
    expect(text).toContain("Defended");
    expect(text).toContain("Auditable");
    expect(text).toContain("Composable");
    expect(text).toContain("Executable");
  });

  it("includes 0/1/2 scoring criteria for each property", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    // Each property has 0/1/2 criteria blocks
    expect((text.match(/\*\*0\*\*/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect((text.match(/\*\*1\*\*/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect((text.match(/\*\*2\*\*/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it("invites LLM to apply its own criteria", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("starting framework");
    expect(text).toContain("override");
  });

  it("includes scorecard template", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("/14");
    expect(text).toContain("Rationale");
  });

  it("includes Flags section instruction", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Flags");
  });

  it("evidence reflects CLAUDE.md presence when present", async () => {
    write(
      tempDir,
      "CLAUDE.md",
      "# Sentinel\n<!-- ForgeCraft sentinel: -->\nLoad .claude/index.md\n",
    );
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("sentinel: true");
  });

  it("evidence reflects absent CLAUDE.md", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("sentinel: false");
  });

  it("evidence reflects UC count when use cases exist", async () => {
    write(tempDir, "docs/use-cases/UC-001-auth.md", "# UC-001\n");
    write(tempDir, "docs/use-cases/UC-002-payment.md", "# UC-002\n");
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("2 UC files");
  });

  it("evidence reflects harness run when evidence file exists", async () => {
    write(
      tempDir,
      ".forgecraft/harness-run.json",
      JSON.stringify({
        passed: 3,
        failed: 1,
        errors: 0,
        notFound: 0,
        timestamp: "2026-05-25T10:00:00Z",
        results: [],
      }),
    );
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("3 passed");
  });

  it("evidence shows 'not run' when no harness evidence", async () => {
    const result = await scoreRubricHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("not run");
  });
});
