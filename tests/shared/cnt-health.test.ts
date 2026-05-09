/**
 * Tests for src/shared/cnt-health.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectCntDrift, auditCntHealth } from "../../src/shared/cnt-health.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-cnt-test-${Date.now()}`);
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

function makeLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n");
}

describe("detectCntDrift", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns hasCnt: false when .claude/index.md does not exist", () => {
    const result = detectCntDrift(tempDir);
    expect(result.hasCnt).toBe(false);
    expect(result.staleNodes).toEqual([]);
    expect(result.uncoveredModules).toEqual([]);
  });

  it("detects stale CNT node when domain has no matching src/ directory", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/standards/obsolete-routing.md", "# content\n");
    mkdirSync(join(tempDir, "src", "tools"), { recursive: true });

    const result = detectCntDrift(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.staleNodes).toContain("obsolete-routing");
  });

  it("detects uncovered module when src/ dir has no CNT node", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/standards/tools-routing.md", "# content\n");
    mkdirSync(join(tempDir, "src", "tools"), { recursive: true });
    mkdirSync(join(tempDir, "src", "shared"), { recursive: true });

    const result = detectCntDrift(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.uncoveredModules).toContain("shared");
  });

  it("reports no drift when all modules are covered", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/standards/tools-routing.md", "# content\n");
    mkdirSync(join(tempDir, "src", "tools"), { recursive: true });

    const result = detectCntDrift(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.staleNodes).toEqual([]);
    expect(result.uncoveredModules).toEqual([]);
  });

  it("includes message when drift exists", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/standards/ghost-routing.md", "# content\n");
    mkdirSync(join(tempDir, "src", "tools"), { recursive: true });

    const result = detectCntDrift(tempDir);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("ghost-routing");
  });
});

describe("auditCntHealth", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns hasCnt: false when .claude/index.md does not exist", () => {
    const result = auditCntHealth(tempDir);
    expect(result.hasCnt).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toHaveLength(1);
  });

  it("reports issue when CLAUDE.md has more than 3 lines", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/core.md", makeLines(10));
    write(tempDir, "CLAUDE.md", makeLines(10));

    const result = auditCntHealth(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.claudeMdPass).toBe(false);
    expect(result.issues.some((i) => i.includes("CLAUDE.md"))).toBe(true);
  });

  it("reports issue when .claude/core.md has more than 50 lines", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/core.md", makeLines(55));
    write(tempDir, "CLAUDE.md", "sentinel\n");

    const result = auditCntHealth(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.coreMdPass).toBe(false);
    expect(result.issues.some((i) => i.includes("core.md"))).toBe(true);
  });

  it("reports leaf violation when standards file has more than 30 lines", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/core.md", makeLines(10));
    write(tempDir, "CLAUDE.md", "sentinel\n");
    write(tempDir, ".claude/standards/tools-routing.md", makeLines(35));

    const result = auditCntHealth(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.leafViolations).toHaveLength(1);
    expect(result.leafViolations[0]!.file).toBe("tools-routing.md");
  });

  it("skips scaffold-generated files from leaf violation check", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/core.md", makeLines(10));
    write(tempDir, "CLAUDE.md", "sentinel\n");
    const scaffoldContent =
      `<!-- ForgeCraft sentinel: architecture | 2024-01-01 | npx forgecraft-mcp refresh . --apply to update -->\n\n` +
      makeLines(150);
    write(tempDir, ".claude/standards/architecture.md", scaffoldContent);

    const result = auditCntHealth(tempDir);
    expect(result.leafViolations).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("still flags user-created files that exceed 30 lines", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/core.md", makeLines(10));
    write(tempDir, "CLAUDE.md", "sentinel\n");
    write(tempDir, ".claude/standards/my-custom-rules.md", makeLines(35));

    const result = auditCntHealth(tempDir);
    expect(result.leafViolations).toHaveLength(1);
    expect(result.leafViolations[0]!.file).toBe("my-custom-rules.md");
  });

  it("returns score 100 when all checks pass", () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/core.md", makeLines(10));
    write(tempDir, "CLAUDE.md", "sentinel\n");
    write(tempDir, ".claude/standards/tools-routing.md", makeLines(20));

    const result = auditCntHealth(tempDir);
    expect(result.hasCnt).toBe(true);
    expect(result.claudeMdPass).toBe(true);
    expect(result.coreMdPass).toBe(true);
    expect(result.leafViolations).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  describe("audit-check exemptions", () => {
    it("treats CLAUDE.md as passing when audit/cnt_claude_md exception matches", () => {
      const dir = join(tmpdir(), `cnt-exempt-claude-${Date.now()}`);
      mkdirSync(join(dir, ".claude", "standards"), { recursive: true });
      mkdirSync(join(dir, ".forgecraft"), { recursive: true });
      writeFileSync(join(dir, ".claude", "index.md"), "# Index\n");
      writeFileSync(join(dir, ".claude", "core.md"), makeLines(40));
      writeFileSync(
        join(dir, "CLAUDE.md"),
        "# Title\n<!-- sentinel -->\nDescription\n\nMore content\n",
      );
      writeFileSync(
        join(dir, ".forgecraft", "exceptions.json"),
        JSON.stringify({
          version: "1",
          exceptions: [
            {
              id: "exc-001",
              hook: "audit/cnt_claude_md",
              pattern: "CLAUDE.md",
              reason: "Includes sentinel + description",
              addedAt: "2026-05-08",
              addedBy: "test",
            },
          ],
        }),
      );

      const result = auditCntHealth(dir);
      expect(result.claudeMdPass).toBe(true);
      rmSync(dir, { recursive: true, force: true });
    });

    it("treats core.md as passing when audit/cnt_core_md exception matches", () => {
      const dir = join(tmpdir(), `cnt-exempt-core-${Date.now()}`);
      mkdirSync(join(dir, ".claude", "standards"), { recursive: true });
      mkdirSync(join(dir, ".forgecraft"), { recursive: true });
      writeFileSync(join(dir, ".claude", "index.md"), "# Index\n");
      writeFileSync(join(dir, ".claude", "core.md"), makeLines(80));
      writeFileSync(join(dir, "CLAUDE.md"), "L1\nL2\nL3\n");
      writeFileSync(
        join(dir, ".forgecraft", "exceptions.json"),
        JSON.stringify({
          version: "1",
          exceptions: [
            {
              id: "exc-001",
              hook: "audit/cnt_core_md",
              pattern: ".claude/core.md",
              reason: "Tier-memory model description",
              addedAt: "2026-05-08",
              addedBy: "test",
            },
          ],
        }),
      );

      const result = auditCntHealth(dir);
      expect(result.coreMdPass).toBe(true);
      rmSync(dir, { recursive: true, force: true });
    });

    it("excludes leaf file from violations when audit/cnt_leaf_length exception matches", () => {
      const dir = join(tmpdir(), `cnt-exempt-leaf-${Date.now()}`);
      mkdirSync(join(dir, ".claude", "standards"), { recursive: true });
      mkdirSync(join(dir, ".forgecraft"), { recursive: true });
      writeFileSync(join(dir, ".claude", "index.md"), "# Index\n");
      writeFileSync(join(dir, ".claude", "core.md"), makeLines(40));
      writeFileSync(join(dir, "CLAUDE.md"), "L1\nL2\nL3\n");
      writeFileSync(
        join(dir, ".claude", "standards", "ecosystem.md"),
        makeLines(150),
      );
      writeFileSync(
        join(dir, ".forgecraft", "exceptions.json"),
        JSON.stringify({
          version: "1",
          exceptions: [
            {
              id: "exc-001",
              hook: "audit/cnt_leaf_length",
              pattern: ".claude/standards/ecosystem.md",
              reason: "Forgecraft is the standards source-of-truth",
              addedAt: "2026-05-08",
              addedBy: "test",
            },
          ],
        }),
      );

      const result = auditCntHealth(dir);
      expect(result.leafViolations).toHaveLength(0);
      rmSync(dir, { recursive: true, force: true });
    });
  });
});
