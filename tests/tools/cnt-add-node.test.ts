/**
 * Tests for src/tools/cnt-add-node.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cntAddNodeHandler } from "../../src/tools/cnt-add-node.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-cnt-add-test-${Date.now()}`);
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

describe("cntAddNodeHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns error when CNT not initialized (no .claude/index.md)", async () => {
    const result = await cntAddNodeHandler({
      project_dir: tempDir,
      domain: "tools",
      concern: "routing",
    });
    expect(result.content[0]!.text).toContain("Error:");
    expect(result.content[0]!.text).toContain("CNT not initialized");
  });

  it("returns error when leaf node already exists", async () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    write(tempDir, ".claude/standards/tools-routing.md", "# existing\n");

    const result = await cntAddNodeHandler({
      project_dir: tempDir,
      domain: "tools",
      concern: "routing",
    });
    expect(result.content[0]!.text).toContain("Error:");
    expect(result.content[0]!.text).toContain("already exists");
  });

  it("creates leaf node file and updates index on success", async () => {
    write(
      tempDir,
      ".claude/index.md",
      "# Index\n\n| Domain | Concerns |\n|--------|----------|\n",
    );

    const result = await cntAddNodeHandler({
      project_dir: tempDir,
      domain: "tools",
      concern: "routing",
      content: "# tools/routing\n\n## Invariants\n- Use router pattern.\n",
    });

    expect(result.content[0]!.text).toContain("✅");
    expect(result.content[0]!.text).toContain("tools-routing.md");

    const nodePath = join(tempDir, ".claude", "standards", "tools-routing.md");
    expect(existsSync(nodePath)).toBe(true);
    expect(readFileSync(nodePath, "utf-8")).toContain("tools/routing");

    const indexContent = readFileSync(
      join(tempDir, ".claude", "index.md"),
      "utf-8",
    );
    expect(indexContent).toContain("tools-routing.md");
  });

  it("truncates content that exceeds 30 lines and warns", async () => {
    write(tempDir, ".claude/index.md", "# Index\n");
    const longContent = makeLines(40);

    const result = await cntAddNodeHandler({
      project_dir: tempDir,
      domain: "shared",
      concern: "errors",
      content: longContent,
    });

    expect(result.content[0]!.text).toContain("⚠️");
    expect(result.content[0]!.text).toContain("truncated");

    const nodePath = join(tempDir, ".claude", "standards", "shared-errors.md");
    const written = readFileSync(nodePath, "utf-8");
    const lineCount = written.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(32); // 30 lines + truncation notice + possible empty line
  });

  it("generates placeholder content when content is omitted", async () => {
    write(tempDir, ".claude/index.md", "# Index\n");

    const result = await cntAddNodeHandler({
      project_dir: tempDir,
      domain: "security",
      concern: "auth",
    });

    expect(result.content[0]!.text).toContain("✅");

    const nodePath = join(tempDir, ".claude", "standards", "security-auth.md");
    const written = readFileSync(nodePath, "utf-8");
    expect(written).toContain("security/auth");
    expect(written).toContain("Invariants");
    expect(written).toContain("Patterns");
    expect(written).toContain("Constraints");
  });
});
