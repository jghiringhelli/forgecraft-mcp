/**
 * Probe execution runners for run_harness.
 * Each function executes a probe file of a given type.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProbeStatus } from "./run-harness.js";

// ── Helpers ───────────────────────────────────────────────────────────

export function combineOutput(
  stdout: string | null,
  stderr: string | null,
): string {
  const parts: string[] = [];
  if (stdout?.trim()) parts.push(stdout.trim());
  if (stderr?.trim()) parts.push(stderr.trim());
  return parts.join("\n");
}

const NOT_IMPLEMENTED_PATTERNS = [
  "not yet implemented",
  "not implemented",
  "TODO: implement",
  "ProbeNotImplemented",
];

export function isNotImplementedOutput(output: string): boolean {
  const lower = output.toLowerCase();
  return NOT_IMPLEMENTED_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export function isToolAvailable(tool: string): boolean {
  try {
    const result = spawnSync(tool, ["--version"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    return result.status !== null && result.error === undefined;
  } catch {
    return false;
  }
}

type ProbeRunResult = {
  status: ProbeStatus;
  durationMs: number;
  output: string;
};

// ── Probe dispatch ────────────────────────────────────────────────────

export function runProbe(
  probePath: string,
  fileName: string,
  timeoutMs: number,
): ProbeRunResult {
  const start = Date.now();
  if (fileName.endsWith(".a11y.spec.ts") || fileName.endsWith(".spec.ts")) {
    return runPlaywrightProbe(probePath, timeoutMs, start);
  }
  if (fileName.endsWith(".graphql.hurl") || fileName.endsWith(".hurl")) {
    return runHurlProbe(probePath, timeoutMs, start);
  }
  if (fileName.endsWith(".sim.ts")) {
    return runVitestProbe(probePath, timeoutMs, start);
  }
  if (
    fileName.endsWith(".consumer.test.ts") ||
    fileName.endsWith(".provider.test.ts")
  ) {
    return runVitestProbe(probePath, timeoutMs, start);
  }
  if (fileName.endsWith(".k6.js")) {
    return runK6Probe(probePath, timeoutMs, start);
  }
  if (
    fileName.endsWith(".db.sh") ||
    fileName.endsWith(".mq.sh") ||
    fileName.endsWith(".ws.sh") ||
    fileName.endsWith(".log.sh") ||
    fileName.endsWith(".grpc.sh") ||
    fileName.endsWith(".zap.sh") ||
    fileName.endsWith(".sh")
  ) {
    return runShProbe(probePath, timeoutMs, start);
  }
  return {
    status: "error",
    durationMs: Date.now() - start,
    output: `Unknown probe type: ${fileName}`,
  };
}

// ── Individual runners ────────────────────────────────────────────────

export function runPlaywrightProbe(
  probePath: string,
  timeoutMs: number,
  start: number,
): ProbeRunResult {
  try {
    const result = spawnSync(
      "npx",
      ["playwright", "test", probePath, "--reporter=line"],
      {
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      },
    );
    const durationMs = Date.now() - start;
    const output = combineOutput(result.stdout, result.stderr);
    if (result.error?.message?.includes("ENOENT"))
      return {
        status: "tool_missing",
        durationMs,
        output: "playwright not found",
      };
    if (
      result.signal === "SIGTERM" ||
      result.error?.message?.includes("ETIMEDOUT")
    )
      return { status: "timeout", durationMs, output: "timed out" };
    if (isNotImplementedOutput(output))
      return { status: "not_implemented", durationMs, output };
    return {
      status: result.status === 0 ? "pass" : "fail",
      durationMs,
      output,
    };
  } catch (err) {
    return {
      status: "tool_missing",
      durationMs: Date.now() - start,
      output: `playwright not available: ${String(err)}`,
    };
  }
}

export function runHurlProbe(
  probePath: string,
  timeoutMs: number,
  start: number,
): ProbeRunResult {
  try {
    // Look for hurl.env in the probe's directory for variable injection ({{host}}, etc.)
    const probeDir = dirname(probePath);
    const hurlEnvPath = join(probeDir, "hurl.env");
    // Inject a per-run unique uid so each harness run uses fresh test users.
    // This avoids 422 failures caused by duplicate username/email from prior runs.
    const runUid = `r${Date.now().toString(36)}`;
    const hurlArgs = existsSync(hurlEnvPath)
      ? [
          "--variables-file",
          hurlEnvPath,
          "--variable",
          `uid=${runUid}`,
          probePath,
        ]
      : ["--variable", `uid=${runUid}`, probePath];

    const result = spawnSync("hurl", hurlArgs, {
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    const durationMs = Date.now() - start;
    const output = combineOutput(result.stdout, result.stderr);
    if (result.error?.message?.includes("ENOENT"))
      return { status: "tool_missing", durationMs, output: "hurl not found" };
    if (
      result.signal === "SIGTERM" ||
      result.error?.message?.includes("ETIMEDOUT")
    )
      return { status: "timeout", durationMs, output: "timed out" };
    return {
      status: result.status === 0 ? "pass" : "fail",
      durationMs,
      output,
    };
  } catch (err) {
    return {
      status: "tool_missing",
      durationMs: Date.now() - start,
      output: `hurl not available: ${String(err)}`,
    };
  }
}

export function runVitestProbe(
  probePath: string,
  timeoutMs: number,
  start: number,
): ProbeRunResult {
  try {
    const result = spawnSync("npx", ["vitest", "run", probePath], {
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    const durationMs = Date.now() - start;
    const output = combineOutput(result.stdout, result.stderr);
    if (result.error?.message?.includes("ENOENT"))
      return { status: "tool_missing", durationMs, output: "vitest not found" };
    if (
      result.signal === "SIGTERM" ||
      result.error?.message?.includes("ETIMEDOUT")
    )
      return { status: "timeout", durationMs, output: "timed out" };
    if (isNotImplementedOutput(output))
      return { status: "not_implemented", durationMs, output };
    return {
      status: result.status === 0 ? "pass" : "fail",
      durationMs,
      output,
    };
  } catch (err) {
    return {
      status: "tool_missing",
      durationMs: Date.now() - start,
      output: `vitest not available: ${String(err)}`,
    };
  }
}

export function runK6Probe(
  probePath: string,
  timeoutMs: number,
  start: number,
): ProbeRunResult {
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
    if (result.error?.message?.includes("ENOENT"))
      return { status: "tool_missing", durationMs, output: "k6 not found" };
    if (
      result.signal === "SIGTERM" ||
      result.error?.message?.includes("ETIMEDOUT")
    )
      return { status: "timeout", durationMs, output: "timed out" };
    return {
      status: result.status === 0 ? "pass" : "fail",
      durationMs,
      output,
    };
  } catch (err) {
    return {
      status: "tool_missing",
      durationMs: Date.now() - start,
      output: `k6 not available: ${String(err)}`,
    };
  }
}

export function runShProbe(
  probePath: string,
  timeoutMs: number,
  start: number,
): ProbeRunResult {
  try {
    const result = spawnSync("bash", [probePath], {
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    const durationMs = Date.now() - start;
    const output = combineOutput(result.stdout, result.stderr);
    if (result.error?.message?.includes("ENOENT"))
      return { status: "tool_missing", durationMs, output: "bash not found" };
    if (
      result.signal === "SIGTERM" ||
      result.error?.message?.includes("ETIMEDOUT")
    )
      return { status: "timeout", durationMs, output: "timed out" };
    if (isNotImplementedOutput(output))
      return { status: "not_implemented", durationMs, output };
    return {
      status: result.status === 0 ? "pass" : "fail",
      durationMs,
      output,
    };
  } catch (err) {
    return {
      status: "tool_missing",
      durationMs: Date.now() - start,
      output: `bash not available: ${String(err)}`,
    };
  }
}
