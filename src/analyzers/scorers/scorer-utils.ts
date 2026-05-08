/**
 * Shared constants and utility functions for GS property scorers.
 */

import { extname, basename, dirname } from "node:path";
import type {
  GsProperty,
  GsPropertyScore,
  LayerViolation,
} from "../../shared/types.js";

// ── Constants ─────────────────────────────────────────────────────────

/** Directories that are considered "route/controller" layers. */
export const ROUTE_DIRS = [
  "routes",
  "controllers",
  "handlers",
  "api",
  "endpoints",
];

/** ORM/DB client call patterns to flag in route files. */
export const DB_CALL_PATTERNS: RegExp[] = [
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
export const COMMENT_OR_IMPORT = /^\s*(\/\/|\/\*|\*|#|import\s|require\s*\()/;

/**
 * Keywords that indicate an instruction file covers architecture/conventions/decisions.
 * Intentionally broad to be tech-agnostic: web services, libraries, CLIs,
 * GitHub Actions, and ML projects each use different vocabulary.
 */
export const INSTRUCTION_COVERAGE_KEYWORDS = [
  // Web service / layered architecture terms
  "architecture",
  "layer",
  "repository",
  "service",
  // Universal design terms
  "convention",
  "decision",
  "pattern",
  "module",
  "interface",
  "constraint",
  "behavior",
  // Documentation/traceability
  "adr",
  "domain",
  // Action/CLI/tool-specific
  "workflow",
  "input",
  "output",
  "command",
  "tool",
];

/** Minimum distinct keyword hits to award score 2 for Self-describing. */
export const MIN_KEYWORD_HITS = 3;

// ── Builder ────────────────────────────────────────────────────────────

/** Build a GsPropertyScore record. */
export function gs(
  property: GsProperty,
  score: 0 | 1 | 2,
  evidence: string[],
): GsPropertyScore {
  return { property, score, evidence };
}

// ── File classification helpers ────────────────────────────────────────

/** True for TypeScript/JavaScript/Python/Kotlin/Rust source files. */
export function isSourceCodeFile(filePath: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".py", ".kt", ".rs"].includes(
    extname(filePath),
  );
}

/** True for test or fixture files (should not require their own test). */
export function isTestOrFixtureFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /(\btest[_.]|\.test\.|\.spec\.|__tests__|\/tests\/|\/test\/|\/fixtures\/|\/mocks?\/|conftest|\.d\.ts)/.test(
    normalized,
  );
}

/** True for declaration, config, or infrastructure files. */
export function isConfigOrDeclaration(filePath: string): boolean {
  return /(\.d\.ts|config\.|\.config\.|migration|seed|schema\.prisma|index\.ts)/.test(
    filePath,
  );
}

/** True if a file path is inside a route or controller directory. */
export function isRouteFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return ROUTE_DIRS.some((dir) =>
    new RegExp(`(^|/)${dir}/`, "i").test(normalized),
  );
}

// ── Utility functions ──────────────────────────────────────────────────

/** Collect DB-call violations from a single file's lines. */
export function collectDbViolations(
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
export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** Build the canonical expected test file path for a source file. */
export function buildExpectedTestPath(
  sourceFile: string,
  base: string,
): string {
  const dir = dirname(sourceFile);
  return `${dir}/${base}.test.ts`;
}

/**
 * Check whether a test file exists for a given source base name.
 * Checks across the entire file set (co-located or in tests/ mirror).
 */
export function testFileExists(base: string, allFiles: string[]): boolean {
  return allFiles.some(
    (f) =>
      isTestOrFixtureFile(f) &&
      stripExtension(basename(f)).replace(/\.(test|spec)$/, "") === base,
  );
}
