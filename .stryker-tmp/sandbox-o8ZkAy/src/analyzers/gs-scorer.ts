/**
 * GS Property Scorer (§4.3).
 *
 * Scores a project against the seven Generative Specification properties defined
 * in §4.3 of the GS paper: Self-describing, Bounded, Verifiable, Defended,
 * Auditable, Composable, Executable. Each property is scored 0–2 (max 14).
 *
 * Also detects direct-DB calls in route/controller files (Bounded violations)
 * and source modules that lack corresponding test files (Verifiable gaps).
 */
// @ts-nocheck


import { existsSync, readFileSync } from "node:fs";
import { join, extname, dirname, basename } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import { listAllFiles } from "./folder-structure.js";
import type {
  GsProperty,
  GsPropertyScore,
  LayerViolation,
  MissingTestFile,
} from "../shared/types.js";

const logger = createLogger("analyzers/gs-scorer");

// ── Constants ─────────────────────────────────────────────────────────

/** Directories that are considered "route/controller" layers. */
const ROUTE_DIRS = ["routes", "controllers", "handlers", "api", "endpoints"];

/** ORM/DB client call patterns to flag in route files. */
const DB_CALL_PATTERNS: RegExp[] = [
  /\bprisma\.\w+\.\w+\s*\(/, // prisma.user.findMany(
  /\bdb\.\w+\s*\.\s*\w+\s*\(/, // db.user.findMany(
  /\.query\s*\(/, // connection.query(
  /\.execute\s*\(/, // db.execute(
  /\bnew\s+PrismaClient\b/, // new PrismaClient()
  /\bmongoose\.model\b/, // mongoose.model(
  /\bMongoose\b.*\.find\b/, // Mongoose.(*).find(
  /\brepository\s*=\s*null\b/, // uninitialized repository (smell)
];

/** Lines that are comments or imports — excluded from DB call detection. */
const COMMENT_OR_IMPORT = /^\s*(\/\/|\/\*|\*|#|import\s|require\s*\()/;

/** Minimum instruction-file length to be considered substantive. */
const MIN_INSTRUCTION_FILE_LINES = 40;

/** Keywords that indicate an instruction file covers architecture/conventions/decisions. */
const INSTRUCTION_COVERAGE_KEYWORDS = [
  "architecture",
  "convention",
  "decision",
  "adr",
  "domain",
  "pattern",
  "layer",
  "repository",
  "service",
];

/** Minimum distinct keyword hits to award score 2 for Self-describing. */
const MIN_KEYWORD_HITS = 3;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Score all seven GS properties for a project directory.
 *
 * @param projectDir - Absolute path to the project root
 * @param testsPassed - Whether the test suite passed (feeds Verifiable)
 * @param layerViolations - Pre-computed layer violations (feeds Bounded)
 * @param missingTestFiles - Pre-computed missing test files (feeds Verifiable)
 * @param verificationStateDir - Path to .forgecraft/ dir if exists (feeds Executable)
 * @returns Array of scored GS properties in canonical §4.3 order (7 properties)
 */
export function scoreGsProperties(
  projectDir: string,
  testsPassed: boolean,
  layerViolations: LayerViolation[],
  missingTestFiles: MissingTestFile[],
): GsPropertyScore[] {
  logger.info("Scoring GS properties", { projectDir });

  const allFiles = listAllFiles(projectDir);

  return [
    scoreSelfDescribing(projectDir),
    scoreBounded(layerViolations),
    scoreVerifiable(testsPassed, missingTestFiles, allFiles),
    scoreDefended(projectDir),
    scoreAuditable(projectDir, allFiles),
    scoreComposable(projectDir, allFiles),
    scoreExecutable(projectDir, testsPassed),
  ];
}

/**
 * Find all direct-DB / ORM calls inside route and controller source files.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of layer violations with file path, line number, and snippet
 */
export function findDirectDbCallsInRoutes(
  projectDir: string,
): LayerViolation[] {
  const allFiles = listAllFiles(projectDir);
  const routeFiles = allFiles.filter(
    (f) => isRouteFile(f) && isSourceCodeFile(f) && !isTestOrFixtureFile(f),
  );
  const violations: LayerViolation[] = [];

  for (const relPath of routeFiles) {
    const fullPath = join(projectDir, relPath);
    if (!existsSync(fullPath)) continue;

    try {
      const lines = readFileSync(fullPath, "utf-8").split("\n");
      collectDbViolations(lines, relPath, violations);
    } catch {
      // Skip unreadable files silently
    }
  }

  logger.info("Layer violation scan complete", {
    routeFilesScanned: routeFiles.length,
    violations: violations.length,
  });

  return violations;
}

/**
 * For each non-test source file find whether a corresponding test file exists.
 * A test file is considered present if it shares the same base name with a
 * `.test.` or `.spec.` infix anywhere under the project.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of source files that have no detectable test counterpart
 */
export function findMissingTestFiles(projectDir: string): MissingTestFile[] {
  const allFiles = listAllFiles(projectDir);
  const sourceFiles = allFiles.filter(
    (f) =>
      isSourceCodeFile(f) &&
      !isTestOrFixtureFile(f) &&
      !isConfigOrDeclaration(f),
  );

  const missing: MissingTestFile[] = [];

  for (const sourceFile of sourceFiles) {
    const base = stripExtension(basename(sourceFile));
    const expectedTestFile = buildExpectedTestPath(sourceFile, base);
    const hasTest = testFileExists(base, allFiles);

    if (!hasTest) {
      missing.push({ sourceFile, expectedTestFile });
    }
  }

  return missing;
}

// ── Property Scorers ──────────────────────────────────────────────────

/**
 * Self-describing: instruction file exists, is substantive, and covers
 * architecture / conventions / decisions.
 */
function scoreSelfDescribing(projectDir: string): GsPropertyScore {
  const instructionPaths = [
    "CLAUDE.md",
    ".cursor/rules",
    ".github/copilot-instructions.md",
    ".windsurfrules",
    ".clinerules",
    "CONVENTIONS.md",
  ];

  const found = instructionPaths.find((p) => existsSync(join(projectDir, p)));

  if (!found) {
    return gs("self-describing", 0, ["No AI assistant instruction file found"]);
  }

  const content = safeReadText(join(projectDir, found));
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length < MIN_INSTRUCTION_FILE_LINES) {
    return gs("self-describing", 1, [
      `${found} found but only ${lines.length} non-empty lines (< ${MIN_INSTRUCTION_FILE_LINES} — treat as stub)`,
    ]);
  }

  const lower = content.toLowerCase();
  const hits = INSTRUCTION_COVERAGE_KEYWORDS.filter((kw) => lower.includes(kw));

  if (hits.length < MIN_KEYWORD_HITS) {
    return gs("self-describing", 1, [
      `${found} found (${lines.length} lines) but covers fewer than ${MIN_KEYWORD_HITS} architecture/convention keywords`,
      `Missing keywords: ${INSTRUCTION_COVERAGE_KEYWORDS.filter(
        (kw) => !lower.includes(kw),
      )
        .slice(0, 5)
        .join(", ")}`,
    ]);
  }

  return gs("self-describing", 2, [
    `${found} found — ${lines.length} non-empty lines`,
    `Covers: ${hits.join(", ")}`,
  ]);
}

/**
 * Bounded: no direct DB calls in route/controller files.
 * 2 = zero violations, 1 = 1–2, 0 = 3+.
 */
function scoreBounded(violations: LayerViolation[]): GsPropertyScore {
  const count = violations.length;

  if (count === 0) {
    return gs("bounded", 2, [
      "No direct DB/ORM calls detected in route or controller files",
    ]);
  }

  if (count <= 2) {
    return gs("bounded", 1, [
      `${count} direct DB call(s) found in route/controller files`,
      ...violations.map((v) => `  ${v.file}:${v.line} — ${v.snippet.trim()}`),
    ]);
  }

  return gs("bounded", 0, [
    `${count} direct DB calls found — route layer is calling the DB directly`,
    ...violations
      .slice(0, 5)
      .map((v) => `  ${v.file}:${v.line} — ${v.snippet.trim()}`),
    ...(count > 5 ? [`  … and ${count - 5} more`] : []),
  ]);
}

/**
 * Verifiable: tests present, pass, and most source files have coverage.
 * 2 = tests pass + ≤ 20% missing, 1 = tests exist (pass or fail) + > 20% missing, 0 = no tests.
 */
function scoreVerifiable(
  testsPassed: boolean,
  missingTestFiles: MissingTestFile[],
  allFiles: string[],
): GsPropertyScore {
  const testFiles = allFiles.filter(isTestOrFixtureFile);

  if (testFiles.length === 0) {
    return gs("verifiable", 0, ["No test files found in project"]);
  }

  const sourceCount = allFiles.filter(
    (f) =>
      isSourceCodeFile(f) &&
      !isTestOrFixtureFile(f) &&
      !isConfigOrDeclaration(f),
  ).length;

  const missingCount = missingTestFiles.length;
  const missingPct = sourceCount > 0 ? missingCount / sourceCount : 0;
  const coveredPct = Math.round((1 - missingPct) * 100);

  if (testsPassed && missingPct <= 0.2) {
    return gs("verifiable", 2, [
      `Tests passed — ${testFiles.length} test file(s) found`,
      `${coveredPct}% of source modules have test counterparts`,
    ]);
  }

  const evidence: string[] = [`${testFiles.length} test file(s) found`];
  if (!testsPassed) evidence.push("Test suite did not pass");
  if (missingPct > 0.2) {
    evidence.push(`${coveredPct}% of source modules have tests (target ≥ 80%)`);
    evidence.push(`${missingCount} module(s) without tests`);
  }

  return gs("verifiable", 1, evidence);
}

/**
 * Defended: pre-commit hooks and lint configuration present.
 * 2 = pre-commit hook exists, 1 = lint config only, 0 = neither.
 */
function scoreDefended(projectDir: string): GsPropertyScore {
  const huskyHook = join(projectDir, ".husky", "pre-commit");
  const gitHook = join(projectDir, ".git", "hooks", "pre-commit");
  const hasPreCommitHook = existsSync(huskyHook) || existsSync(gitHook);

  const lintConfigs = [
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    "eslint.config.js",
    "eslint.config.mjs",
    ".pylintrc",
    "pyproject.toml",
    "biome.json",
    ".oxlintrc.json",
  ];
  const hasLint = lintConfigs.some((c) => existsSync(join(projectDir, c)));

  if (hasPreCommitHook) {
    return gs("defended", 2, [
      `Pre-commit hook found: ${existsSync(huskyHook) ? ".husky/pre-commit" : ".git/hooks/pre-commit"}`,
      hasLint ? "Lint configuration present" : "No lint config detected",
    ]);
  }

  if (hasLint) {
    return gs("defended", 1, [
      "Lint configuration present but no pre-commit hook found",
      "Add a pre-commit hook (e.g. husky) to block non-conforming commits",
    ]);
  }

  return gs("defended", 0, [
    "No pre-commit hook found",
    "No lint configuration found",
  ]);
}

/**
 * Auditable: ADRs, Status.md, and conventional commit infrastructure present.
 * 2 = ADRs + Status.md + commit config, 1 = some subset, 0 = none.
 */
function scoreAuditable(
  projectDir: string,
  allFiles: string[],
): GsPropertyScore {
  const adrFiles = allFiles.filter(
    (f) =>
      /docs\/(adrs?|decisions?|rfcs?)\//i.test(f.replace(/\\/g, "/")) &&
      f.endsWith(".md"),
  );
  const hasAdrs = adrFiles.length > 0;

  const statusPaths = ["Status.md", "status.md", "STATUS.md", "CHANGELOG.md"];
  const hasStatus = statusPaths.some((p) => existsSync(join(projectDir, p)));

  const commitConfigs = [
    "commitlint.config.js",
    "commitlint.config.cjs",
    "commitlint.config.mjs",
    ".commitlintrc.js",
    ".commitlintrc.json",
    ".commitlintrc.yaml",
    ".husky/commit-msg",
  ];
  const hasCommitConfig = commitConfigs.some((p) =>
    existsSync(join(projectDir, p)),
  );

  const signals = [hasAdrs, hasStatus, hasCommitConfig].filter(Boolean).length;

  if (signals === 3) {
    return gs("auditable", 2, [
      `${adrFiles.length} ADR file(s) found in docs/adrs/`,
      "Status.md / CHANGELOG.md present",
      "Conventional commit configuration present",
    ]);
  }

  if (signals >= 1) {
    const present: string[] = [];
    const absent: string[] = [];
    if (hasAdrs) present.push(`${adrFiles.length} ADR(s)`);
    else absent.push("ADRs in docs/adrs/");
    if (hasStatus) present.push("Status.md");
    else absent.push("Status.md / CHANGELOG.md");
    if (hasCommitConfig) present.push("commit config");
    else absent.push("commitlint config");

    return gs("auditable", 1, [
      `Present: ${present.join(", ")}`,
      `Missing: ${absent.join(", ")}`,
    ]);
  }

  return gs("auditable", 0, [
    "No ADRs found (expected in docs/adrs/)",
    "No Status.md or CHANGELOG.md found",
    "No conventional commit configuration found",
  ]);
}

/**
 * Composable: service layer, repository pattern, and interface-first design.
 * 2 = services + repositories + interface files, 1 = services only, 0 = none.
 *
 * Recognizes both conventional CRUD patterns (services/repositories/) and
 * CLI/LIBRARY patterns (tools/handlers/ as services, registry/adapters/ as repositories).
 */
function scoreComposable(
  projectDir: string,
  allFiles: string[],
): GsPropertyScore {
  const hasSrc = existsSync(join(projectDir, "src"));
  const root = hasSrc ? "src" : "";

  const serviceDir = [
    join(root, "services"),
    join(root, "service"),
    // CLI / LIBRARY patterns
    join(root, "tools"),
    join(root, "handlers"),
    join(root, "use-cases"),
    join(root, "usecases"),
    "services",
    "service",
  ].find((d) => existsSync(join(projectDir, d)));

  const repositoryDir = [
    join(root, "repositories"),
    join(root, "repository"),
    // CLI / LIBRARY patterns: registry, adapters, loaders, providers
    join(root, "registry"),
    join(root, "adapters"),
    join(root, "providers"),
    join(root, "loaders"),
    "repositories",
    "repository",
  ].find((d) => existsSync(join(projectDir, d)));

  const hasInterfaces = allFiles.some(
    (f) =>
      /\/(interfaces?|contracts?|ports?|types?|core)\//i.test(
        f.replace(/\\/g, "/"),
      ) && isSourceCodeFile(f),
  );

  if (serviceDir && repositoryDir) {
    return gs("composable", 2, [
      `Service layer found: ${serviceDir}/`,
      `Repository layer found: ${repositoryDir}/`,
      hasInterfaces
        ? "Interface/contract files detected"
        : "No dedicated interface files (partial credit)",
    ]);
  }

  if (serviceDir) {
    return gs("composable", 1, [
      `Service layer found: ${serviceDir}/`,
      "No repository layer found — consider extracting DB access to repositories/",
    ]);
  }

  return gs("composable", 0, [
    "No service layer found — business logic likely lives in route handlers",
    "No repository layer found",
  ]);
}

/**
 * Executable: runtime evidence that generated output satisfies behavioral contracts.
 *
 * Distinguished from Verifiable (which checks test existence and coverage):
 * Executable checks whether there is evidence the implementation was actually
 * exercised against a real runtime environment, not just statically analyzed.
 *
 * Scoring:
 *   2 = tests passed + CI configured (automated runtime evidence) OR
 *       .forgecraft/verification-state.json exists with passed steps
 *   1 = tests passed locally but no CI or verification state
 *       (local evidence only — sufficient for development, not pre-release)
 *   0 = tests failed OR no test infrastructure
 */
function scoreExecutable(
  projectDir: string,
  testsPassed: boolean,
): GsPropertyScore {
  if (!testsPassed) {
    return gs("executable", 0, [
      "Tests did not pass — implementation does not satisfy its behavioral contracts at runtime",
    ]);
  }

  // Check for verification-state.json (strongest evidence: step-level acceptance recorded)
  const verificationState = join(
    projectDir,
    ".forgecraft",
    "verification-state.json",
  );
  if (existsSync(verificationState)) {
    try {
      const raw = readFileSync(verificationState, "utf-8");
      const state = JSON.parse(raw) as {
        aggregate_s?: number;
        summary?: Array<{ passedSteps: number }>;
      };
      const hasPassedSteps =
        state.summary?.some((s) => s.passedSteps > 0) ?? false;
      if (hasPassedSteps) {
        return gs("executable", 2, [
          "Tests passed + verification-state.json records accepted runtime steps",
          `Aggregate S: ${state.aggregate_s?.toFixed(2) ?? "unknown"}`,
        ]);
      }
    } catch {
      // Fall through
    }
  }

  // Check for CI configuration (automated execution evidence)
  const ciPaths = [
    ".github/workflows",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "Jenkinsfile",
    ".travis.yml",
    "azure-pipelines.yml",
  ];
  const hasCi = ciPaths.some((p) => existsSync(join(projectDir, p)));

  if (hasCi) {
    return gs("executable", 2, [
      "Tests passed + CI pipeline configured (automated runtime execution evidence)",
    ]);
  }

  return gs("executable", 1, [
    "Tests passed locally but no CI configured and no verification-state.json",
    "Local pass is necessary but not sufficient for pre-release — add CI or record_verification steps",
  ]);
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a GsPropertyScore record. */
function gs(
  property: GsProperty,
  score: 0 | 1 | 2,
  evidence: string[],
): GsPropertyScore {
  return { property, score, evidence };
}

/** Collect DB-call violations from a single file's lines. */
function collectDbViolations(
  lines: string[],
  relPath: string,
  violations: LayerViolation[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (COMMENT_OR_IMPORT.test(line)) continue;
    const matchedPattern = DB_CALL_PATTERNS.find((p) => p.test(line));
    if (matchedPattern) {
      violations.push({
        file: relPath,
        line: i + 1,
        snippet: line.slice(0, 120),
      });
    }
  }
}

/** Strip the file extension from a filename. */
function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** Build the canonical expected test file path for a source file. */
function buildExpectedTestPath(sourceFile: string, base: string): string {
  const dir = dirname(sourceFile);
  return `${dir}/${base}.test.ts`;
}

/**
 * Check whether a test file exists for a given source base name.
 * Checks across the entire file set (co-located or in tests/ mirror).
 */
function testFileExists(base: string, allFiles: string[]): boolean {
  return allFiles.some(
    (f) =>
      isTestOrFixtureFile(f) &&
      stripExtension(basename(f)).replace(/\.(test|spec)$/, "") === base,
  );
}

/** Read a file as UTF-8 text, returning empty string on failure. */
function safeReadText(fullPath: string): string {
  try {
    return readFileSync(fullPath, "utf-8");
  } catch {
    return "";
  }
}

/** True for TypeScript/JavaScript/Python/Kotlin/Rust source files. */
function isSourceCodeFile(filePath: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".py", ".kt", ".rs"].includes(
    extname(filePath),
  );
}

/** True for test or fixture files (should not require their own test). */
function isTestOrFixtureFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /(\btest[_.]|\.test\.|\.spec\.|__tests__|\/tests\/|\/test\/|\/fixtures\/|\/mocks?\/|conftest|\.d\.ts)/.test(
    normalized,
  );
}

/** True for declaration, config, or infrastructure files. */
function isConfigOrDeclaration(filePath: string): boolean {
  return /(\.d\.ts|config\.|\.config\.|migration|seed|schema\.prisma|index\.ts)/.test(
    filePath,
  );
}

/** True if a file path is inside a route or controller directory. */
function isRouteFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return ROUTE_DIRS.some((dir) =>
    new RegExp(`(^|/)${dir}/`, "i").test(normalized),
  );
}
