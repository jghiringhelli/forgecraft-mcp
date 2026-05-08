/**
 * run_env_probe tool handler.
 *
 * Scans tests/env/ for probe files, executes each via bash,
 * reports PASS/FAIL/TOOL_MISSING/NOT_IMPLEMENTED/NO_PROBE/TIMEOUT/ERROR.
 * Writes .forgecraft/env-probe-run.json after execution.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  isToolAvailable,
  isNotImplementedOutput,
  combineOutput,
} from "./probe-runners.js";
import { spawnSync } from "node:child_process";
import type { ToolResult } from "../shared/types.js";
import type { ProbeStatus } from "./run-harness.js";

// ── Schema ───────────────────────────────────────────────────────────

export const runEnvProbeSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  timeout_ms: z
    .number()
    .optional()
    .describe("Timeout per probe in ms. Default: 15000."),
  env: z
    .record(z.string())
    .optional()
    .describe(
      "Extra environment variables to pass to probe scripts (e.g. API_URL).",
    ),
});

export type RunEnvProbeInput = z.infer<typeof runEnvProbeSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface EnvProbeResult {
  service: string;
  probeId: string;
  probeFile: string | null;
  probeType: string;
  status: ProbeStatus;
  durationMs: number;
  output?: string;
}

export interface EnvProbeRunJson {
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

/**
 * Parse a probe filename like "service-name-probe-id.health.sh" back into
 * service + probeId + probeType components.
 */
export function parseEnvProbeFileName(fileName: string): {
  service: string;
  probeId: string;
  probeType: string;
} {
  // Extension → type mapping
  const typeMap: Record<string, string> = {
    ".health.sh": "health_check",
    ".env.sh": "env_var",
    ".port.sh": "port_check",
    ".schema.sh": "schema_validate",
    ".docker.sh": "docker_check",
    ".migration.sh": "migration_check",
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

  // Split "service-probe-id" — convention: probe id starts with "probe-"
  const probeIdx = baseName.indexOf("-probe-");
  if (probeIdx !== -1) {
    return {
      service: baseName.slice(0, probeIdx),
      probeId: baseName.slice(probeIdx + 1), // "probe-..."
      probeType,
    };
  }

  // Fallback: use whole baseName as service, unknown probe id
  return { service: baseName, probeId: "unknown", probeType };
}

// ── Probe execution ───────────────────────────────────────────────────

function runEnvProbeSh(
  probePath: string,
  timeoutMs: number,
  extraEnv?: Record<string, string>,
): { status: ProbeStatus; durationMs: number; output: string } {
  const start = Date.now();
  try {
    const result = spawnSync("bash", [probePath], {
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      env: { ...process.env, ...(extraEnv ?? {}) },
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

export async function runEnvProbeHandler(
  args: RunEnvProbeInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const timeoutMs = args.timeout_ms ?? 15000;

  const envDir = join(projectDir, "tests", "env");

  if (!existsSync(envDir)) {
    const timestamp = new Date().toISOString();
    writeEnvProbeRunJson(projectDir, timestamp, []);
    return {
      content: [
        {
          type: "text",
          text: formatEnvRunReport([], timestamp),
        },
      ],
    };
  }

  let probeFiles: string[] = [];
  try {
    probeFiles = readdirSync(envDir).filter((f) => f.endsWith(".sh"));
  } catch {
    probeFiles = [];
  }

  const results: EnvProbeResult[] = [];

  if (probeFiles.length === 0) {
    const timestamp = new Date().toISOString();
    writeEnvProbeRunJson(projectDir, timestamp, []);
    return {
      content: [
        {
          type: "text",
          text: formatEnvRunReport([], timestamp),
        },
      ],
    };
  }

  for (const fileName of probeFiles) {
    const { service, probeId, probeType } = parseEnvProbeFileName(fileName);
    const probePath = join(envDir, fileName);
    const run = runEnvProbeSh(probePath, timeoutMs, args.env);
    results.push({
      service,
      probeId,
      probeFile: fileName,
      probeType,
      ...run,
    });
  }

  const timestamp = new Date().toISOString();
  writeEnvProbeRunJson(projectDir, timestamp, results);

  return {
    content: [{ type: "text", text: formatEnvRunReport(results, timestamp) }],
  };
}

// ── JSON writer ───────────────────────────────────────────────────────

function writeEnvProbeRunJson(
  projectDir: string,
  timestamp: string,
  results: EnvProbeResult[],
): void {
  try {
    const dir = join(projectDir, ".forgecraft");
    mkdirSync(dir, { recursive: true });
    const runJson: EnvProbeRunJson = {
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
      join(dir, "env-probe-run.json"),
      JSON.stringify(runJson, null, 2),
      "utf-8",
    );
  } catch {
    /* non-throwing */
  }
}

// ── Report formatter ──────────────────────────────────────────────────

function formatEnvRunReport(
  results: EnvProbeResult[],
  timestamp: string,
): string {
  if (results.length === 0) {
    return [
      "## Env Probe Run Report",
      `_Executed: ${timestamp}_`,
      "",
      "No probe files found. Run `generate_env_probe` first.",
      "",
      buildEnvToolAvailability(),
      "",
      buildEnvLoopInstructions([]).join("\n"),
    ].join("\n");
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const errors = results.filter((r) =>
    ["error", "tool_missing", "not_implemented", "timeout"].includes(r.status),
  ).length;
  const notFound = results.filter((r) => r.status === "no_probe").length;

  const lines: string[] = [
    "## Env Probe Run Report",
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
      `| ${r.service} | ${r.probeId} | ${r.probeType} | ${r.probeFile ?? "—"} | ${formatEnvStatus(r.status)} | ${dur} |`,
    );
  }

  lines.push("", buildEnvToolAvailability());
  lines.push(...buildEnvLoopInstructions(results));

  return lines.join("\n");
}

function buildEnvToolAvailability(): string {
  const curlOk = isToolAvailable("curl");
  const dockerOk = isToolAvailable("docker");
  const ncOk = isToolAvailable("nc");
  return [
    "### Tool Availability",
    `- curl: ${curlOk ? "✅" : "⚠️"}`,
    `- docker: ${dockerOk ? "✅" : "⚠️"}`,
    `- nc (netcat): ${ncOk ? "✅" : "⚠️"}`,
  ].join("\n");
}

function buildEnvLoopInstructions(results: EnvProbeResult[]): string[] {
  const lines: string[] = [
    "",
    "### The Loop",
    "",
    "**Environment probe failures are infrastructure drift — regenerate from env schema, not patch manually.**",
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
      "  1. Read the env contract in .forgecraft/env/{service}.yaml",
      "  2. Compare actual environment against the declared contract",
      "  3. Update IaC/docker-compose/env config to match the contract",
      "  4. Call run_env_probe again — repeat until green",
      "",
    );
  }

  if (notImpl.length > 0) {
    lines.push(
      `⚠️ ${notImpl.length} probe${notImpl.length === 1 ? "" : "s"} not yet implemented — fill in the TODO sections:`,
    );
    for (const r of notImpl) {
      lines.push(
        `  - tests/env/${r.probeFile ?? r.probeId}: implement the actual check`,
      );
    }
    lines.push("");
  }

  if (noProbe.length > 0) {
    lines.push(
      `📋 ${noProbe.length} service${noProbe.length === 1 ? "" : "s"} have no probe files — run:`,
      "  generate_env_probe (scaffolds probe files from .forgecraft/env/ specs)",
      "  Then implement the TODO sections",
      "",
    );
  }

  if (allPassing) {
    lines.push(
      "✅ All env probes passing — L3 environment contracts verified.",
      "  Call close_cycle to evaluate gates and advance the cycle.",
      "  Call layer_status to see full coverage picture.",
    );
  } else if (results.length > 0) {
    lines.push("Run layer_status to see full coverage picture.");
  }

  return lines;
}

function formatEnvStatus(status: ProbeStatus): string {
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
