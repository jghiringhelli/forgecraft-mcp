/**
 * Tests for the configure_mcp tool handler.
 *
 * Tests cover: settings.json creation, custom server merging,
 * auto-approve flag, tag-based server recommendation, and idempotency.
 */
// @ts-nocheck


import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureMcpHandler } from "../../src/tools/configure-mcp.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-mcp-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("configureMcpHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("creates .claude/settings.json in project_dir", async () => {
    const result = await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      auto_approve_tools: false,
      include_remote: false,
    });
    expect(result.content).toHaveLength(1);
    expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);
  });

  it("settings.json contains valid JSON with mcpServers key", async () => {
    await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      auto_approve_tools: false,
      include_remote: false,
    });
    const raw = readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).toHaveProperty("mcpServers");
  });

  it("adds permissions.allow entries when auto_approve_tools=true", async () => {
    await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      auto_approve_tools: true,
      include_remote: false,
    });
    const raw = readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8");
    const parsed = JSON.parse(raw) as { permissions?: { allow?: string[] } };
    expect(parsed.permissions?.allow).toBeDefined();
    expect(Array.isArray(parsed.permissions?.allow)).toBe(true);
  });

  it("does not add permissions when auto_approve_tools=false", async () => {
    await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      auto_approve_tools: false,
      include_remote: false,
    });
    const raw = readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8");
    const parsed = JSON.parse(raw) as { permissions?: unknown };
    // permissions should either be absent or have empty allow
    const allow = (parsed.permissions as { allow?: string[] } | undefined)?.allow;
    expect(!allow || allow.length === 0).toBe(true);
  });

  it("merges custom_servers into settings.json", async () => {
    await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      custom_servers: {
        "my-custom-server": { command: "node", args: ["./my-server.js"] },
      },
      auto_approve_tools: false,
      include_remote: false,
    });
    const raw = readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers).toHaveProperty("my-custom-server");
  });

  it("returns response text confirming file path", async () => {
    const result = await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      auto_approve_tools: false,
      include_remote: false,
    });
    expect(result.content[0]!.text).toMatch(/settings\.json/i);
  });

  it("second call updates existing settings.json without error", async () => {
    await configureMcpHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      auto_approve_tools: false,
      include_remote: false,
    });
    const result = await configureMcpHandler({
      tags: ["UNIVERSAL", "API"],
      project_dir: tempDir,
      auto_approve_tools: true,
      include_remote: false,
    });
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
    expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);
  });
});
