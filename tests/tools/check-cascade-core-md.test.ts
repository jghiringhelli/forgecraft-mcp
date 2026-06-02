/**
 * Tests for core.md quality gate in checkConstitution (check-cascade-steps.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkConstitution } from "../../src/tools/check-cascade-steps.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-core-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeClaudeMd(
  dir: string,
  content = "# Rules\n\nRead .claude/index.md before any task.\n",
): void {
  writeFileSync(join(dir, "CLAUDE.md"), content, "utf-8");
}

function writeCoreMd(dir: string, content: string): void {
  const claudeDir = join(dir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "core.md"), content, "utf-8");
}

describe("checkConstitution — core.md quality gate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns PASS when CLAUDE.md exists and no core.md", () => {
    writeClaudeMd(tempDir);
    const result = checkConstitution(tempDir);
    expect(result.status).toBe("PASS");
  });

  it("returns PASS when CLAUDE.md and clean core.md both exist", () => {
    writeClaudeMd(tempDir);
    writeCoreMd(
      tempDir,
      Array.from(
        { length: 30 },
        (_, i) => `Rule ${i + 1}: some project rule.`,
      ).join("\n"),
    );
    const result = checkConstitution(tempDir);
    expect(result.status).toBe("PASS");
  });

  it("returns WARN when core.md exceeds its declared Hard limit", () => {
    writeClaudeMd(tempDir);
    const lines = ["# Core Rules", "Hard limit: 10 lines", ""];
    for (let i = 0; i < 15; i++) lines.push(`Rule ${i + 1}: content.`);
    writeCoreMd(tempDir, lines.join("\n"));

    const result = checkConstitution(tempDir);
    expect(result.status).toBe("WARN");
    expect(result.detail).toContain("Hard limit: 10 lines");
  });

  it("returns WARN when core.md contains LLM prompt contamination", () => {
    writeClaudeMd(tempDir);
    writeCoreMd(
      tempDir,
      "# Core Rules\n\nYou are a helpful assistant.\nThe user has answered confirmatory questions.\n",
    );
    const result = checkConstitution(tempDir);
    expect(result.status).toBe("WARN");
    expect(result.detail).toContain("LLM prompt contamination");
  });

  it("includes core.md content snippet in WARN detail for AI review", () => {
    writeClaudeMd(tempDir);
    writeCoreMd(
      tempDir,
      "# Core\nThe user has answered confirmatory questions regarding the project scope.\n",
    );
    const result = checkConstitution(tempDir);
    expect(result.status).toBe("WARN");
    expect(result.detail).toContain("```");
  });

  it("detects 'respond with' pattern as LLM contamination", () => {
    writeClaudeMd(tempDir);
    writeCoreMd(tempDir, "# Core\nRespond with a JSON object when asked.\n");
    const result = checkConstitution(tempDir);
    expect(result.status).toBe("WARN");
  });

  it("does not flag legitimate architecture rules", () => {
    writeClaudeMd(tempDir);
    writeCoreMd(
      tempDir,
      [
        "# Core Rules — VairixDX",
        "## Architecture",
        "- Hexagonal architecture: domain layer has no framework dependencies.",
        "- Services must not import from controllers.",
        "- All database access goes through repository interfaces.",
        "## Naming",
        "- Entities: PascalCase. Services: PascalCase + Service suffix.",
        "- Files: kebab-case.",
      ].join("\n"),
    );
    const result = checkConstitution(tempDir);
    expect(result.status).toBe("PASS");
  });
});
