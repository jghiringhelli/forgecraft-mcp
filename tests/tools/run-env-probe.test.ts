/**
 * Tests for src/tools/run-env-probe.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runEnvProbeHandler } from "../../src/tools/run-env-probe.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-run-env-probe-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── runEnvProbeHandler ────────────────────────────────────────────────

describe("runEnvProbeHandler", () => {
  it("returns a ToolResult with text content", async () => {
    tempDir = makeTempDir();
    const result = await runEnvProbeHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("reports 'No probe files found' when tests/env/ is absent", async () => {
    tempDir = makeTempDir();
    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No probe files found");
  });

  it("reports PASS for a .health.sh probe that exits 0", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\necho "PASS: probe-health"\nexit 0\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("PASS");
  });

  it("reports FAIL for a .health.sh probe that exits 1", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\necho "FAIL: probe-health"\nexit 1\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("FAIL");
  });

  it("reports NOT_IMPLEMENTED for probe that outputs TODO text", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\necho "TODO: implement probe-health"\nexit 1\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("NOT_IMPLEMENTED");
  });

  it("reports NO_PROBE when tests/env/ exists but is empty", async () => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, "tests", "env"), { recursive: true });

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No probe files found");
  });

  it("writes .forgecraft/env-probe-run.json after execution", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    await runEnvProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "env-probe-run.json");
    expect(existsSync(runJsonPath)).toBe(true);
  });

  it("env-probe-run.json has correct timestamp/passed/failed fields", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    await runEnvProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "env-probe-run.json");
    const parsed = JSON.parse(readFileSync(runJsonPath, "utf-8")) as {
      timestamp: string;
      passed: number;
      failed: number;
      results: unknown[];
    };
    expect(typeof parsed.timestamp).toBe("string");
    expect(typeof parsed.passed).toBe("number");
    expect(typeof parsed.failed).toBe("number");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("env-probe-run.json records pass count correctly", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    write(
      tempDir,
      "tests/env/api-server-probe-env-vars.env.sh",
      `#!/usr/bin/env bash\necho "FAIL"\nexit 1\n`,
    );

    await runEnvProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "env-probe-run.json");
    const parsed = JSON.parse(readFileSync(runJsonPath, "utf-8")) as {
      passed: number;
      failed: number;
    };
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(1);
  });

  it("includes Tool Availability section", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("### Tool Availability");
  });

  it("includes The Loop section", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("### The Loop");
  });

  it("includes Env Probe Run Report header", async () => {
    tempDir = makeTempDir();
    const result = await runEnvProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("## Env Probe Run Report");
  });

  it("includes Results summary line when probes are found", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("### Results:");
    expect(text).toContain("passed");
    expect(text).toContain("failed");
  });

  it("loop section says environment contracts when all probes pass", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("L3 environment contracts verified");
    expect(text).toContain("close_cycle");
  });

  it("loop section references .forgecraft/env/ for failing probes", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\necho "FAIL"\nexit 1\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain(".forgecraft/env/");
    expect(text).toContain("run_env_probe again");
  });

  it("writes env-probe-run.json even when tests/env/ is absent", async () => {
    tempDir = makeTempDir();

    await runEnvProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "env-probe-run.json");
    expect(existsSync(runJsonPath)).toBe(true);
  });

  it("includes curl in tool availability check", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/env/api-server-probe-health.health.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runEnvProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("curl");
  });
});
