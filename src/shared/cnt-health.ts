/**
 * CNT (Context Navigation Tree) health checks.
 *
 * Two functions:
 *   detectCntDrift  — compare .claude/ tree against current module structure
 *   auditCntHealth  — check CNT structural constraints (line limits, required files)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
    return content.split("\n").length;
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
      score: 0,
      issues: ["CNT not initialized — .claude/index.md missing"],
    };
  }

  const claudeMdLines = countFileLines(join(projectDir, "CLAUDE.md"));
  const coreMdLines = countFileLines(join(projectDir, ".claude", "core.md"));
  const claudeMdPass = claudeMdLines !== null && claudeMdLines <= 3;
  const coreMdPass = coreMdLines !== null && coreMdLines <= 50;
  const indexMdPresent = true;

  const leafViolations = findLeafViolations(projectDir);
  const issues = buildAuditIssues(
    claudeMdLines,
    claudeMdPass,
    coreMdLines,
    coreMdPass,
    leafViolations,
  );

  const totalChecks = 4; // CLAUDE.md, core.md, index.md, no leaf violations
  const passing =
    (claudeMdPass ? 1 : 0) +
    (coreMdPass ? 1 : 0) +
    1 + // index.md present
    (leafViolations.length === 0 ? 1 : 0);
  const score = Math.round((passing / totalChecks) * 100);

  return {
    hasCnt,
    claudeMdLines,
    claudeMdPass,
    coreMdLines,
    coreMdPass,
    leafViolations,
    indexMdPresent,
    score,
    issues,
  };
}

/**
 * Find leaf node files that exceed the 30-line limit.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of violations with file name and line count
 */
function findLeafViolations(
  projectDir: string,
): Array<{ file: string; lines: number }> {
  const standardsDir = join(projectDir, ".claude", "standards");
  if (!existsSync(standardsDir)) return [];
  try {
    return readdirSync(standardsDir)
      .filter((f) => f.endsWith(".md"))
      .flatMap((f) => {
        const lines = countFileLines(join(standardsDir, f));
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
  return issues;
}
