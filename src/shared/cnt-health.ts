/**
 * CNT (Context Navigation Tree) health checks.
 *
 * Two functions:
 *   detectCntDrift  — compare .claude/ tree against current module structure
 *   auditCntHealth  — check CNT structural constraints (line limits, required files)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readExceptions, findMatchingException } from "./exceptions.js";

export interface CntDriftResult {
  readonly hasCnt: boolean;
  /** CNT nodes that reference modules not found in src/ */
  readonly staleNodes: string[];
  /** Source modules with no corresponding CNT node */
  readonly uncoveredModules: string[];
  readonly message?: string;
}

export interface CntAuditResult {
  readonly hasCnt: boolean;
  readonly claudeMdLines: number | null;
  readonly claudeMdPass: boolean;
  readonly coreMdLines: number | null;
  readonly coreMdPass: boolean;
  readonly leafViolations: ReadonlyArray<{ file: string; lines: number }>;
  readonly indexMdPresent: boolean;
  /** Leaf nodes with no routing directive in .claude/index.md */
  readonly unroutedLeaves: ReadonlyArray<string>;
  readonly routingPass: boolean;
  readonly score: number;
  readonly issues: string[];
}

/** Ignored directory names when scanning src/ */
const IGNORED_SRC_DIRS = new Set(["node_modules", "dist", "coverage", ".git"]);

/**
 * Read filenames (without extension) from .claude/standards/.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of leaf node names without .md extension
 */
function readCntLeafNames(projectDir: string): string[] {
  const standardsDir = join(projectDir, ".claude", "standards");
  if (!existsSync(standardsDir)) return [];
  try {
    return readdirSync(standardsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

/**
 * Read top-level directory names from src/.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of src/ subdirectory names
 */
function readSrcModuleNames(projectDir: string): string[] {
  const srcDir = join(projectDir, "src");
  if (!existsSync(srcDir)) return [];
  try {
    return readdirSync(srcDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !IGNORED_SRC_DIRS.has(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Detect drift between .claude/ CNT tree and current src/ module structure.
 *
 * @param projectDir - Absolute path to project root
 * @returns CntDriftResult with stale nodes and uncovered modules
 */
export function detectCntDrift(projectDir: string): CntDriftResult {
  const indexPath = join(projectDir, ".claude", "index.md");
  if (!existsSync(indexPath))
    return { hasCnt: false, staleNodes: [], uncoveredModules: [] };

  const leafNames = readCntLeafNames(projectDir);
  const srcModules = readSrcModuleNames(projectDir);
  const srcModuleSet = new Set(srcModules);

  const staleNodes = leafNames.filter((leaf) => {
    const domainSegment = leaf.split("-")[0] ?? "";
    return !srcModuleSet.has(domainSegment);
  });

  const leafDomains = new Set(
    leafNames.map((leaf) => leaf.split("-")[0] ?? ""),
  );
  const uncoveredModules = srcModules.filter((mod) => !leafDomains.has(mod));

  const message = buildDriftMessage(staleNodes, uncoveredModules);

  return { hasCnt: true, staleNodes, uncoveredModules, message };
}

/**
 * Build human-readable message for drift results.
 *
 * @param staleNodes - CNT nodes with no matching src/ module
 * @param uncoveredModules - src/ modules with no CNT node
 * @returns Message string, or undefined if no drift
 */
function buildDriftMessage(
  staleNodes: string[],
  uncoveredModules: string[],
): string | undefined {
  const lines: string[] = [];
  if (staleNodes.length > 0) {
    lines.push(
      `Stale CNT nodes (no matching src/ module): ${staleNodes.join(", ")}`,
    );
  }
  if (uncoveredModules.length > 0) {
    lines.push(
      `Uncovered src/ modules (no CNT node): ${uncoveredModules.join(", ")}`,
    );
  }
  return lines.length > 0 ? lines.join(". ") : undefined;
}

/**
 * Count lines in a file, returning null if the file doesn't exist.
 *
 * @param filePath - Absolute path to file
 * @returns Line count, or null if file absent
 */
function countFileLines(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .filter((l, i, arr) => i < arr.length - 1 || l !== "").length;
  } catch {
    return null;
  }
}

/**
 * Audit CNT structural constraints.
 *
 * @param projectDir - Absolute path to project root
 * @returns CntAuditResult with scores and violations
 */
export function auditCntHealth(projectDir: string): CntAuditResult {
  const indexPath = join(projectDir, ".claude", "index.md");
  const hasCnt = existsSync(indexPath);

  if (!hasCnt) {
    return {
      hasCnt: false,
      claudeMdLines: null,
      claudeMdPass: false,
      coreMdLines: null,
      coreMdPass: false,
      leafViolations: [],
      indexMdPresent: false,
      unroutedLeaves: [],
      routingPass: true,
      score: 0,
      issues: ["CNT not initialized — .claude/index.md missing"],
    };
  }

  const exceptions = readExceptions(projectDir);
  const claudeMdLines = countFileLines(join(projectDir, "CLAUDE.md"));
  const coreMdLines = countFileLines(join(projectDir, ".claude", "core.md"));
  // Honor exceptions: if CLAUDE.md or core.md is exempted, treat as passing.
  const claudeMdExempt = !!findMatchingException(
    exceptions,
    "audit/cnt_claude_md",
    "CLAUDE.md",
  );
  const coreMdExempt = !!findMatchingException(
    exceptions,
    "audit/cnt_core_md",
    ".claude/core.md",
  );
  const claudeMdPass =
    claudeMdExempt || (claudeMdLines !== null && claudeMdLines <= 3);
  const coreMdPass =
    coreMdExempt || (coreMdLines !== null && coreMdLines <= 50);
  const indexMdPresent = true;

  const leafViolations = findLeafViolations(projectDir, exceptions);
  const unroutedLeaves = findUnroutedLeaves(projectDir);
  const routingPass = unroutedLeaves.length === 0;

  const issues = buildAuditIssues(
    claudeMdLines,
    claudeMdPass,
    coreMdLines,
    coreMdPass,
    leafViolations,
    unroutedLeaves,
  );

  const totalChecks = 5; // CLAUDE.md, core.md, index.md, no leaf violations, routing
  const passing =
    (claudeMdPass ? 1 : 0) +
    (coreMdPass ? 1 : 0) +
    1 + // index.md present
    (leafViolations.length === 0 ? 1 : 0) +
    (routingPass ? 1 : 0);
  const score = Math.round((passing / totalChecks) * 100);

  return {
    hasCnt,
    claudeMdLines,
    claudeMdPass,
    coreMdLines,
    coreMdPass,
    leafViolations,
    indexMdPresent,
    unroutedLeaves,
    routingPass,
    score,
    issues,
  };
}

/**
 * Find leaf nodes that have no routing directive in .claude/index.md.
 *
 * A routing directive is any line in index.md that references the leaf's
 * stem (filename without .md extension). Typical forms:
 *   - "read .claude/standards/tools-routing.md when working on tools/"
 *   - "→ standards/tools-routing.md"
 *   - "[tools-routing](standards/tools-routing.md)"
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of leaf filenames (without .md) that have no routing reference
 */
export function findUnroutedLeaves(projectDir: string): string[] {
  const indexPath = join(projectDir, ".claude", "index.md");
  if (!existsSync(indexPath)) return [];
  let indexContent = "";
  try {
    indexContent = readFileSync(indexPath, "utf-8").toLowerCase();
  } catch {
    return [];
  }

  const leafNames = readCntLeafNames(projectDir);
  return leafNames.filter((leaf) => {
    const stem = leaf.toLowerCase();
    return !indexContent.includes(stem);
  });
}

/** Prefix written by the sentinel renderer on the first line of scaffold-generated files. */
const SCAFFOLD_SENTINEL_PREFIX = "<!-- ForgeCraft sentinel:";

/**
 * Find leaf node files that exceed the 30-line limit.
 * Scaffold-generated files (starting with the ForgeCraft sentinel comment) are exempt —
 * they intentionally contain full domain content and are not user-managed nodes.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of violations with file name and line count
 */
function findLeafViolations(
  projectDir: string,
  exceptions: ReturnType<typeof readExceptions> = [],
): Array<{ file: string; lines: number }> {
  const standardsDir = join(projectDir, ".claude", "standards");
  if (!existsSync(standardsDir)) return [];
  try {
    return readdirSync(standardsDir)
      .filter((f) => f.endsWith(".md"))
      .flatMap((f) => {
        const fullPath = join(standardsDir, f);
        const content = readFileSync(fullPath, "utf-8");
        if (content.startsWith(SCAFFOLD_SENTINEL_PREFIX)) return [];
        const relPath = `.claude/standards/${f}`;
        if (findMatchingException(exceptions, "audit/cnt_leaf_length", relPath))
          return [];
        const lines = countFileLines(fullPath);
        return lines !== null && lines > 30 ? [{ file: f, lines }] : [];
      });
  } catch {
    return [];
  }
}

/**
 * Build the issues list from audit check results.
 *
 * @param claudeMdLines - Line count of CLAUDE.md
 * @param claudeMdPass - Whether CLAUDE.md passes the limit
 * @param coreMdLines - Line count of .claude/core.md
 * @param coreMdPass - Whether core.md passes the limit
 * @param leafViolations - Leaf nodes exceeding 30 lines
 * @returns Array of issue strings
 */
function buildAuditIssues(
  claudeMdLines: number | null,
  claudeMdPass: boolean,
  coreMdLines: number | null,
  coreMdPass: boolean,
  leafViolations: ReadonlyArray<{ file: string; lines: number }>,
  unroutedLeaves: ReadonlyArray<string> = [],
): string[] {
  const issues: string[] = [];
  if (claudeMdLines === null) {
    issues.push("CLAUDE.md missing");
  } else if (!claudeMdPass) {
    issues.push(`CLAUDE.md has ${claudeMdLines} lines (limit: 3)`);
  }
  if (coreMdLines === null) {
    issues.push(".claude/core.md missing");
  } else if (!coreMdPass) {
    issues.push(`.claude/core.md has ${coreMdLines} lines (limit: 50)`);
  }
  for (const v of leafViolations) {
    issues.push(`.claude/standards/${v.file} has ${v.lines} lines (limit: 30)`);
  }
  if (unroutedLeaves.length > 0) {
    issues.push(
      `${unroutedLeaves.length} leaf node(s) have no routing directive in .claude/index.md: ${unroutedLeaves.join(", ")} — run cnt_add_routing to generate routing block`,
    );
  }
  return issues;
}
