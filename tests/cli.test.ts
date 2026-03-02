import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCli } from "../src/cli.js";
import { sentinelHandler } from "../src/tools/sentinel.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helpers ──────────────────────────────────────────────────────────

function argv(...args: string[]): string[] {
  return ["node", "forgecraft-mcp", ...args];
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    lines.push(args.join(" "));
  });
  return { lines, restore: () => spy.mockRestore() };
}

// ── runCli routing ───────────────────────────────────────────────────

describe("runCli", () => {
  it("returns false when no args provided (MCP server mode)", async () => {
    const result = await runCli(["node", "forgecraft-mcp"]);
    expect(result).toBe(false);
  });

  it("returns false for explicit serve command", async () => {
    const result = await runCli(argv("serve"));
    expect(result).toBe(false);
  });

  it("returns true and prints help for --help flag", async () => {
    const { restore } = captureStdout();
    const result = await runCli(argv("--help"));
    restore();
    expect(result).toBe(true);
  });

  it("returns true and prints help for -h flag", async () => {
    const { restore } = captureStdout();
    const result = await runCli(argv("-h"));
    restore();
    expect(result).toBe(true);
  });

  it("exits on unknown command", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    await expect(runCli(argv("unknowncmd"))).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown command"));
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── list command ─────────────────────────────────────────────────────

describe("CLI: list", () => {
  it("lists tags and returns true", async () => {
    const { lines, restore } = captureStdout();
    const result = await runCli(argv("list", "tags"));
    restore();
    expect(result).toBe(true);
    expect(lines.join("\n")).toContain("UNIVERSAL");
  });

  it("defaults to tags when resource omitted", async () => {
    const { lines, restore } = captureStdout();
    const result = await runCli(argv("list"));
    restore();
    expect(result).toBe(true);
    expect(lines.join("\n")).toContain("UNIVERSAL");
  });

  it("lists hooks and returns true", async () => {
    const { lines, restore } = captureStdout();
    const result = await runCli(argv("list", "hooks"));
    restore();
    expect(result).toBe(true);
    expect(lines.join("\n")).toMatch(/hook/i);
  });

  it("lists skills and returns true", async () => {
    const { lines, restore } = captureStdout();
    const result = await runCli(argv("list", "skills"));
    restore();
    expect(result).toBe(true);
    expect(lines.join("\n")).toMatch(/skill/i);
  });
});

// ── CLI audit with forgecraft.yaml fallback ──────────────────────────

describe("CLI: audit tag fallback from forgecraft.yaml", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `fc-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads tags from forgecraft.yaml when --tags not provided", async () => {
    writeFileSync(
      join(tmpDir, "forgecraft.yaml"),
      "tags:\n  - UNIVERSAL\n",
      "utf-8",
    );
    const { lines, restore } = captureStdout();
    const result = await runCli(argv("audit", tmpDir));
    restore();
    expect(result).toBe(true);
    expect(lines.join("\n")).toMatch(/audit|check|standard/i);
  });

  it("exits with error when --tags missing and no forgecraft.yaml", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    await expect(runCli(argv("audit", tmpDir))).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--tags required"));
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── Sentinel tool ────────────────────────────────────────────────────

describe("sentinelHandler", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `fc-sentinel-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recommends setup for unconfigured project", async () => {
    const result = await sentinelHandler({ project_dir: tmpDir });
    const text = result.content[0]!.text;
    expect(text).toContain("setup");
    expect(text).toContain(tmpDir);
  });

  it("recommends scaffold when forgecraft.yaml exists but no hooks", async () => {
    writeFileSync(join(tmpDir, "forgecraft.yaml"), "tags:\n  - UNIVERSAL\n", "utf-8");
    const result = await sentinelHandler({ project_dir: tmpDir });
    const text = result.content[0]!.text;
    expect(text).toContain("scaffold");
  });

  it("recommends refresh when fully configured", async () => {
    writeFileSync(join(tmpDir, "forgecraft.yaml"), "tags:\n  - UNIVERSAL\n", "utf-8");
    writeFileSync(join(tmpDir, "CLAUDE.md"), "# CLAUDE", "utf-8");
    mkdirSync(join(tmpDir, ".claude", "hooks"), { recursive: true });
    const result = await sentinelHandler({ project_dir: tmpDir });
    const text = result.content[0]!.text;
    expect(text).toContain("refresh");
    expect(text).toContain("audit");
  });

  it("always includes setup-time tool reminder", async () => {
    const result = await sentinelHandler({ project_dir: tmpDir });
    const text = result.content[0]!.text;
    expect(text).toContain("setup-time tool");
  });
});
