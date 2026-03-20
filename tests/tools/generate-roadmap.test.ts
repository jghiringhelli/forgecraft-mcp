/**
 * Tests for src/tools/generate-roadmap.ts
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
import {
  generateRoadmapHandler,
  parseUseCaseTitles,
  buildRoadmapContent,
  buildSessionPromptStub,
  readProjectName,
} from "../../src/tools/generate-roadmap.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `generate-roadmap-test-${Date.now()}`);
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

/** Build the minimal passing cascade in tempDir. */
function buildCompleteCascade(dir: string): void {
  write(
    dir,
    "docs/PRD.md",
    "# My Project\n## Functional Scope\nCore behavior.\n",
  );
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(dir, "docs/diagrams/c4-context.md", "```mermaid\nC4Context\n```\n");
  write(
    dir,
    "CLAUDE.md",
    "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n",
  );
  mkdirSync(join(dir, "docs/adrs"), { recursive: true });
  write(
    dir,
    "docs/adrs/ADR-0001-stack.md",
    "# ADR-0001\n## Decision\nUse TypeScript.\n",
  );
  write(
    dir,
    "docs/use-cases.md",
    "# Use Cases\n## UC-001: Login\nActor: user\n## UC-002: Register\nActor: visitor\n",
  );
}

// ── Suite ──────────────────────────────────────────────────────────────

describe("generateRoadmapHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generate_roadmap returns error when cascade incomplete", async () => {
    // No PRD.md, no cascade artifacts
    const result = await generateRoadmapHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Cascade Incomplete");
    expect(existsSync(join(tempDir, "docs", "roadmap.md"))).toBe(false);
  });

  it("generate_roadmap writes docs/roadmap.md with Phase 1/2/3 sections", async () => {
    buildCompleteCascade(tempDir);

    const result = await generateRoadmapHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Roadmap Generated");
    expect(existsSync(join(tempDir, "docs", "roadmap.md"))).toBe(true);

    const content = readFileSync(join(tempDir, "docs", "roadmap.md"), "utf-8");
    expect(content).toContain("## Phase 1: Core Implementation");
    expect(content).toContain("## Phase 2: Integration & Quality Hardening");
    expect(content).toContain("## Phase 3: Pre-Release Hardening");
    expect(content).toContain("RM-010");
    expect(content).toContain("RM-020");
  });

  it("generate_roadmap derives UC titles from use-cases.md", async () => {
    buildCompleteCascade(tempDir);

    await generateRoadmapHandler({ project_dir: tempDir });

    const content = readFileSync(join(tempDir, "docs", "roadmap.md"), "utf-8");
    expect(content).toContain("Implement UC-001: Login");
    expect(content).toContain("Implement UC-002: Register");
    expect(content).toContain("RM-001");
    expect(content).toContain("RM-002");
  });

  it("generate_roadmap writes session prompt stubs for each Phase 1 item", async () => {
    buildCompleteCascade(tempDir);

    await generateRoadmapHandler({ project_dir: tempDir });

    const stub1 = join(tempDir, "docs", "session-prompts", "RM-001.md");
    const stub2 = join(tempDir, "docs", "session-prompts", "RM-002.md");

    expect(existsSync(stub1)).toBe(true);
    expect(existsSync(stub2)).toBe(true);

    const stub1Content = readFileSync(stub1, "utf-8");
    expect(stub1Content).toContain("Session Prompt — RM-001");
    expect(stub1Content).toContain("UC-001");
    expect(stub1Content).toContain("Acceptance Criteria");
  });

  it("generate_roadmap is idempotent (does not overwrite existing roadmap)", async () => {
    buildCompleteCascade(tempDir);

    // First generation
    await generateRoadmapHandler({ project_dir: tempDir });

    const roadmapPath = join(tempDir, "docs", "roadmap.md");
    const originalContent = readFileSync(roadmapPath, "utf-8");

    // Manually modify the file to verify it's not overwritten
    writeFileSync(roadmapPath, originalContent + "\n<!-- marker -->", "utf-8");

    // Second call — should NOT overwrite
    const result = await generateRoadmapHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Roadmap Already Exists");
    const afterContent = readFileSync(roadmapPath, "utf-8");
    expect(afterContent).toContain("<!-- marker -->");
  });
});

// ── Unit tests for helper functions ─────────────────────────────────────

describe("parseUseCaseTitles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns generic titles when use-cases.md is absent", () => {
    const titles = parseUseCaseTitles(tempDir);
    expect(titles).toHaveLength(3);
    expect(titles[0]!.title).toContain("primary");
  });

  it("parses UC headings with colon separator", () => {
    write(
      tempDir,
      "docs/use-cases.md",
      "# UCs\n## UC-001: Do thing\n## UC-002: Other thing\n",
    );
    const titles = parseUseCaseTitles(tempDir);
    expect(titles).toHaveLength(2);
    expect(titles[0]).toEqual({ id: "UC-001", title: "Do thing" });
    expect(titles[1]).toEqual({ id: "UC-002", title: "Other thing" });
  });

  it("falls back to generic when use-cases.md has no UC headings", () => {
    write(
      tempDir,
      "docs/use-cases.md",
      "# Use Cases\nSome prose without headings.\n",
    );
    const titles = parseUseCaseTitles(tempDir);
    expect(titles).toHaveLength(3);
  });
});

describe("buildRoadmapContent", () => {
  it("includes project name in the heading", () => {
    const content = buildRoadmapContent(
      "My Awesome App",
      [{ id: "UC-001", title: "Login" }],
      "docs/PRD.md",
    );
    expect(content).toContain("# My Awesome App Roadmap");
  });

  it("includes the spec file path in the footer", () => {
    const content = buildRoadmapContent(
      "App",
      [{ id: "UC-001", title: "Login" }],
      "docs/PRD.md",
    );
    expect(content).toContain("_Spec: docs/PRD.md_");
  });
});

describe("buildSessionPromptStub", () => {
  it("includes the RM id and UC id in the stub", () => {
    const stub = buildSessionPromptStub(
      "RM-001",
      "Implement UC-001: Login",
      "UC-001",
    );
    expect(stub).toContain("Session Prompt — RM-001");
    expect(stub).toContain("UC-001 is fully implemented");
    expect(stub).toContain("generate_session_prompt");
  });
});

describe("readProjectName", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads project_name from forgecraft.yaml", () => {
    write(
      tempDir,
      "forgecraft.yaml",
      "project_name: Awesome Project\ntags: []\n",
    );
    expect(readProjectName(tempDir)).toBe("Awesome Project");
  });

  it("falls back to PRD.md first heading", () => {
    write(tempDir, "docs/PRD.md", "# Cool Product\n## Scope\n...\n");
    expect(readProjectName(tempDir)).toBe("Cool Product");
  });

  it("falls back to directory name when no config or PRD", () => {
    const name = readProjectName(tempDir);
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });
});
