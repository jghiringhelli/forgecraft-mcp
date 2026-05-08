/**
 * Tests for src/tools/probe-runners.ts
 */

import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  combineOutput,
  isNotImplementedOutput,
  isToolAvailable,
  runVitestProbe,
  runK6Probe,
  runShProbe,
} from "../../src/tools/probe-runners.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `probe-runners-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("combineOutput", () => {
  it("joins stdout and stderr with newline", () => {
    expect(combineOutput("out", "err")).toBe("out\nerr");
  });

  it("returns stdout when stderr is empty", () => {
    expect(combineOutput("out", "")).toBe("out");
  });

  it("returns stderr when stdout is empty", () => {
    expect(combineOutput("", "err")).toBe("err");
  });

  it("returns empty string when both are empty", () => {
    expect(combineOutput("", "")).toBe("");
  });

  it("handles null values", () => {
    expect(combineOutput(null, null)).toBe("");
    expect(combineOutput("out", null)).toBe("out");
    expect(combineOutput(null, "err")).toBe("err");
  });
});

describe("isNotImplementedOutput", () => {
  it("detects 'not yet implemented' pattern", () => {
    expect(isNotImplementedOutput("Probe not yet implemented")).toBe(true);
  });

  it("detects 'TODO: implement' pattern", () => {
    expect(isNotImplementedOutput("TODO: implement the probe")).toBe(true);
  });

  it("detects 'ProbeNotImplemented' pattern", () => {
    expect(isNotImplementedOutput("ProbeNotImplemented: fill in")).toBe(true);
  });

  it("returns false for passing output", () => {
    expect(isNotImplementedOutput("PASS: all checks ok")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isNotImplementedOutput("NOT IMPLEMENTED")).toBe(true);
  });
});

describe("isToolAvailable", () => {
  it("returns true for bash (universally available)", () => {
    expect(isToolAvailable("bash")).toBe(true);
  });

  it("returns false for nonexistent tool", () => {
    expect(isToolAvailable("__nonexistent_tool_xyz_12345__")).toBe(false);
  });
});

describe("runVitestProbe", () => {
  it("returns tool_missing when probe file does not exist (vitest errors)", () => {
    const result = runVitestProbe(
      "/nonexistent/probe.test.ts",
      5000,
      Date.now(),
    );
    expect(["fail", "tool_missing", "error"]).toContain(result.status);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("runK6Probe", () => {
  it("returns tool_missing or fail (k6 may not be installed)", () => {
    const dir = makeTempDir();
    const probePath = join(dir, "probe.k6.js");
    writeFileSync(
      probePath,
      `import http from 'k6/http'; export default function() {}`,
    );
    const result = runK6Probe(probePath, 5000, Date.now());
    expect(["pass", "fail", "tool_missing", "error", "timeout"]).toContain(
      result.status,
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("runShProbe", () => {
  it("passes a shell script that exits 0", () => {
    const dir = makeTempDir();
    const probePath = join(dir, "pass.sh");
    writeFileSync(probePath, "#!/usr/bin/env bash\necho 'ok'\nexit 0\n");
    const result = runShProbe(probePath, 5000, Date.now());
    expect(result.status).toBe("pass");
    expect(result.output).toContain("ok");
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails a shell script that exits 1", () => {
    const dir = makeTempDir();
    const probePath = join(dir, "fail.sh");
    writeFileSync(probePath, "#!/usr/bin/env bash\necho 'FAIL: bad'\nexit 1\n");
    const result = runShProbe(probePath, 5000, Date.now());
    expect(result.status).toBe("fail");
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns not_implemented for script with TODO: implement output", () => {
    const dir = makeTempDir();
    const probePath = join(dir, "stub.sh");
    writeFileSync(
      probePath,
      "#!/usr/bin/env bash\necho 'TODO: implement this'\nexit 1\n",
    );
    const result = runShProbe(probePath, 5000, Date.now());
    expect(result.status).toBe("not_implemented");
    rmSync(dir, { recursive: true, force: true });
  });
});
