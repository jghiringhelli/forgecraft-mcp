/**
 * run_slo_probe tool handler.
 *
 * Scans tests/slo/ for probe files, executes each (.sh via bash, .k6.js via k6),
 * reports PASS/FAIL/TOOL_MISSING/NOT_IMPLEMENTED/NO_PROBE/TIMEOUT/ERROR.
 * Writes .forgecraft/slo-probe-run.json after execution.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  isToolAvailable,
  isNotImplementedOutput,
  combineOutput,
} from "./probe-runners.js";
import type { ToolResult } from "../shared/types.js";
import type { ProbeStatus } from "./run-harness.js";

// ── Schema ───────────────────────────────────────────────────────────

export const runSloProbeSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  timeout_ms: z
    .number()
    .optional()
    .describe("Timeout per probe in ms. Default: 15000."),
});

export type RunSloProbeInput = z.infer<typeof runSloProbeSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface SloProbeResult {
  service: string;
  probeId: string;
  probeFile: string | null;
  probeType: string;
  status: ProbeStatus;
  durationMs: number;
  output?: string;
}

export interface SloProbeRunJson {
  timestamp: string;
  passed: number;
  failed: number;
  errors: number;
  notFound: number;
  results: Array<{
    service: string;
    probeId: string;
    status: string;
    durationMs: number;
  }>;
}

// ── Probe file parsing ────────────────────────────────────────────────

export function parseSloProbeFileName(fileName: string): {
  service: string;
  probeId: string;
  probeType: string;
} {
  const typeMap: Record<string, string> = {
    ".alert.sh": "alert_exists",
    ".metric.sh": "metric_present",
    ".dashboard.sh": "dashboard_exists",
    ".slo.sh": "slo_assertion",
    ".k6.js": "synthetic_load",
  };

  let probeType = "unknown";
  let baseName = fileName;

  for (const [ext, type] of Object.entries(typeMap)) {
    if (fileName.endsWith(ext)) {
      probeType = type;
      baseName = fileName.slice(0, fileName.length - ext.length);
      break;
    }
  }
  if (probeType === "unknown" && fileName.endsWith(".sh")) {
    baseName = fileName.slice(0, -3);
  }

  const probeIdx = baseName.indexOf("-probe-");
  if (probeIdx !== -1) {
    return {
      service: baseName.slice(0, probeIdx),
      probeId: baseName.slice(probeIdx + 1),
      probeType,
    };
  }

  return { service: baseName, probeId: "unknown", probeType };
}

// ── Probe execution ───────────────────────────────────────────────────

function runSloProbeFile(
  probePath: string,
  fileName: string,
  timeoutMs: number,
): { status: ProbeStatus; durationMs: number; output: string } {
  const start = Date.now();

  if (fileName.endsWith(".k6.js")) {
    if (!isToolAvailable("k6")) {
      return {
        status: "tool_missing",
        durationMs: Date.now() - start,
        output: "k6 not found (install: https://k6.io)",
      };
    }
    try {
      const result = spawnSync("k6", ["run", probePath], {
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      });
      const durationMs = Date.now() - start;
      const output = combineOutput(result.stdout, result.stderr);
      if (result.error?.message?.includes("ENOENT")) {
        return { status: "tool_missing", durationMs, output: "k6 not found" };
      }
      if (
        result.signal === "SIGTERM" ||
        result.error?.message?.includes("ETIMEDOUT")
      ) {
        return { status: "timeout", durationMs, output: "timed out" };
      }
      return {
        status: result.status === 0 ? "pass" : "fail",
        durationMs,
        output,
      };
    } catch (err) {
      return {
        status: "error",
        durationMs: Date.now() - start,
        output: String(err),
      };
    }
  }

  // All .sh files run via bash
  try {
    const result = spawnSync("bash", [probePath], {
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    const durationMs = Date.now() - start;
    const output = combineOutput(result.stdout, result.stderr);
    if (result.error?.message?.includes("ENOENT")) {
      return { status: "tool_missing", durationMs, output: "bash not found" };
    }
    if (
      result.signal === "SIGTERM" ||
      result.error?.message?.includes("ETIMEDOUT")
    ) {
      return { status: "timeout", durationMs, output: "timed out" };
    }
    if (isNotImplementedOutput(output)) {
      return { status: "not_implemented", durationMs, output };
    }
    return {
      status: result.status === 0 ? "pass" : "fail",
      durationMs,
      output,
    };
  } catch (err) {
    return {
      status: "error",
      durationMs: Date.now() - start,
      output: String(err),
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────

export async function runSloProbeHandler(
  args: RunSloProbeInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const timeoutMs = args.timeout_ms ?? 15000;

  const sloDir = join(projectDir, "tests", "slo");

  if (!existsSync(sloDir)) {
    const timestamp = new Date().toISOString();
    writeSloProbeRunJson(projectDir, timestamp, []);
    return {
      content: [
        {
          type: "text",
          text: formatSloRunReport([], timestamp),
        },
      ],
    };
  }

  let probeFiles: string[] = [];
  try {
    probeFiles = readdirSync(sloDir).filter(
      (f) => f.endsWith(".sh") || f.endsWith(".k6.js"),
    );
  } catch {
    probeFiles = [];
  }

  const results: SloProbeResult[] = [];

  if (probeFiles.length === 0) {
    const timestamp = new Date().toISOString();
    writeSloProbeRunJson(projectDir, timestamp, []);
    return {
      content: [
        {
          type: "text",
          text: formatSloRunReport([], timestamp),
        },
      ],
    };
  }

  for (const fileName of probeFiles) {
    const { service, probeId, probeType } = parseSloProbeFileName(fileName);
    const probePath = join(sloDir, fileName);
    const run = runSloProbeFile(probePath, fileName, timeoutMs);
    results.push({
      service,
      probeId,
      probeFile: fileName,
      probeType,
      ...run,
    });
  }

  const timestamp = new Date().toISOString();
  writeSloProbeRunJson(projectDir, timestamp, results);

  return {
    content: [{ type: "text", text: formatSloRunReport(results, timestamp) }],
  };
}

// ── JSON writer ───────────────────────────────────────────────────────

function writeSloProbeRunJson(
  projectDir: string,
  timestamp: string,
  results: SloProbeResult[],
): void {
  try {
    const dir = join(projectDir, ".forgecraft");
    mkdirSync(dir, { recursive: true });
    const runJson: SloProbeRunJson = {
      timestamp,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      errors: results.filter((r) =>
        ["error", "tool_missing", "not_implemented", "timeout"].includes(
          r.status,
        ),
      ).length,
      notFound: results.filter((r) => r.status === "no_probe").length,
      results: results.map((r) => ({
        service: r.service,
        probeId: r.probeId,
        status: r.status,
        durationMs: r.durationMs,
      })),
    };
    writeFileSync(
      join(dir, "slo-probe-run.json"),
      JSON.stringify(runJson, null, 2),
      "utf-8",
    );
  } catch {
    /* non-throwing */
  }
}

// ── Report formatter ──────────────────────────────────────────────────

function formatSloRunReport(
  results: SloProbeResult[],
  timestamp: string,
): string {
  if (results.length === 0) {
    return [
      "## SLO Probe Run Report",
      `_Executed: ${timestamp}_`,
      "",
      "No probe files found. Run `generate_slo_probe` first.",
      "",
      buildSloLoopInstructions([]).join("\n"),
    ].join("\n");
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const errors = results.filter((r) =>
    ["error", "tool_missing", "not_implemented", "timeout"].includes(r.status),
  ).length;
  const notFound = results.filter((r) => r.status === "no_probe").length;

  const lines: string[] = [
    "## SLO Probe Run Report",
    `_Executed: ${timestamp}_`,
    "",
    `### Results: ${passed} passed / ${failed} failed / ${errors} errors / ${notFound} not found`,
    "",
    "| Service | Probe | Type | File | Status | Duration |",
    "|---|---|---|---|---|---|",
  ];

  for (const r of results) {
    const dur = r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : "—";
    lines.push(
      `| ${r.service} | ${r.probeId} | ${r.probeType} | ${r.probeFile ?? "—"} | ${formatSloStatus(r.status)} | ${dur} |`,
    );
  }

  lines.push(...buildSloLoopInstructions(results));

  return lines.join("\n");
}

function buildSloLoopInstructions(results: SloProbeResult[]): string[] {
  const lines: string[] = [
    "",
    "### The Loop",
    "",
    "**SLO probe failures mean monitoring contracts are not verified — regenerate from NFR contracts, not patch dashboards.**",
    "",
  ];

  const failed = results.filter((r) => r.status === "fail");
  const notImpl = results.filter((r) => r.status === "not_implemented");
  const noProbe = results.filter((r) => r.status === "no_probe");
  const allPassing =
    results.length > 0 && results.every((r) => r.status === "pass");

  if (failed.length > 0) {
    lines.push(
      `❌ ${failed.length} probe${failed.length === 1 ? "" : "s"} failed — for each failing probe:`,
      "  1. Read the NFR contract in docs/nfr-contracts.md",
      "  2. Read the SLO spec in .forgecraft/slo/{service}.yaml",
      "  3. Update Prometheus rules / Grafana dashboards / alertmanager config to match contracts",
      "  4. Call run_slo_probe again — repeat until green",
      "",
    );
  }

  if (notImpl.length > 0) {
    lines.push(
      `⚠️ ${notImpl.length} probe${notImpl.length === 1 ? "" : "s"} not yet implemented — fill in the TODO sections:`,
    );
    for (const r of notImpl) {
      lines.push(
        `  - tests/slo/${r.probeFile ?? r.probeId}: implement the actual check`,
      );
    }
    lines.push("");
  }

  if (noProbe.length > 0) {
    lines.push(
      `📋 ${noProbe.length} service${noProbe.length === 1 ? "" : "s"} have no probe files — run:`,
      "  generate_slo_probe (scaffolds probe files from .forgecraft/slo/ specs)",
      "  Then implement the TODO sections",
      "",
    );
  }

  if (allPassing) {
    lines.push(
      "✅ All SLO probes passing — L4 monitoring contracts verified.",
      "  Call close_cycle to evaluate gates and advance the cycle.",
    );
  } else if (results.length > 0) {
    lines.push("Run layer_status to see full coverage picture.");
  }

  return lines;
}

function formatSloStatus(status: ProbeStatus): string {
  const map: Record<ProbeStatus, string> = {
    pass: "✅ PASS",
    fail: "❌ FAIL",
    tool_missing: "⚠️ TOOL_MISSING",
    not_implemented: "⏳ NOT_IMPLEMENTED",
    timeout: "⏱ TIMEOUT",
    no_probe: "❌ NO_PROBE",
    error: "⚠️ ERROR",
  };
  return map[status] ?? status;
}
