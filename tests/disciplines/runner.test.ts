import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectApplicableDisciplines,
  scoreApplicableDisciplines,
} from "../../src/disciplines/runner.js";

describe("disciplines runner", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forgecraft-disciplines-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("an empty repo applies no disciplines", () => {
    const detected = detectApplicableDisciplines(tempDir);
    const applying = detected.filter((d) => d.applies);
    expect(applying).toEqual([]);

    const scored = scoreApplicableDisciplines(tempDir);
    expect(scored).toEqual([]);
  });
});
