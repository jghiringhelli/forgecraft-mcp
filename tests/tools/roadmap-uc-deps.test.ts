/**
 * Tests for UC dependency inference in roadmap-builder.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  inferUcDependencies,
  buildRoadmapContent,
} from "../../src/tools/roadmap-builder.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-rdmap-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeUcFile(dir: string, ucId: string, content: string): void {
  const ucDir = join(dir, "docs", "use-cases");
  mkdirSync(ucDir, { recursive: true });
  writeFileSync(join(ucDir, `${ucId}-test.md`), content, "utf-8");
}

function writeUcMono(dir: string, content: string): void {
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "use-cases.md"), content, "utf-8");
}

describe("inferUcDependencies", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const ucItems = [
    { id: "UC-001", title: "Create Project" },
    { id: "UC-002", title: "Upload Documents" },
    { id: "UC-003", title: "Run Survey" },
    { id: "UC-004", title: "Run Diagnosis" },
  ] as const;

  it("returns empty map when no UC files exist", () => {
    const deps = inferUcDependencies(tempDir, ucItems);
    expect(deps.size).toBe(0);
  });

  it("returns empty map when UC files have no cross-references", () => {
    writeUcFile(
      tempDir,
      "UC-001",
      "# UC-001: Create Project\n\nNo dependencies.",
    );
    writeUcFile(
      tempDir,
      "UC-002",
      "# UC-002: Upload Documents\n\nNo dependencies.",
    );
    const deps = inferUcDependencies(tempDir, ucItems);
    expect(deps.has("UC-001")).toBe(false);
    expect(deps.has("UC-002")).toBe(false);
  });

  it("detects explicit UC reference in canonical file", () => {
    writeUcFile(
      tempDir,
      "UC-004",
      "# UC-004: Run Diagnosis\n\nPrecondition: UC-001 must be complete.\nAlso requires UC-002 and UC-003.",
    );
    const deps = inferUcDependencies(tempDir, ucItems);
    expect(deps.has("UC-004")).toBe(true);
    const uc4Deps = deps.get("UC-004")!;
    expect(uc4Deps).toContain("RM-001");
    expect(uc4Deps).toContain("RM-002");
    expect(uc4Deps).toContain("RM-003");
  });

  it("does not include self-reference", () => {
    writeUcFile(
      tempDir,
      "UC-001",
      "# UC-001: Create Project\n\nThis is UC-001. It depends on nothing.",
    );
    const deps = inferUcDependencies(tempDir, ucItems);
    expect(deps.has("UC-001")).toBe(false);
  });

  it("maps UC IDs to correct RM IDs by position", () => {
    writeUcFile(tempDir, "UC-004", "# UC-004\n\nRequires UC-001.");
    const deps = inferUcDependencies(tempDir, ucItems);
    const uc4Deps = deps.get("UC-004")!;
    expect(uc4Deps).toContain("RM-001"); // UC-001 is index 0 → RM-001
  });

  it("handles monolith use-cases.md", () => {
    const monoContent = [
      "# Use Cases",
      "",
      "## UC-001: Create Project",
      "No dependencies.",
      "",
      "## UC-004: Run Diagnosis",
      "Preconditions: UC-001 and UC-002 must be complete.",
    ].join("\n");
    writeUcMono(tempDir, monoContent);
    const deps = inferUcDependencies(tempDir, ucItems);
    expect(deps.has("UC-004")).toBe(true);
    expect(deps.get("UC-004")).toContain("RM-001");
  });

  it("ignores references to UC IDs not in ucItems", () => {
    writeUcFile(
      tempDir,
      "UC-004",
      "# UC-004\n\nRequires UC-999 (external system).",
    );
    const deps = inferUcDependencies(tempDir, ucItems);
    expect(deps.has("UC-004")).toBe(false);
  });
});

describe("buildRoadmapContent with dependency inference", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("Phase 1 rows show — when no UC files present", () => {
    const ucItems = [
      { id: "UC-001", title: "Create Project" },
      { id: "UC-002", title: "Upload Documents" },
    ];
    const content = buildRoadmapContent(
      "Test",
      ucItems,
      "docs/PRD.md",
      [],
      tempDir,
    );
    expect(content).toContain(
      "| RM-001 | Implement UC-001: Create Project | — |",
    );
    expect(content).toContain(
      "| RM-002 | Implement UC-002: Upload Documents | — |",
    );
  });

  it("Phase 1 rows show inferred dependencies when UC files present", () => {
    const ucItems = [
      { id: "UC-001", title: "Create Project" },
      { id: "UC-004", title: "Run Diagnosis" },
    ];
    const ucDir = join(tempDir, "docs", "use-cases");
    mkdirSync(ucDir, { recursive: true });
    writeFileSync(
      join(ucDir, "UC-004-run-diagnosis.md"),
      "# UC-004: Run Diagnosis\n\nRequires UC-001.",
    );
    const content = buildRoadmapContent(
      "Test",
      ucItems,
      "docs/PRD.md",
      [],
      tempDir,
    );
    expect(content).toContain(
      "| RM-002 | Implement UC-004: Run Diagnosis | RM-001 |",
    );
  });

  it("produces valid roadmap without projectDir (backward compatible)", () => {
    const ucItems = [{ id: "UC-001", title: "Create Project" }];
    const content = buildRoadmapContent("Test", ucItems, "docs/PRD.md");
    expect(content).toContain("RM-001");
    expect(content).toContain("— |");
  });
});
