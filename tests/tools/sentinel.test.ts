/**
 * Tests for the sentinel tool handler.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sentinelHandler } from "../../src/tools/sentinel.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-sentinel-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("sentinelHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("recommends setup command for unconfigured project", async () => {
    const result = await sentinelHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("npx forgecraft-mcp");
  });

  it("mentions removing MCP after setup in all responses", async () => {
    const result = await sentinelHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("setup-time tool");
  });

  it("shows different message when forgecraft.yaml exists", async () => {
    writeFileSync(join(tempDir, "forgecraft.yaml"), "tags: [UNIVERSAL]\n");
    const result = await sentinelHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).not.toContain(
      "has no engineering standards",
    );
  });

  it("shows configured status when config, CLAUDE.md, and hooks exist", async () => {
    writeFileSync(join(tempDir, "forgecraft.yaml"), "tags: [UNIVERSAL]\n");
    writeFileSync(join(tempDir, "CLAUDE.md"), "# Standards\n");
    mkdirSync(join(tempDir, ".claude", "hooks"), { recursive: true });
    const result = await sentinelHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("forgecraft.yaml ✓");
  });
});
