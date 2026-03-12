/**
 * External code quality probes.
 *
 * Each probe checks for a specific quality tool, runs it against the target
 * project directory, and returns structured data for report assembly. All
 * probes degrade gracefully — if a tool is absent the result carries an
 * `installHint` instead of data, never throwing.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { findDirectDbCallsInRoutes } from "./gs-scorer.js";

// ── Shared types ────────────────────────────────────────────────────

export interface ProbeResult<T = unknown> {
  readonly available: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly installHint?: string;
}

// ── loc probe (always available — pure fs) ──────────────────────────

export interface LocData {
  readonly files: number;
  readonly lines: number;
  readonly blankLines: number;
  readonly byExtension: Record<string, { files: number; lines: number }>;
}

const LOC_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".cs", ".rb", ".swift",
]);
const LOC_SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git"]);

/**
 * Count source lines by walking the project directory tree.
 * Always succeeds — no external tool required.
 */
export function probeLoc(projectDir: string): ProbeResult<LocData> {
  const byExtension: Record<string, { files: number; lines: number }> = {};
  let totalFiles = 0;
  let totalLines = 0;
  let totalBlank = 0;

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (LOC_SKIP_DIRS.has(name)) continue;
      const fullPath = join(dir, name);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) { walk(fullPath); continue; }
      const ext = extname(name);
      if (!LOC_EXTENSIONS.has(ext)) continue;
      const content = readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      const blank = lines.filter(l => l.trim() === "").length;
      totalFiles++;
      totalLines += lines.length;
      totalBlank += blank;
      if (!byExtension[ext]) byExtension[ext] = { files: 0, lines: 0 };
      byExtension[ext].files++;
      byExtension[ext].lines += lines.length;
    }
  }

  try {
    walk(projectDir);
    return { available: true, data: { files: totalFiles, lines: totalLines, blankLines: totalBlank, byExtension } };
  } catch (err) {
    return { available: false, error: String(err) };
  }
}

// ── coverage probe (reads existing report) ──────────────────────────

export interface CoverageData {
  readonly lines: number;
  readonly statements: number;
  readonly functions: number;
  readonly branches: number;
  readonly reportPath: string;
}

/**
 * Read an existing istanbul/c8 coverage-summary.json. Does not re-run tests.
 * Returns not-available if the report does not exist.
 */
export function probeCoverage(projectDir: string, coverageDir?: string): ProbeResult<CoverageData> {
  const baseDir = coverageDir ? coverageDir : join(projectDir, "coverage");
  const reportPath = join(baseDir, "coverage-summary.json");
  if (!existsSync(reportPath)) {
    return {
      available: false,
      installHint: `No coverage report found at ${reportPath}. Run tests with c8 or istanbul first: \`c8 npm test\``,
    };
  }
  try {
    const raw = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
    const total = raw["total"] as Record<string, { pct: number }>;
    return {
      available: true,
      data: {
        lines: total["lines"].pct,
        statements: total["statements"].pct,
        functions: total["functions"].pct,
        branches: total["branches"].pct,
        reportPath,
      },
    };
  } catch (err) {
    return { available: false, error: `Failed to parse coverage report: ${String(err)}` };
  }
}

// ── layer violations probe (depcruise or internal fallback) ─────────

export interface LayerData {
  readonly violations: number;
  readonly source: "depcruise" | "internal";
  readonly details: string[];
}

/**
 * Check for layer violations. Uses dependency-cruiser when available and a
 * .dependency-cruiser.js config exists; otherwise falls back to the internal
 * direct-DB-call scanner from gs-scorer.
 */
export function probeLayerViolations(projectDir: string): ProbeResult<LayerData> {
  const depCruiseBin = join(projectDir, "node_modules", ".bin", "depcruise");
  const depCruiseBinWin = depCruiseBin + ".cmd";
  const hasDepCruise = existsSync(depCruiseBin) || existsSync(depCruiseBinWin);
  const hasConfig = existsSync(join(projectDir, ".dependency-cruiser.js"))
    || existsSync(join(projectDir, ".dependency-cruiser.cjs"));

  if (hasDepCruise && hasConfig) {
    const bin = process.platform === "win32" ? depCruiseBinWin : depCruiseBin;
    const result = spawnSync(bin, ["--output-type", "json", "src"], {
      cwd: projectDir, maxBuffer: 5 * 1024 * 1024,
    });
    if (result.status === 0 || result.status === 1) {
      try {
        const output = JSON.parse(result.stdout.toString()) as {
          summary: { violations: Array<{ rule: { name: string }; from: string; to: string }> };
        };
        const viols = output.summary.violations;
        return {
          available: true,
          data: {
            violations: viols.length,
            source: "depcruise",
            details: viols.map(v => `${v.from} → ${v.to} (${v.rule.name})`),
          },
        };
      } catch { /* fall through to internal */ }
    }
  }

  // Internal fallback
  const internal = findDirectDbCallsInRoutes(projectDir);
  return {
    available: true,
    data: {
      violations: internal.length,
      source: "internal",
      details: internal.map(v => `${v.file}:${v.line} — ${v.match}`),
    },
    installHint: hasDepCruise && !hasConfig
      ? "dependency-cruiser installed but no .dependency-cruiser.js config found — add one for precise rules"
      : !hasDepCruise
        ? "Add dependency-cruiser for richer analysis: `npm i -D dependency-cruiser && npx depcruise --init`"
        : undefined,
  };
}

// ── dead code probe (knip) ──────────────────────────────────────────

export interface DeadCodeData {
  readonly unusedFiles: number;
  readonly unusedExports: number;
  readonly unusedDependencies: number;
  readonly details: string[];
}

/**
 * Run knip to detect unused files, exports, and dependencies.
 * Returns not-available if knip is not installed.
 */
export function probeDeadCode(projectDir: string): ProbeResult<DeadCodeData> {
  const bin = join(projectDir, "node_modules", ".bin", process.platform === "win32" ? "knip.cmd" : "knip");
  if (!existsSync(bin)) {
    return { available: false, installHint: "Install knip: `npm i -D knip`" };
  }
  const result = spawnSync(bin, ["--reporter", "json"], {
    cwd: projectDir, maxBuffer: 5 * 1024 * 1024,
  });
  try {
    const output = JSON.parse(result.stdout.toString()) as {
      files?: string[];
      exports?: Record<string, string[]>;
      dependencies?: string[];
    };
    const details: string[] = [
      ...(output.files ?? []).map(f => `unused file: ${f}`),
      ...Object.entries(output.exports ?? {}).flatMap(([file, names]) =>
        names.map(n => `unused export: ${n} in ${file}`),
      ),
      ...(output.dependencies ?? []).map(d => `unused dep: ${d}`),
    ];
    return {
      available: true,
      data: {
        unusedFiles: (output.files ?? []).length,
        unusedExports: Object.values(output.exports ?? {}).flat().length,
        unusedDependencies: (output.dependencies ?? []).length,
        details,
      },
    };
  } catch (err) {
    return { available: false, error: `knip output parse error: ${String(err)}` };
  }
}

// ── complexity probe (eslint) ───────────────────────────────────────

export interface ComplexityData {
  readonly highComplexityFunctions: number;
  readonly threshold: number;
  readonly details: string[];
}

const COMPLEXITY_THRESHOLD = 10;

/**
 * Run ESLint with the complexity rule to find over-complex functions.
 * Returns not-available if ESLint is not installed.
 */
export function probeComplexity(projectDir: string): ProbeResult<ComplexityData> {
  const bin = join(projectDir, "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
  if (!existsSync(bin)) {
    return { available: false, installHint: "Install ESLint: `npm i -D eslint`" };
  }
  const result = spawnSync(bin, [
    "--format", "json",
    "--rule", `{"complexity": ["warn", ${COMPLEXITY_THRESHOLD}]}`,
    "src",
  ], { cwd: projectDir, maxBuffer: 5 * 1024 * 1024 });

  try {
    const output = JSON.parse(result.stdout.toString()) as Array<{
      filePath: string;
      messages: Array<{ ruleId: string; message: string; line: number }>;
    }>;
    const complexityMessages = output.flatMap(file =>
      file.messages
        .filter(m => m.ruleId === "complexity")
        .map(m => `${file.filePath}:${m.line} — ${m.message}`),
    );
    return {
      available: true,
      data: {
        highComplexityFunctions: complexityMessages.length,
        threshold: COMPLEXITY_THRESHOLD,
        details: complexityMessages,
      },
    };
  } catch (err) {
    return { available: false, error: `ESLint output parse error: ${String(err)}` };
  }
}

// ── mutation probe (stryker, opt-in) ────────────────────────────────

export interface MutationData {
  readonly score: number;
  readonly killed: number;
  readonly survived: number;
  readonly timeout: number;
  readonly total: number;
}

/**
 * Run Stryker mutation testing. Expensive — only runs when explicitly requested.
 * Returns not-available if Stryker is not installed.
 */
export function probeMutation(projectDir: string): ProbeResult<MutationData> {
  const bin = join(projectDir, "node_modules", ".bin", process.platform === "win32" ? "stryker.cmd" : "stryker");
  if (!existsSync(bin)) {
    return { available: false, installHint: "Install Stryker: `npm i -D @stryker-mutator/core @stryker-mutator/typescript-checker`" };
  }
  const result = spawnSync(bin, ["run", "--reporters", "json"], {
    cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: 600_000,
  });
  const reportPath = join(projectDir, "reports", "mutation", "mutation.json");
  if (!existsSync(reportPath)) {
    return { available: false, error: "Stryker completed but mutation.json report not found" };
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      metrics?: { mutationScore: number; killed: number; survived: number; timeout: number; totalDetected: number; totalMutants: number };
    };
    const m = report.metrics;
    if (!m) return { available: false, error: "Unexpected mutation.json shape (no .metrics key)" };
    return {
      available: true,
      data: {
        score: Math.round(m.mutationScore * 10) / 10,
        killed: m.killed,
        survived: m.survived,
        timeout: m.timeout,
        total: m.totalMutants,
      },
    };
  } catch (err) {
    return { available: false, error: `mutation.json parse error: ${String(err)}` };
  }
}
