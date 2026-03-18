/**
 * Tests for the convert_existing tool handler.
 */
// @ts-nocheck

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertExistingHandler } from "../../src/tools/convert.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-convert-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("convertExistingHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a Conversion Plan heading", async () => {
    const result = await convertExistingHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      scan_depth: "quick",
    });
    expect(result.content[0]!.text).toContain("# Conversion Plan");
  });

  it("includes target tags in output", async () => {
    const result = await convertExistingHandler({
      tags: ["UNIVERSAL", "API"],
      project_dir: tempDir,
      scan_depth: "quick",
    });
    expect(result.content[0]!.text).toContain("[API]");
  });

  it("includes at least one migration phase", async () => {
    const result = await convertExistingHandler({
      tags: ["UNIVERSAL"],
      project_dir: tempDir,
      scan_depth: "quick",
    });
    expect(result.content[0]!.text).toMatch(/Phase \d+:/);
  });
});
