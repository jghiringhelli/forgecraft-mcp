/**
 * Tests for advise_session — session-start advisor.
 *
 * Covers: signal reading, advice generation, handler output.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readProjectSignals,
  type ProjectSignals,
} from "../../src/tools/advise-session-signals.js";
import {
  buildAdviceItems,
  formatAdvice,
  type AdviceItem,
} from "../../src/tools/advise-session-advisor.js";
import { adviseSessionHandler } from "../../src/tools/advise-session.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "forgecraft-advise-test-"));
}

function touch(dir: string, relPath: string, content = ""): void {
  const full = join(dir, relPath);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function writeViolation(dir: string, message: string): void {
  const violationsDir = join(dir, ".forgecraft");
  mkdirSync(violationsDir, { recursive: true });
  const entry = JSON.stringify({
    hook: "test-hook",
    severity: "error",
    message,
    timestamp: new Date().toISOString(),
  });
  writeFileSync(join(violationsDir, "gate-violations.jsonl"), entry + "\n", {
    flag: "a",
  });
}

// ── readProjectSignals ────────────────────────────────────────────────

describe("readProjectSignals", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("all false for empty directory", () => {
    const s = readProjectSignals(dir);
    expect(s.hasConfig).toBe(false);
    expect(s.hasConstitution).toBe(false);
    expect(s.hasSpec).toBe(false);
    expect(s.hasAdrs).toBe(false);
    expect(s.hasTests).toBe(false);
    expect(s.hasSchema).toBe(false);
    expect(s.hasSourceCode).toBe(false);
    expect(s.activeViolationCount).toBe(0);
  });

  it("detects forgecraft.yaml", () => {
    touch(dir, "forgecraft.yaml", "tags: []");
    expect(readProjectSignals(dir).hasConfig).toBe(true);
  });

  it("detects CLAUDE.md as constitution", () => {
    touch(dir, "CLAUDE.md", "# rules");
    expect(readProjectSignals(dir).hasConstitution).toBe(true);
  });

  it("detects .clinerules as constitution (Cline)", () => {
    touch(dir, ".clinerules", "# rules");
    expect(readProjectSignals(dir).hasConstitution).toBe(true);
  });

  it("detects .windsurfrules as constitution (Windsurf)", () => {
    touch(dir, ".windsurfrules", "# rules");
    expect(readProjectSignals(dir).hasConstitution).toBe(true);
  });

  it("detects CONVENTIONS.md as constitution (Aider)", () => {
    touch(dir, "CONVENTIONS.md", "# conventions");
    expect(readProjectSignals(dir).hasConstitution).toBe(true);
  });

  it("detects docs/PRD.md as spec", () => {
    touch(dir, "docs/PRD.md", "# PRD");
    expect(readProjectSignals(dir).hasSpec).toBe(true);
  });

  it("detects docs/adrs/ directory with an ADR", () => {
    touch(dir, "docs/adrs/ADR-0001.md", "# ADR");
    expect(readProjectSignals(dir).hasAdrs).toBe(true);
  });

  it("does not flag hasAdrs when adrs dir is empty", () => {
    mkdirSync(join(dir, "docs", "adrs"), { recursive: true });
    expect(readProjectSignals(dir).hasAdrs).toBe(false);
  });

  it("detects tests/ directory", () => {
    mkdirSync(join(dir, "tests"), { recursive: true });
    expect(readProjectSignals(dir).hasTests).toBe(true);
  });

  it("detects __tests__/ directory", () => {
    mkdirSync(join(dir, "__tests__"), { recursive: true });
    expect(readProjectSignals(dir).hasTests).toBe(true);
  });

  it("detects package.json as source code", () => {
    touch(dir, "package.json", "{}");
    expect(readProjectSignals(dir).hasSourceCode).toBe(true);
  });

  it("detects pyproject.toml as source code", () => {
    touch(dir, "pyproject.toml", "[tool.poetry]");
    expect(readProjectSignals(dir).hasSourceCode).toBe(true);
  });

  it("detects openapi.yaml as schema", () => {
    touch(dir, "openapi.yaml", "openapi: 3.0.0");
    expect(readProjectSignals(dir).hasSchema).toBe(true);
  });

  it("detects prisma/schema.prisma as schema", () => {
    touch(dir, "prisma/schema.prisma", "datasource db {}");
    expect(readProjectSignals(dir).hasSchema).toBe(true);
  });

  it("reads active violations count", () => {
    writeViolation(dir, "missing tests");
    writeViolation(dir, "no schema");
    const s = readProjectSignals(dir);
    expect(s.activeViolationCount).toBe(2);
  });

  it("surfaces top violation messages", () => {
    writeViolation(dir, "test coverage below 80%");
    const s = readProjectSignals(dir);
    expect(s.topViolations[0]).toContain("test coverage");
  });
});

// ── buildAdviceItems ──────────────────────────────────────────────────

describe("buildAdviceItems", () => {
  const base: ProjectSignals = {
    hasConfig: true,
    hasConstitution: true,
    hasSpec: true,
    hasAdrs: true,
    hasTests: true,
    hasSchema: true,
    hasSourceCode: true,
    activeViolationCount: 0,
    topViolations: [],
    recentActivity: null,
  };

  it("returns green item when all signals pass", () => {
    const items = buildAdviceItems(base, 5);
    expect(items).toHaveLength(1);
    expect(items[0]?.priority).toBe("low");
  });

  it("surfaces violations as critical items", () => {
    const s: ProjectSignals = {
      ...base,
      activeViolationCount: 2,
      topViolations: ["missing tests", "no schema"],
    };
    const items = buildAdviceItems(s, 5);
    expect(items.some((i) => i.priority === "critical")).toBe(true);
    expect(items.some((i) => i.message.includes("missing tests"))).toBe(true);
  });

  it("flags missing tests as high priority when source code exists", () => {
    const s: ProjectSignals = { ...base, hasTests: false };
    const items = buildAdviceItems(s, 5);
    expect(
      items.some(
        (i) =>
          i.priority === "high" && i.message.toLowerCase().includes("test"),
      ),
    ).toBe(true);
  });

  it("does not flag missing tests when no source code", () => {
    const s: ProjectSignals = {
      ...base,
      hasTests: false,
      hasSourceCode: false,
    };
    const items = buildAdviceItems(s, 5);
    expect(items.every((i) => !i.message.toLowerCase().includes("test"))).toBe(
      true,
    );
  });

  it("flags missing schema as medium priority when source code exists", () => {
    const s: ProjectSignals = { ...base, hasSchema: false };
    const items = buildAdviceItems(s, 5);
    expect(
      items.some(
        (i) =>
          i.priority === "medium" && i.message.toLowerCase().includes("schema"),
      ),
    ).toBe(true);
  });

  it("flags missing constitution as high priority", () => {
    const s: ProjectSignals = { ...base, hasConstitution: false };
    const items = buildAdviceItems(s, 5);
    expect(
      items.some(
        (i) =>
          i.priority === "high" &&
          i.message.toLowerCase().includes("rules file"),
      ),
    ).toBe(true);
  });

  it("respects maxItems cap", () => {
    const s: ProjectSignals = {
      ...base,
      hasTests: false,
      hasSchema: false,
      hasConstitution: false,
      activeViolationCount: 5,
      topViolations: ["v1", "v2", "v3", "v4", "v5"],
    };
    const items = buildAdviceItems(s, 3);
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it("prioritises violations over missing-tests advice", () => {
    const s: ProjectSignals = {
      ...base,
      hasTests: false,
      activeViolationCount: 1,
      topViolations: ["gate failed"],
    };
    const items = buildAdviceItems(s, 5);
    expect(items[0]?.priority).toBe("critical");
  });
});

// ── formatAdvice ──────────────────────────────────────────────────────

describe("formatAdvice", () => {
  it("starts with ## Session Advisor header", () => {
    const items: AdviceItem[] = [{ priority: "low", message: "all good" }];
    expect(formatAdvice(items, null)).toMatch(/^## Session Advisor/);
  });

  it("includes recent activity when provided", () => {
    const items: AdviceItem[] = [{ priority: "low", message: "ok" }];
    const text = formatAdvice(items, "feat: add login");
    expect(text).toContain("feat: add login");
  });

  it("marks critical items with [CRITICAL]", () => {
    const items: AdviceItem[] = [
      { priority: "critical", message: "gate failed" },
    ];
    expect(formatAdvice(items, null)).toContain("[CRITICAL]");
  });

  it("marks high items with [HIGH]", () => {
    const items: AdviceItem[] = [{ priority: "high", message: "no tests" }];
    expect(formatAdvice(items, null)).toContain("[HIGH]");
  });

  it("includes action hint when provided", () => {
    const items: AdviceItem[] = [
      { priority: "medium", message: "no schema", action: "add openapi.yaml" },
    ];
    expect(formatAdvice(items, null)).toContain("add openapi.yaml");
  });
});

// ── adviseSessionHandler ──────────────────────────────────────────────

describe("adviseSessionHandler", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns ToolResult with text content", async () => {
    const result = await adviseSessionHandler({ project_dir: dir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    expect(typeof result.content[0]?.text).toBe("string");
  });

  it("output contains Session Advisor header", async () => {
    const result = await adviseSessionHandler({ project_dir: dir });
    expect(result.content[0]?.text).toContain("Session Advisor");
  });

  it("mentions missing tests for a project with package.json but no tests", async () => {
    writeFileSync(join(dir, "package.json"), "{}", "utf-8");
    const result = await adviseSessionHandler({ project_dir: dir });
    expect(result.content[0]?.text.toLowerCase()).toContain("test");
  });

  it("respects max_items parameter", async () => {
    // Create a project with many issues
    writeFileSync(join(dir, "package.json"), "{}", "utf-8");
    writeViolation(dir, "violation 1");
    writeViolation(dir, "violation 2");
    writeViolation(dir, "violation 3");
    const result = await adviseSessionHandler({
      project_dir: dir,
      max_items: 2,
    });
    // Count advice lines (lines with [CRITICAL], [HIGH], [MEDIUM], [LOW])
    const lines = result.content[0]?.text
      .split("\n")
      .filter((l) => /\[(CRITICAL|HIGH|MEDIUM|LOW)\]/.test(l));
    expect((lines ?? []).length).toBeLessThanOrEqual(2);
  });

  it("gives clean output for a well-configured project", async () => {
    touch(dir, "package.json", "{}");
    touch(dir, "CLAUDE.md", "# rules");
    touch(dir, "docs/PRD.md", "# PRD");
    touch(dir, "docs/adrs/ADR-0001.md", "# ADR");
    mkdirSync(join(dir, "tests"), { recursive: true });
    touch(dir, "openapi.yaml", "openapi: 3.0.0");
    const result = await adviseSessionHandler({ project_dir: dir });
    expect(result.content[0]?.text).toContain("[LOW]");
  });
});
