/**
 * Tests for the classify_project tool handler.
 */
// @ts-nocheck

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyProjectHandler } from "../../src/tools/classify.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-classify-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("classifyProjectHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("always suggests UNIVERSAL tag", async () => {
    const result = await classifyProjectHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("[UNIVERSAL]");
  });

  it("detects WEB-REACT from package.json with react dependency", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
      }),
    );
    const result = await classifyProjectHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("WEB-REACT");
  });

  it("infers tags from description text", async () => {
    const result = await classifyProjectHandler({
      description: "A REST API backend using Express and PostgreSQL",
    });
    expect(result.content[0]!.text).toContain("API");
  });

  it("lists all available tags in output", async () => {
    const result = await classifyProjectHandler({});
    expect(result.content[0]!.text).toContain("All Available Tags");
  });
});
