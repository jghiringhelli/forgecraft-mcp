/**
 * Tests for src/shared/drift-detector.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectSpecRoadmapDrift } from "../../src/shared/drift-detector.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-drift-test-${Date.now()}`);
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

/** Set mtime of a file to a specific epoch ms. */
function setMtime(filePath: string, mtimeMs: number): void {
  const t = new Date(mtimeMs);
  utimesSync(filePath, t, t);
}

describe("detectSpecRoadmapDrift", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns driftDetected: false when no spec file exists", () => {
    write(tempDir, "docs/roadmap.md", "# Roadmap\n");
    const result = detectSpecRoadmapDrift(tempDir);
    expect(result.driftDetected).toBe(false);
  });

  it("returns driftDetected: false when no roadmap exists", () => {
    write(tempDir, "docs/PRD.md", "# PRD\n");
    const result = detectSpecRoadmapDrift(tempDir);
    expect(result.driftDetected).toBe(false);
  });

  it("returns driftDetected: true when spec is newer than roadmap", () => {
    write(tempDir, "docs/PRD.md", "# PRD\n");
    write(tempDir, "docs/roadmap.md", "# Roadmap\n");

    const roadmapPath = join(tempDir, "docs", "roadmap.md");
    const specPath = join(tempDir, "docs", "PRD.md");
    const baseTime = Date.now() - 10000;
    setMtime(roadmapPath, baseTime);
    setMtime(specPath, baseTime + 5000);

    const result = detectSpecRoadmapDrift(tempDir);
    expect(result.driftDetected).toBe(true);
    expect(result.message).toContain("⚠️ Spec drift:");
    expect(result.message).toContain("PRD.md");
    expect(result.message).toContain("roadmap.md");
    expect(result.specModifiedAt).toBeDefined();
    expect(result.roadmapModifiedAt).toBeDefined();
  });

  it("returns driftDetected: false when roadmap is newer than spec", () => {
    write(tempDir, "docs/PRD.md", "# PRD\n");
    write(tempDir, "docs/roadmap.md", "# Roadmap\n");

    const roadmapPath = join(tempDir, "docs", "roadmap.md");
    const specPath = join(tempDir, "docs", "PRD.md");
    const baseTime = Date.now() - 10000;
    setMtime(specPath, baseTime);
    setMtime(roadmapPath, baseTime + 5000);

    const result = detectSpecRoadmapDrift(tempDir);
    expect(result.driftDetected).toBe(false);
  });

  it("resolves spec from forgecraft.yaml spec_path when present", () => {
    const specContent = "# My Spec\nSome content.\n";
    write(tempDir, "specs/myspec.md", specContent);
    write(tempDir, "docs/roadmap.md", "# Roadmap\n");
    write(
      tempDir,
      "forgecraft.yaml",
      "spec_path: specs/myspec.md\ntags:\n  - UNIVERSAL\n",
    );

    const roadmapPath = join(tempDir, "docs", "roadmap.md");
    const specPath = join(tempDir, "specs", "myspec.md");
    const baseTime = Date.now() - 10000;
    setMtime(roadmapPath, baseTime);
    setMtime(specPath, baseTime + 5000);

    const result = detectSpecRoadmapDrift(tempDir);
    expect(result.driftDetected).toBe(true);
    expect(result.message).toContain("myspec.md");
  });

  it("resolves spec from docs/specs/ when no spec_path configured", () => {
    write(tempDir, "docs/specs/feature.md", "# Feature Spec\n");
    write(tempDir, "docs/roadmap.md", "# Roadmap\n");

    const roadmapPath = join(tempDir, "docs", "roadmap.md");
    const specPath = join(tempDir, "docs", "specs", "feature.md");
    const baseTime = Date.now() - 10000;
    setMtime(roadmapPath, baseTime);
    setMtime(specPath, baseTime + 5000);

    const result = detectSpecRoadmapDrift(tempDir);
    expect(result.driftDetected).toBe(true);
    expect(result.message).toContain("feature.md");
  });
});
