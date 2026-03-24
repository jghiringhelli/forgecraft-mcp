/**
 * Shared types and tool-runner utility for code probes.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { LANGUAGE_EXTENSIONS } from "../language-detector.js";

// ── Shared types ────────────────────────────────────────────────────

export interface ProbeResult<T = unknown> {
  readonly available: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly installHint?: string;
}

// ── Tool runner ─────────────────────────────────────────────────────

export interface ToolSpec {
  /** Name in node_modules/.bin/ — for JS/TS projects */
  readonly nodeBin?: string;
  /** Module name for `python -m <module>` */
  readonly pythonModule?: string;
  /** Binary name looked up in PATH */
  readonly pathBin?: string;
  /** Arguments to pass after the binary */
  readonly args: readonly string[];
  /** Timeout in ms (default: 120_000) */
  readonly timeoutMs?: number;
}

export interface ToolRunResult {
  readonly found: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export const ALL_EXTENSIONS = Object.values(LANGUAGE_EXTENSIONS).flat();

export const LOC_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  "target", // Rust / Java Maven
  "vendor", // Go / Ruby
  ".venv",
  "venv",
  "__pycache__",
  "bin",
  "obj", // C# / Java
]);

/**
 * Resolve a tool's executable path and run it.
 * Tries node_modules/.bin, python -m, then PATH in order.
 */
export function runTool(projectDir: string, spec: ToolSpec): ToolRunResult {
  const timeoutMs = spec.timeoutMs ?? 120_000;

  // Strategy 1: node_modules/.bin/ (JS/TS)
  if (spec.nodeBin) {
    const bin = join(projectDir, "node_modules", ".bin", spec.nodeBin);
    const winBin = bin + ".cmd";
    const resolved =
      process.platform === "win32" && existsSync(winBin)
        ? winBin
        : existsSync(bin)
          ? bin
          : null;
    if (resolved) {
      const r = spawnSync(resolved, spec.args as string[], {
        cwd: projectDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
      });
      return {
        found: true,
        stdout: r.stdout?.toString() ?? "",
        stderr: r.stderr?.toString() ?? "",
        exitCode: r.status,
      };
    }
  }

  // Strategy 2: python -m <module>
  if (spec.pythonModule) {
    const pythonBin = findPythonBin(projectDir);
    if (pythonBin) {
      const r = spawnSync(
        pythonBin,
        ["-m", spec.pythonModule, ...(spec.args as string[])],
        {
          cwd: projectDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: timeoutMs,
        },
      );
      if (r.status !== null && r.status !== 127) {
        return {
          found: true,
          stdout: r.stdout?.toString() ?? "",
          stderr: r.stderr?.toString() ?? "",
          exitCode: r.status,
        };
      }
    }
  }

  // Strategy 3: PATH binary
  if (spec.pathBin) {
    const r = spawnSync(spec.pathBin, spec.args as string[], {
      cwd: projectDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
    });
    if (
      r.status !== null &&
      (r.error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT"
    ) {
      return {
        found: true,
        stdout: r.stdout?.toString() ?? "",
        stderr: r.stderr?.toString() ?? "",
        exitCode: r.status,
      };
    }
  }

  return { found: false, stdout: "", stderr: "", exitCode: null };
}

/** Find a Python interpreter: venv first, then PATH. */
export function findPythonBin(projectDir: string): string | null {
  const venvCandidates = [
    join(projectDir, ".venv", "bin", "python"),
    join(projectDir, "venv", "bin", "python"),
    join(projectDir, ".venv", "Scripts", "python.exe"),
    join(projectDir, "venv", "Scripts", "python.exe"),
  ];
  const found = venvCandidates.find((c) => existsSync(c));
  if (found) return found;
  for (const name of ["python3", "python"]) {
    const r = spawnSync(name, ["--version"], { timeout: 3_000 });
    if (r.status === 0) return name;
  }
  return null;
}
