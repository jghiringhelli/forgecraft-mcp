/**
 * External code quality probes — language-agnostic design.
 *
 * Each probe detects the project language and picks the appropriate tool or
 * format for that ecosystem. Coverage uses LCOV (universal) first. Tool
 * invocation handles three strategies: node_modules/.bin/ (JS/TS),
 * `python -m` (Python), or PATH binary (Go, Rust, Java, etc.).
 *
 * All probes degrade gracefully — if a tool is absent the result carries an
 * `installHint` and `available: false`, never throwing.
 */
// @ts-nocheck


import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { detectLanguage, LANGUAGE_EXTENSIONS } from "./language-detector.js";
import type { SupportedLanguage } from "./language-detector.js";

// ── Shared types ────────────────────────────────────────────────────

export interface ProbeResult<T = unknown> {
  readonly available: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly installHint?: string;
}

// ── Tool runner ─────────────────────────────────────────────────────

interface ToolSpec {
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

interface ToolRunResult {
  readonly found: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

const ALL_EXTENSIONS = Object.values(LANGUAGE_EXTENSIONS).flat();
const LOC_SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".git",
  "target",          // Rust / Java Maven
  "vendor",          // Go / Ruby
  ".venv", "venv", "__pycache__",
  "bin", "obj",      // C# / Java
]);

/**
 * Resolve a tool's executable path and run it.
 * Tries node_modules/.bin, python -m, then PATH in order.
 */
function runTool(projectDir: string, spec: ToolSpec): ToolRunResult {
  const timeoutMs = spec.timeoutMs ?? 120_000;

  // Strategy 1: node_modules/.bin/ (JS/TS)
  if (spec.nodeBin) {
    const bin = join(projectDir, "node_modules", ".bin", spec.nodeBin);
    const winBin = bin + ".cmd";
    const resolved = process.platform === "win32" && existsSync(winBin) ? winBin
      : existsSync(bin) ? bin
      : null;
    if (resolved) {
      const r = spawnSync(resolved, spec.args as string[], {
        cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs,
      });
      return { found: true, stdout: r.stdout?.toString() ?? "", stderr: r.stderr?.toString() ?? "", exitCode: r.status };
    }
  }

  // Strategy 2: python -m <module>
  if (spec.pythonModule) {
    const pythonBin = findPythonBin(projectDir);
    if (pythonBin) {
      const r = spawnSync(pythonBin, ["-m", spec.pythonModule, ...spec.args as string[]], {
        cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs,
      });
      if (r.status !== null && r.status !== 127) {
        return { found: true, stdout: r.stdout?.toString() ?? "", stderr: r.stderr?.toString() ?? "", exitCode: r.status };
      }
    }
  }

  // Strategy 3: PATH binary
  if (spec.pathBin) {
    const r = spawnSync(spec.pathBin, spec.args as string[], {
      cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs,
    });
    if (r.status !== null && (r.error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
      return { found: true, stdout: r.stdout?.toString() ?? "", stderr: r.stderr?.toString() ?? "", exitCode: r.status };
    }
  }

  return { found: false, stdout: "", stderr: "", exitCode: null };
}

/** Find a Python interpreter: venv first, then PATH. */
function findPythonBin(projectDir: string): string | null {
  const venvCandidates = [
    join(projectDir, ".venv", "bin", "python"),
    join(projectDir, "venv", "bin", "python"),
    join(projectDir, ".venv", "Scripts", "python.exe"),
    join(projectDir, "venv", "Scripts", "python.exe"),
  ];
  const found = venvCandidates.find((c) => existsSync(c));
  if (found) return found;
  // Fall back to PATH
  for (const name of ["python3", "python"]) {
    const r = spawnSync(name, ["--version"], { timeout: 3_000 });
    if (r.status === 0) return name;
  }
  return null;
}

// ── loc probe (always available — pure fs) ──────────────────────────

export interface LocData {
  readonly language: SupportedLanguage;
  readonly files: number;
  readonly lines: number;
  readonly blankLines: number;
  readonly byExtension: Record<string, { files: number; lines: number }>;
}

/**
 * Count source lines by walking the project directory tree.
 * Uses LANGUAGE_EXTENSIONS so every supported language is counted.
 * Always succeeds — no external tool required.
 */
export function probeLoc(projectDir: string): ProbeResult<LocData> {
  const language = detectLanguage(projectDir);
  const countableExtensions = new Set(ALL_EXTENSIONS);
  const byExtension: Record<string, { files: number; lines: number }> = {};
  let totalFiles = 0;
  let totalLines = 0;
  let totalBlank = 0;

  function walk(dir: string): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (LOC_SKIP_DIRS.has(name)) continue;
      const fullPath = join(dir, name);
      let st;
      try { st = statSync(fullPath); } catch { continue; }
      if (st.isDirectory()) { walk(fullPath); continue; }
      const ext = extname(name);
      if (!countableExtensions.has(ext)) continue;
      let content: string;
      try { content = readFileSync(fullPath, "utf8"); } catch { continue; }
      const lines = content.split("\n");
      const blank = lines.filter((l) => l.trim() === "").length;
      totalFiles++;
      totalLines += lines.length;
      totalBlank += blank;
      if (!byExtension[ext]) byExtension[ext] = { files: 0, lines: 0 };
      byExtension[ext]!.files++;
      byExtension[ext]!.lines += lines.length;
    }
  }

  if (!existsSync(projectDir)) {
    return { available: false, error: `Directory not found: ${projectDir}` };
  }

  try {
    walk(projectDir);
    return {
      available: true,
      data: { language, files: totalFiles, lines: totalLines, blankLines: totalBlank, byExtension },
    };
  } catch (err) {
    return { available: false, error: String(err) };
  }
}

// ── coverage probe — format-first, not tool-first ───────────────────

export interface CoverageData {
  readonly lines: number;
  readonly statements: number;
  readonly functions: number;
  readonly branches: number;
  readonly reportFormat: "lcov" | "istanbul" | "cobertura";
  readonly reportPath: string;
}

/**
 * Parse an LCOV info file and return overall line/branch/function percentages.
 * LCOV is the universal coverage format supported by c8, pytest-cov,
 * go test -coverprofile, cargo-tarpaulin, JaCoCo, simplecov-lcov, etc.
 */
function parseLcov(lcovPath: string): Pick<CoverageData, "lines" | "branches" | "functions"> | null {
  try {
    const content = readFileSync(lcovPath, "utf8");
    let lh = 0, lf = 0, brh = 0, brf = 0, fnh = 0, fnf = 0;
    for (const line of content.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const n = parseInt(line.slice(colonIdx + 1).trim(), 10);
      if (isNaN(n)) continue;
      if (key === "LH") lh += n;
      else if (key === "LF") lf += n;
      else if (key === "BRH") brh += n;
      else if (key === "BRF") brf += n;
      else if (key === "FNH") fnh += n;
      else if (key === "FNF") fnf += n;
    }
    if (lf === 0) return null;
    return {
      lines:     Math.round((lh / lf) * 1000) / 10,
      branches:  brf > 0 ? Math.round((brh / brf) * 1000) / 10 : 100,
      functions: fnf > 0 ? Math.round((fnh / fnf) * 1000) / 10 : 100,
    };
  } catch { return null; }
}

/** Parse an istanbul/c8 coverage-summary.json. */
function parseIstanbul(summaryPath: string): Pick<CoverageData, "lines" | "statements" | "functions" | "branches"> | null {
  try {
    const raw = JSON.parse(readFileSync(summaryPath, "utf8")) as Record<string, unknown>;
    const total = raw["total"] as Record<string, { pct: number }> | undefined;
    if (!total) return null;
    return {
      lines:      total["lines"]?.pct ?? 0,
      statements: total["statements"]?.pct ?? 0,
      functions:  total["functions"]?.pct ?? 0,
      branches:   total["branches"]?.pct ?? 0,
    };
  } catch { return null; }
}

/** Parse a Cobertura/Clover XML (Python, Java, PHP, C#). */
function parseCobertura(xmlPath: string): Pick<CoverageData, "lines" | "branches"> | null {
  try {
    const content = readFileSync(xmlPath, "utf8");
    const lrMatch = content.match(/line-rate="([0-9.]+)"/);
    const brMatch = content.match(/branch-rate="([0-9.]+)"/);
    if (!lrMatch) return null;
    return {
      lines:    Math.round(parseFloat(lrMatch[1]!) * 1000) / 10,
      branches: brMatch ? Math.round(parseFloat(brMatch[1]!) * 1000) / 10 : 100,
    };
  } catch { return null; }
}

/**
 * Read an existing coverage report — no test re-run.
 * Tries LCOV (universal) → istanbul JSON → Cobertura XML, in that order.
 */
export function probeCoverage(projectDir: string, coverageDir?: string): ProbeResult<CoverageData> {
  const base = coverageDir ? resolve(coverageDir) : join(projectDir, "coverage");

  const lcovPath = join(base, "lcov.info");
  if (existsSync(lcovPath)) {
    const parsed = parseLcov(lcovPath);
    if (parsed) {
      return {
        available: true,
        data: { statements: parsed.lines, ...parsed, reportFormat: "lcov", reportPath: lcovPath },
      };
    }
  }

  const istanbulPath = join(base, "coverage-summary.json");
  if (existsSync(istanbulPath)) {
    const parsed = parseIstanbul(istanbulPath);
    if (parsed) {
      return { available: true, data: { ...parsed, reportFormat: "istanbul", reportPath: istanbulPath } };
    }
  }

  for (const xmlName of ["cobertura.xml", "coverage.xml", "../coverage.xml"]) {
    const xmlPath = resolve(base, xmlName);
    if (existsSync(xmlPath)) {
      const parsed = parseCobertura(xmlPath);
      if (parsed) {
        return {
          available: true,
          data: {
            ...parsed, statements: parsed.lines, functions: 100,
            reportFormat: "cobertura", reportPath: xmlPath,
          },
        };
      }
    }
  }

  return { available: false, installHint: buildCoverageHint(detectLanguage(projectDir)) };
}

function buildCoverageHint(language: SupportedLanguage): string {
  const hints: Partial<Record<SupportedLanguage, string>> = {
    typescript: "`npx c8 npm test` — writes coverage/lcov.info + coverage/coverage-summary.json",
    python:     "`pytest --cov=. --cov-report=lcov:coverage/lcov.info`",
    go:         "`go test ./... -coverprofile=coverage/lcov.info`",
    rust:       "`cargo llvm-cov --lcov --output-path coverage/lcov.info`  (cargo install cargo-llvm-cov)",
    java:       "Add JaCoCo plugin: `mvn test` with `<format>lcov</format>` in jacoco-maven-plugin",
    ruby:       "Add simplecov-lcov gem; configure SimpleCov::Formatter::LcovFormatter in spec_helper",
    csharp:     "`dotnet test --collect:\"XPlat Code Coverage\"`  — generates coverage.cobertura.xml",
    unknown:    "Run your test suite with coverage output to coverage/lcov.info",
  };
  return `No coverage report found. To generate: ${hints[language] ?? hints["unknown"]}`;
}

// ── layer violations probe ──────────────────────────────────────────

export interface LayerData {
  readonly violations: number;
  readonly source: "depcruise" | "internal";
  readonly details: string[];
}

const DB_PATTERNS: Partial<Record<SupportedLanguage, readonly RegExp[]>> = {
  typescript: [
    /from ['"]@prisma\/client['"]/,
    /require\(['"]@prisma\/client['"]\)/,
    /from ['"]mongoose['"]/,
    /from ['"]pg['"]/,
    /from ['"]mysql2['"]/,
    /from ['"]sqlite3['"]/,
    /from ['"]typeorm['"]/,
    /from ['"]sequelize['"]/,
    /from ['"]knex['"]/,
  ],
  python: [
    /from sqlalchemy/,
    /import sqlalchemy/,
    /from django\.db/,
    /import pymongo/,
    /import psycopg2/,
    /import pymysql/,
  ],
  go: [
    /"database\/sql"/,
    /"gorm\.io\//,
    /"github\.com\/go-pg\//,
    /"github\.com\/jmoiron\/sqlx"/,
  ],
  rust: [/use diesel::/, /use sqlx::/, /use rusqlite::/],
  java: [/@Repository/, /import javax\.persistence/, /import org\.springframework\.data/, /import org\.hibernate/],
  ruby: [/ActiveRecord::/, /Sequel\./],
};

const ROUTE_DIR_PATTERNS = [
  /^routes?$/i, /^controllers?$/i, /^handlers?$/i,
  /^endpoints?$/i, /^api$/i, /^views?$/i, /^actions?$/i,
];

/**
 * Check for layer violations — DB client imports in route/controller files.
 * Uses dependency-cruiser for JS/TS when available; falls back to pattern scan.
 */
export function probeLayerViolations(projectDir: string): ProbeResult<LayerData> {
  const language = detectLanguage(projectDir);

  if (language === "typescript") {
    const result = tryDependencyCruiser(projectDir);
    if (result) return result;
  }

  const patterns = DB_PATTERNS[language] ?? DB_PATTERNS["typescript"]!;
  const violations = scanForLayerViolations(projectDir, patterns);
  const installHint = language === "typescript"
    ? "For precise dependency rules: `npm i -D dependency-cruiser && npx depcruise --init`"
    : undefined;

  return {
    available: true,
    data: { violations: violations.length, source: "internal", details: violations },
    ...(installHint ? { installHint } : {}),
  };
}

function tryDependencyCruiser(projectDir: string): ProbeResult<LayerData> | null {
  const hasConfig = existsSync(join(projectDir, ".dependency-cruiser.js"))
    || existsSync(join(projectDir, ".dependency-cruiser.cjs"));
  if (!hasConfig) return null;

  const binPath = join(projectDir, "node_modules", ".bin", "depcruise");
  const winBin = binPath + ".cmd";
  const bin = process.platform === "win32" && existsSync(winBin) ? winBin
    : existsSync(binPath) ? binPath : null;
  if (!bin) return null;

  const r = spawnSync(bin, ["--output-type", "json", "src"], {
    cwd: projectDir, maxBuffer: 5 * 1024 * 1024,
  });
  try {
    const out = JSON.parse(r.stdout.toString()) as {
      summary: { violations: Array<{ rule: { name: string }; from: string; to: string }> };
    };
    const viols = out.summary.violations;
    return {
      available: true,
      data: {
        violations: viols.length,
        source: "depcruise",
        details: viols.map((v) => `${v.from} → ${v.to} (${v.rule.name})`),
      },
    };
  } catch { return null; }
}

function scanForLayerViolations(projectDir: string, patterns: readonly RegExp[]): string[] {
  const violations: string[] = [];
  const countableExts = new Set(ALL_EXTENSIONS);

  function walk(dir: string, inRouteLayer: boolean): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (LOC_SKIP_DIRS.has(name)) continue;
      const fullPath = join(dir, name);
      let st;
      try { st = statSync(fullPath); } catch { continue; }
      if (st.isDirectory()) {
        const isRoute = ROUTE_DIR_PATTERNS.some((p) => p.test(name));
        walk(fullPath, inRouteLayer || isRoute);
        continue;
      }
      if (!inRouteLayer) continue;
      if (!countableExts.has(extname(name))) continue;
      let content: string;
      try { content = readFileSync(fullPath, "utf8"); } catch { continue; }
      content.split("\n").forEach((line, i) => {
        if (patterns.some((p) => p.test(line))) {
          violations.push(`${fullPath}:${i + 1} — ${line.trim()}`);
        }
      });
    }
  }

  walk(projectDir, false);
  return violations;
}

// ── dead code probe ─────────────────────────────────────────────────

export interface DeadCodeData {
  readonly unusedFiles: number;
  readonly unusedExports: number;
  readonly unusedDependencies: number;
  readonly details: string[];
}

const DEAD_CODE_TOOLS: Partial<Record<SupportedLanguage, ToolSpec & { installHint: string }>> = {
  typescript: { nodeBin: "knip", args: ["--reporter", "json"],    installHint: "`npm i -D knip`" },
  python:     { pythonModule: "vulture", args: ["."],              installHint: "`pip install vulture`" },
  go:         { pathBin: "deadcode", args: ["./..."],              installHint: "`go install golang.org/x/tools/cmd/deadcode@latest`" },
};

/**
 * Detect unused files, exports, and dependencies.
 * Language-keyed tool selection; output normalised to DeadCodeData.
 */
export function probeDeadCode(projectDir: string): ProbeResult<DeadCodeData> {
  const language = detectLanguage(projectDir);
  const toolConfig = DEAD_CODE_TOOLS[language];

  if (!toolConfig) {
    return { available: false, installHint: `No dead-code tool configured for ${language}.` };
  }
  const run = runTool(projectDir, toolConfig);
  if (!run.found) {
    return { available: false, installHint: `Install dead-code tool: ${toolConfig.installHint}` };
  }

  try {
    if (language === "typescript") return parseKnipOutput(run.stdout);
    if (language === "python")     return parseVultureOutput(run.stdout);
    if (language === "go")         return parseDeadcodeOutput(run.stdout + run.stderr);
    return { available: false, installHint: `No output parser for ${language} dead-code tool` };
  } catch (err) {
    return { available: false, error: `Dead code parse error: ${String(err)}` };
  }
}

function parseKnipOutput(stdout: string): ProbeResult<DeadCodeData> {
  const output = JSON.parse(stdout) as {
    files?: string[];
    exports?: Record<string, string[]>;
    dependencies?: string[];
  };
  const details: string[] = [
    ...(output.files ?? []).map((f) => `unused file: ${f}`),
    ...Object.entries(output.exports ?? {}).flatMap(([file, names]) =>
      names.map((n) => `unused export: ${n} in ${file}`),
    ),
    ...(output.dependencies ?? []).map((d) => `unused dep: ${d}`),
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
}

function parseVultureOutput(stdout: string): ProbeResult<DeadCodeData> {
  const lines = stdout.split("\n").filter(Boolean);
  return {
    available: true,
    data: { unusedFiles: 0, unusedExports: lines.length, unusedDependencies: 0, details: lines.map((l) => `unused: ${l}`) },
  };
}

function parseDeadcodeOutput(output: string): ProbeResult<DeadCodeData> {
  const lines = output.split("\n").filter((l) => l.includes("is unreachable"));
  return {
    available: true,
    data: { unusedFiles: 0, unusedExports: lines.length, unusedDependencies: 0, details: lines },
  };
}

// ── complexity probe ────────────────────────────────────────────────

export interface ComplexityData {
  readonly highComplexityFunctions: number;
  readonly threshold: number;
  readonly details: string[];
}

const COMPLEXITY_THRESHOLD = 10;

const COMPLEXITY_TOOLS: Partial<Record<SupportedLanguage, ToolSpec & { installHint: string }>> = {
  typescript: {
    nodeBin: "eslint",
    args: ["--format", "json", "--rule", `{"complexity": ["warn", ${COMPLEXITY_THRESHOLD}]}`, "src"],
    installHint: "`npm i -D eslint`",
  },
  python: {
    pythonModule: "radon",
    args: ["cc", ".", "--min", "C", "--json"],
    installHint: "`pip install radon`",
  },
  go: {
    pathBin: "gocognit",
    args: ["-over", String(COMPLEXITY_THRESHOLD), "./..."],
    installHint: "`go install github.com/uudashr/gocognit/cmd/gocognit@latest`",
  },
};

/**
 * Find functions exceeding the cyclomatic complexity threshold.
 * Language-keyed tool selection; output normalised to ComplexityData.
 */
export function probeComplexity(projectDir: string): ProbeResult<ComplexityData> {
  const language = detectLanguage(projectDir);
  const toolConfig = COMPLEXITY_TOOLS[language];

  if (!toolConfig) {
    return { available: false, installHint: `No complexity tool configured for ${language}.` };
  }
  const run = runTool(projectDir, toolConfig);
  if (!run.found) {
    return { available: false, installHint: `Install complexity tool: ${toolConfig.installHint}` };
  }

  try {
    if (language === "typescript") return parseEslintComplexity(run.stdout);
    if (language === "python")     return parseRadonOutput(run.stdout);
    if (language === "go")         return parseGocognitOutput(run.stdout);
    return { available: false, installHint: `No output parser for ${language} complexity tool` };
  } catch (err) {
    return { available: false, error: `Complexity parse error: ${String(err)}` };
  }
}

function parseEslintComplexity(stdout: string): ProbeResult<ComplexityData> {
  const files = JSON.parse(stdout) as Array<{
    filePath: string;
    messages: Array<{ ruleId: string; message: string; line: number }>;
  }>;
  const msgs = files.flatMap((f) =>
    f.messages.filter((m) => m.ruleId === "complexity").map((m) => `${f.filePath}:${m.line} — ${m.message}`),
  );
  return { available: true, data: { highComplexityFunctions: msgs.length, threshold: COMPLEXITY_THRESHOLD, details: msgs } };
}

function parseRadonOutput(stdout: string): ProbeResult<ComplexityData> {
  const files = JSON.parse(stdout) as Record<string, Array<{ name: string; complexity: number; lineno: number }>>;
  const msgs: string[] = [];
  for (const [file, fns] of Object.entries(files)) {
    for (const fn of fns) {
      if (fn.complexity >= COMPLEXITY_THRESHOLD) {
        msgs.push(`${file}:${fn.lineno} — ${fn.name} (complexity ${fn.complexity})`);
      }
    }
  }
  return { available: true, data: { highComplexityFunctions: msgs.length, threshold: COMPLEXITY_THRESHOLD, details: msgs } };
}

function parseGocognitOutput(stdout: string): ProbeResult<ComplexityData> {
  const lines = stdout.split("\n").filter(Boolean);
  return { available: true, data: { highComplexityFunctions: lines.length, threshold: COMPLEXITY_THRESHOLD, details: lines } };
}

// ── mutation probe (opt-in) ─────────────────────────────────────────

export interface MutationData {
  readonly score: number;
  readonly killed: number;
  readonly survived: number;
  readonly timeout: number;
  readonly total: number;
}

interface MutationToolSpec extends ToolSpec {
  readonly installHint: string;
  readonly reportPath?: string;
}

const MUTATION_TOOLS: Partial<Record<SupportedLanguage, MutationToolSpec>> = {
  typescript: {
    nodeBin: "stryker",
    args: ["run", "--reporters", "json"],
    reportPath: "reports/mutation/mutation.json",
    installHint: "`npm i -D @stryker-mutator/core @stryker-mutator/typescript-checker`",
  },
  python: {
    pythonModule: "mutmut",
    args: ["run", "--CI"],
    installHint: "`pip install mutmut`",
  },
  go: {
    pathBin: "go-mutesting",
    args: ["./..."],
    installHint: "`go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest`",
    timeoutMs: 600_000,
  },
  rust: {
    pathBin: "cargo",
    args: ["mutants"],
    installHint: "`cargo install cargo-mutants`",
    timeoutMs: 600_000,
  },
};

/**
 * Run mutation testing (opt-in, slow).
 * Language-keyed tool selection; output normalised to MutationData.
 */
export function probeMutation(projectDir: string): ProbeResult<MutationData> {
  const language = detectLanguage(projectDir);
  const toolConfig = MUTATION_TOOLS[language];

  if (!toolConfig) {
    return { available: false, installHint: `No mutation tool configured for ${language}.` };
  }
  const run = runTool(projectDir, toolConfig);
  if (!run.found) {
    return { available: false, installHint: `Install mutation tool: ${toolConfig.installHint}` };
  }

  try {
    if (language === "typescript") return parseStrykerOutput(projectDir, toolConfig.reportPath!);
    if (language === "python")     return parseMutmutOutput(run.stdout + run.stderr);
    if (language === "go" || language === "rust") return parseCountingOutput(run.stdout + run.stderr);
    return { available: false, installHint: `No output parser for ${language} mutation tool` };
  } catch (err) {
    return { available: false, error: `Mutation parse error: ${String(err)}` };
  }
}

function parseStrykerOutput(projectDir: string, relativeReportPath: string): ProbeResult<MutationData> {
  const reportPath = join(projectDir, relativeReportPath);
  if (!existsSync(reportPath)) return { available: false, error: "mutation.json report not found" };
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    metrics?: { mutationScore: number; killed: number; survived: number; timeout: number; totalMutants: number };
  };
  const m = report.metrics;
  if (!m) return { available: false, error: "Unexpected mutation.json shape" };
  return {
    available: true,
    data: { score: Math.round(m.mutationScore * 10) / 10, killed: m.killed, survived: m.survived, timeout: m.timeout, total: m.totalMutants },
  };
}

function parseMutmutOutput(output: string): ProbeResult<MutationData> {
  const killed   = parseInt(output.match(/(\d+) killed/)?.[1] ?? "0", 10);
  const survived = parseInt(output.match(/(\d+) survived/)?.[1] ?? "0", 10);
  const total = killed + survived;
  return { available: true, data: { score: total > 0 ? Math.round((killed / total) * 1000) / 10 : 0, killed, survived, timeout: 0, total } };
}

function parseCountingOutput(output: string): ProbeResult<MutationData> {
  const killed   = parseInt(output.match(/[Kk]illed[:\s]+(\d+)/)?.[1] ?? "0", 10);
  const survived = parseInt(output.match(/[Ss]urvived[:\s]+(\d+)/)?.[1] ?? "0", 10);
  const total = killed + survived;
  return { available: true, data: { score: total > 0 ? Math.round((killed / total) * 1000) / 10 : 0, killed, survived, timeout: 0, total } };
}
