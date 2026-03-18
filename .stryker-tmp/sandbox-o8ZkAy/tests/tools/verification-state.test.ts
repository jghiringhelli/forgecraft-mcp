/**
 * Tests for record_verification and get_verification_status handlers.
 */
// @ts-nocheck

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recordVerificationHandler,
  getVerificationStatusHandler,
} from "../../src/tools/verification-state.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-vstate-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("recordVerificationHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("records a step and returns confirmation text", async () => {
    const result = await recordVerificationHandler({
      project_dir: tempDir,
      tags: ["UNIVERSAL"],
      strategy_tag: "UNIVERSAL",
      phase_id: "contract-definition",
      step_id: "write-hurl-spec",
      status: "pass",
      notes: "All contracts verified",
    });
    expect(result.content[0]!.text).toContain("Verification Step Recorded");
  });

  it("shows S_realized in Updated Progress section", async () => {
    const result = await recordVerificationHandler({
      project_dir: tempDir,
      tags: ["UNIVERSAL"],
      strategy_tag: "UNIVERSAL",
      phase_id: "contract-definition",
      step_id: "write-hurl-spec",
      status: "pass",
    });
    expect(result.content[0]!.text).toContain("S=");
  });
});

describe("getVerificationStatusHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns Not Initialized when no state file exists", async () => {
    const result = await getVerificationStatusHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("Not Initialized");
  });

  it("returns status after recording a step", async () => {
    await recordVerificationHandler({
      project_dir: tempDir,
      tags: ["UNIVERSAL"],
      strategy_tag: "UNIVERSAL",
      phase_id: "contract-definition",
      step_id: "write-hurl-spec",
      status: "pass",
    });
    const result = await getVerificationStatusHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("Verification Status");
    expect(result.content[0]!.text).toContain("[UNIVERSAL]");
  });
});
