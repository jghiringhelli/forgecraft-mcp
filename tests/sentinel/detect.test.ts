import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectSentinel } from "../../src/sentinel/detect.js";

describe("detectSentinel", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forgecraft-sentinel-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns none-found and an empty list for a repo with no sentinels", () => {
    const result = detectSentinel(tempDir);
    expect(result.foundFiles).toEqual([]);
    expect(result.primaryFile).toBeNull();
    expect(result.recommendation).toBe("none-found");
  });

  it("returns CLAUDE.md as primaryFile when CLAUDE.md is the only sentinel", () => {
    writeFileSync(join(tempDir, "CLAUDE.md"), "# project rules\n");

    const result = detectSentinel(tempDir);
    expect(result.primaryFile).toBe("CLAUDE.md");
    expect(result.foundFiles).toHaveLength(1);
    expect(result.foundFiles[0]?.path).toBe("CLAUDE.md");
    expect(result.foundFiles[0]?.sizeBytes).toBeGreaterThan(0);
    expect(result.recommendation).toBe("map");
  });
});
