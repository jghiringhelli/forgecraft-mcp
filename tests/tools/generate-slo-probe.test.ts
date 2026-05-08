/**
 * Tests for src/tools/generate-slo-probe.ts
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
import { generateSloProbeHandler } from "../../src/tools/generate-slo-probe.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-gen-slo-probe-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

// ── Spec fixtures ─────────────────────────────────────────────────────

const ALERT_EXISTS_SPEC = `service: api-server
title: API Server SLO Contracts
nfr_source: docs/nfr-contracts.md
probes:
  - id: probe-alert-latency
    type: alert_exists
    description: p99 latency alert exists in alertmanager
    alert_name: "HighLatencyP99"
`;

const METRIC_PRESENT_SPEC = `service: api-server
title: API Server SLO Contracts
probes:
  - id: probe-metric-requests
    type: metric_present
    description: request_count metric is present in Prometheus
    metric: "http_requests_total"
`;

const SLO_ASSERTION_SPEC = `service: api-server
title: API Server SLO Contracts
probes:
  - id: probe-slo-availability
    type: slo_assertion
    description: Availability >= 99.9% over 30d rolling window
    query: "availability_30d"
    threshold: 0.999
    operator: ">="
`;

const SYNTHETIC_LOAD_SPEC = `service: api-server
title: API Server SLO Contracts
probes:
  - id: probe-load-test
    type: synthetic_load
    description: p95 latency < 500ms under load
`;

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── generateSloProbeHandler ───────────────────────────────────────────

describe("generateSloProbeHandler", () => {
  it("returns a ToolResult with text content when no .forgecraft/slo/ dir exists", async () => {
    tempDir = makeTempDir();
    const result = await generateSloProbeHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("reports 'no SLO probe specs' when .forgecraft/slo/ is absent", async () => {
    tempDir = makeTempDir();
    const result = await generateSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No SLO probe specs found");
  });

  it("generates a .alert.sh probe for an alert_exists spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    const result = await generateSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "slo",
      "api-server-probe-alert-latency.alert.sh",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("generates a .metric.sh probe for a metric_present spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", METRIC_PRESENT_SPEC);

    const result = await generateSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "slo",
      "api-server-probe-metric-requests.metric.sh",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("generates a .slo.sh probe for an slo_assertion spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", SLO_ASSERTION_SPEC);

    const result = await generateSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "slo",
      "api-server-probe-slo-availability.slo.sh",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("generates a .k6.js probe for a synthetic_load spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", SYNTHETIC_LOAD_SPEC);

    const result = await generateSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "slo",
      "api-server-probe-load-test.k6.js",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("skips existing files when force=false", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    // First generation
    await generateSloProbeHandler({ project_dir: tempDir });

    // Overwrite with sentinel
    const probePath = join(
      tempDir,
      "tests",
      "slo",
      "api-server-probe-alert-latency.alert.sh",
    );
    writeFileSync(probePath, "# EXISTING CONTENT", "utf-8");

    // Second run without force
    await generateSloProbeHandler({ project_dir: tempDir });
    const content = readFileSync(probePath, "utf-8");
    expect(content).toBe("# EXISTING CONTENT");
  });

  it("overwrites when force=true", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    // Pre-create file with sentinel
    mkdirSync(join(tempDir, "tests", "slo"), { recursive: true });
    const probePath = join(
      tempDir,
      "tests",
      "slo",
      "api-server-probe-alert-latency.alert.sh",
    );
    writeFileSync(probePath, "# OLD CONTENT", "utf-8");

    const result = await generateSloProbeHandler({
      project_dir: tempDir,
      force: true,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("Generated: 1");

    const content = readFileSync(probePath, "utf-8");
    expect(content).not.toBe("# OLD CONTENT");
  });

  it("creates tests/slo/ directory when absent", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    expect(existsSync(join(tempDir, "tests", "slo"))).toBe(false);
    await generateSloProbeHandler({ project_dir: tempDir });
    expect(existsSync(join(tempDir, "tests", "slo"))).toBe(true);
  });

  it(".alert.sh has correct shebang, set -euo pipefail, and PROMETHEUS_URL default", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    await generateSloProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(tempDir, "tests", "slo", "api-server-probe-alert-latency.alert.sh"),
      "utf-8",
    );
    expect(content).toContain("#!/usr/bin/env bash");
    expect(content).toContain("set -euo pipefail");
    expect(content).toContain("PROMETHEUS_URL");
  });

  it(".metric.sh references the metric name from spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", METRIC_PRESENT_SPEC);

    await generateSloProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(
        tempDir,
        "tests",
        "slo",
        "api-server-probe-metric-requests.metric.sh",
      ),
      "utf-8",
    );
    expect(content).toContain("http_requests_total");
  });

  it(".slo.sh references threshold from spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", SLO_ASSERTION_SPEC);

    await generateSloProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(tempDir, "tests", "slo", "api-server-probe-slo-availability.slo.sh"),
      "utf-8",
    );
    expect(content).toContain("0.999");
  });

  it(".k6.js has k6/http import and thresholds", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", SYNTHETIC_LOAD_SPEC);

    await generateSloProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(tempDir, "tests", "slo", "api-server-probe-load-test.k6.js"),
      "utf-8",
    );
    expect(content).toContain("k6/http");
    expect(content).toContain("thresholds");
  });

  it("report has To run: call run_slo_probe footer", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    const result = await generateSloProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("run_slo_probe");
  });

  it("report shows Skipped count when files already exist", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/slo/api-server.yaml", ALERT_EXISTS_SPEC);

    await generateSloProbeHandler({ project_dir: tempDir });
    const result = await generateSloProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Skipped: 1");
  });
});
