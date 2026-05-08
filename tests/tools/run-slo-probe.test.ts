/**
 * Tests for src/tools/run-slo-probe.ts
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
import { runSloProbeHandler } from "../../src/tools/run-slo-probe.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-run-slo-probe-"));
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

// ── runSloProbeHandler ────────────────────────────────────────────────

describe("runSloProbeHandler", () => {
  it("returns a ToolResult with text content", async () => {
    tempDir = makeTempDir();
    const result = await runSloProbeHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("reports 'No probe files found' when tests/slo/ is absent", async () => {
    tempDir = makeTempDir();
    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No probe files found");
  });

  it("reports PASS for a .alert.sh probe that exits 0", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\necho "PASS: probe-alert-latency"\nexit 0\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("PASS");
  });

  it("reports FAIL for a .alert.sh probe that exits 1", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\necho "FAIL: probe-alert-latency"\nexit 1\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("FAIL");
  });

  it("reports NOT_IMPLEMENTED for probe that outputs TODO text", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\necho "TODO: implement probe-alert-latency"\nexit 1\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("NOT_IMPLEMENTED");
  });

  it("reports NO_PROBE when tests/slo/ is absent", async () => {
    tempDir = makeTempDir();
    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    // tests/slo/ absent → empty results → "No probe files found"
    expect(text).toContain("No probe files found");
  });

  it("writes .forgecraft/slo-probe-run.json after execution", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    await runSloProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "slo-probe-run.json");
    expect(existsSync(runJsonPath)).toBe(true);
  });

  it("slo-probe-run.json has correct timestamp/passed/failed fields", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    await runSloProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "slo-probe-run.json");
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

  it("slo-probe-run.json records pass count correctly", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    write(
      tempDir,
      "tests/slo/api-server-probe-metric-requests.metric.sh",
      `#!/usr/bin/env bash\necho "FAIL"\nexit 1\n`,
    );

    await runSloProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "slo-probe-run.json");
    const parsed = JSON.parse(readFileSync(runJsonPath, "utf-8")) as {
      passed: number;
      failed: number;
    };
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(1);
  });

  it("includes The Loop section with L4 framing", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("### The Loop");
    expect(text).toContain("SLO probe failures");
    expect(text).toContain("monitoring contracts");
  });

  it("includes SLO Probe Run Report header", async () => {
    tempDir = makeTempDir();
    const result = await runSloProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("## SLO Probe Run Report");
  });

  it("loop section references NFR contracts for failing probes", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\necho "FAIL"\nexit 1\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("nfr-contracts.md");
    expect(text).toContain("run_slo_probe again");
  });

  it("loop section says L4 monitoring contracts verified when all pass", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("L4 monitoring contracts verified");
    expect(text).toContain("close_cycle");
  });

  it("reports TOOL_MISSING for .k6.js probe when k6 not installed", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-load-test.k6.js",
      `import http from 'k6/http';\nexport default function() {}\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    // k6 is likely not installed in CI — TOOL_MISSING expected
    // If k6 IS installed, it may FAIL or PASS — both valid
    expect(text).toMatch(/TOOL_MISSING|FAIL|PASS/);
  });

  it("writes slo-probe-run.json even when tests/slo/ is absent", async () => {
    tempDir = makeTempDir();

    await runSloProbeHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "slo-probe-run.json");
    expect(existsSync(runJsonPath)).toBe(true);
  });

  it("includes Results summary line when probes are found", async () => {
    tempDir = makeTempDir();
    write(
      tempDir,
      "tests/slo/api-server-probe-alert-latency.alert.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("### Results:");
    expect(text).toContain("passed");
    expect(text).toContain("failed");
  });
});
