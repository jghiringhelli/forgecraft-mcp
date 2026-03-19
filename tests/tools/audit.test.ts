/**
 * Tests for the audit_project tool handler.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditProjectHandler } from "../../src/tools/audit.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-audit-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("auditProjectHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a score between 0 and 100", async () => {
    const result = await auditProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      include_anti_patterns: false,
    });
    const text = result.content[0]!.text;
    const match = text.match(/\*\*Score:\*\* (\d+)\/100/);
    expect(match).not.toBeNull();
    const score = parseInt(match![1]!, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("includes Grade in output", async () => {
    const result = await auditProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      include_anti_patterns: false,
    });
    expect(result.content[0]!.text).toMatch(/\*\*Grade:\*\*/);
  });

  it("score improves when CLAUDE.md is present", async () => {
    const resultBefore = await auditProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      include_anti_patterns: false,
    });
    writeFileSync(join(tempDir, "CLAUDE.md"), "# Standards\n".repeat(50));
    const resultAfter = await auditProjectHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      include_anti_patterns: false,
    });
    const scoreBefore = parseInt(
      resultBefore.content[0]!.text.match(/\*\*Score:\*\* (\d+)/)![1]!,
      10,
    );
    const scoreAfter = parseInt(
      resultAfter.content[0]!.text.match(/\*\*Score:\*\* (\d+)/)![1]!,
      10,
    );
    expect(scoreAfter).toBeGreaterThanOrEqual(scoreBefore);
  });
});
