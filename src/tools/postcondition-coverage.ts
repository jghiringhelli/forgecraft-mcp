/**
 * Postcondition coverage analysis for L2 harness probes.
 *
 * Parses **Acceptance Criteria** and **Postcondition** sections from use-cases.md,
 * counts machine-detectable assertions in corresponding probe files,
 * and computes a per-UC coverage ratio.
 *
 * A "hollow" probe is one that runs and exits 0 but contains zero assertion signals —
 * more dangerous than not_implemented because it produces false confidence.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

export interface UcPostconditionCoverage {
  readonly ucId: string;
  readonly title: string;
  /** Count of Acceptance Criteria bullets + Postcondition lines in use-cases.md */
  readonly postconditionCount: number;
  /** Total assertion signals detected across all probe files for this UC */
  readonly assertionCount: number;
  /** assertionCount / postconditionCount, capped at 1.0 */
  readonly coverageRatio: number;
  /** Probe files found for this UC */
  readonly probeFiles: ReadonlyArray<string>;
  /** true when probe file exists but 0 assertion signals detected */
  readonly hollow: boolean;
}

// ── Postcondition Parsing ─────────────────────────────────────────────

/**
 * Parse postcondition + acceptance criteria count for a single UC block.
 * Returns 0 if no postcondition sections found.
 */
export function parsePostconditionCount(ucBlock: string): number {
  let count = 0;

  // Count **Postcondition**: lines (usually 1, occasionally a list)
  const postconditionMatches = ucBlock.match(/\*\*Postcondition\*\*:/g);
  if (postconditionMatches) count += postconditionMatches.length;

  // Count **Acceptance Criteria** bullets — each [ ] item is a checkable postcondition
  const acSection =
    /\*\*Acceptance Criteria\*\*[^:]*:([\s\S]*?)(?=\n##|\n\*\*[A-Z]|$)/.exec(
      ucBlock,
    );
  if (acSection) {
    const bullets = acSection[1]!.match(/^\s*-\s+\[[ x?]\]/gm);
    if (bullets) count += bullets.length;
  }

  return count;
}

/**
 * Split use-cases.md content into per-UC blocks keyed by UC-NNN id.
 */
export function splitUcBlocks(content: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const sections = content.split(/^(?=##\s+UC-\d{3}:)/m);
  for (const section of sections) {
    const m = /^##\s+(UC-\d{3}):/m.exec(section);
    if (m) blocks.set(m[1]!.toUpperCase(), section);
  }
  return blocks;
}

// ── Assertion Detection ───────────────────────────────────────────────

/** Count assertion signals in a shell probe file (.sh). */
function countShAssertions(content: string): number {
  let count = 0;
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    // Structural assertion patterns in shell
    if (/\bgrep\b/.test(trimmed)) count++;
    if (/\bcurl\b.*--fail/.test(trimmed)) count++;
    if (/HTTP_CODE|STATUS|status_code/.test(trimmed)) count++;
    if (/\[\s*"\$/.test(trimmed) && /==|!=|-eq|-ne/.test(trimmed)) count++;
    if (/\[\[\s*/.test(trimmed) && /==|!=/.test(trimmed)) count++;
    if (/\bassert\b/.test(trimmed)) count++;
    if (/\bfail\b.*"/.test(trimmed) && /expected|should|must/.test(trimmed))
      count++;
    // HTTP status checks common in forgecraft probes
    if (
      /200|201|204|400|401|403|404|409|422|500/.test(trimmed) &&
      /\$/.test(trimmed)
    )
      count++;
    if (/jq\s+/.test(trimmed) && /\|/.test(trimmed)) count++;
  }
  return count;
}

/** Count assertion signals in a TypeScript/Jest probe file (.spec.ts, .sim.ts). */
function countTsAssertions(content: string): number {
  const patterns = [
    /\bexpect\s*\(/g,
    /\bassert\s*\./g,
    /\.toBe\s*\(/g,
    /\.toEqual\s*\(/g,
    /\.toContain\s*\(/g,
    /\.toHaveLength\s*\(/g,
    /\.toHaveBeenCalled/g,
    /\.toMatchObject\s*\(/g,
    /\.toThrow\s*\(/g,
    /\.resolves\./g,
    /\.rejects\./g,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/** Count assertion signals in a Hurl HTTP probe file (.hurl). */
function countHurlAssertions(content: string): number {
  let count = 0;
  const lines = content.split("\n");
  let inAsserts = false;
  for (const line of lines) {
    if (/^\[Asserts\]/.test(line)) {
      inAsserts = true;
      continue;
    }
    if (/^\[/.test(line) && inAsserts) inAsserts = false;
    if (inAsserts && line.trim() && !line.trim().startsWith("#")) count++;
    if (/^HTTP\s+[2345]\d{2}/.test(line.trim())) count++;
  }
  return count;
}

/** Count assertion signals in a k6 load test file (.k6.js). */
function countK6Assertions(content: string): number {
  const patterns = [
    /\bcheck\s*\(/g,
    /\bexpect\s*\(/g,
    /===|!==/.test(content) && /response|res\b/.test(content)
      ? /===|!==\s*\d+/g
      : null,
  ].filter((p): p is RegExp => p !== null);
  let count = 0;
  for (const p of patterns) {
    const m = content.match(p);
    if (m) count += m.length;
  }
  return count;
}

/** Detect if a probe file is a stub (contains TODO markers and no real logic). */
function isStubProbe(content: string): boolean {
  const todoCount = (
    content.match(/TODO|FIXME|NOT.IMPLEMENTED|not.implemented/gi) ?? []
  ).length;
  const lineCount = content
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  return todoCount > 0 && lineCount < 10;
}

/**
 * Count assertion signals in a probe file based on its extension.
 * Returns { count, isStub } — stubs are tracked separately.
 */
export function countProbeAssertions(filePath: string): {
  count: number;
  isStub: boolean;
} {
  let content = "";
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return { count: 0, isStub: false };
  }
  if (isStubProbe(content)) return { count: 0, isStub: true };

  if (filePath.endsWith(".sh"))
    return { count: countShAssertions(content), isStub: false };
  if (filePath.endsWith(".spec.ts") || filePath.endsWith(".sim.ts")) {
    return { count: countTsAssertions(content), isStub: false };
  }
  if (filePath.endsWith(".hurl"))
    return { count: countHurlAssertions(content), isStub: false };
  if (filePath.endsWith(".k6.js"))
    return { count: countK6Assertions(content), isStub: false };
  return { count: 0, isStub: false };
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Compute postcondition coverage for all use cases.
 *
 * @param projectDir - Absolute project root
 * @param ucs - Array of { id, title } from parseUseCases()
 * @returns Per-UC coverage report
 */
export function computePostconditionCoverage(
  projectDir: string,
  ucs: ReadonlyArray<{ id: string; title: string }>,
): UcPostconditionCoverage[] {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  const ucBlocks = existsSync(useCasesPath)
    ? splitUcBlocks(readFileSync(useCasesPath, "utf-8"))
    : new Map<string, string>();

  const harnessDir = join(projectDir, "tests", "harness");
  const allProbeFiles = existsSync(harnessDir)
    ? readdirSync(harnessDir).filter(
        (f) =>
          f.endsWith(".sh") ||
          f.endsWith(".spec.ts") ||
          f.endsWith(".hurl") ||
          f.endsWith(".sim.ts") ||
          f.endsWith(".k6.js"),
      )
    : [];

  return ucs.map((uc) => {
    const ucId = uc.id.toUpperCase();
    const lower = ucId.toLowerCase().replace(/_/g, "-");

    // Postcondition count from spec
    const block = ucBlocks.get(ucId) ?? "";
    const postconditionCount = parsePostconditionCount(block);

    // Find probe files for this UC
    const probeFiles = allProbeFiles.filter(
      (f) =>
        f.toLowerCase().startsWith(lower + "-") ||
        f.toLowerCase().startsWith(lower + "."),
    );

    // Count assertions across all probe files
    let totalAssertions = 0;
    let anyStub = false;
    for (const f of probeFiles) {
      const { count, isStub } = countProbeAssertions(join(harnessDir, f));
      totalAssertions += count;
      if (isStub) anyStub = true;
    }

    const hollow = probeFiles.length > 0 && totalAssertions === 0 && !anyStub;
    const coverageRatio =
      postconditionCount > 0
        ? Math.min(1, totalAssertions / postconditionCount)
        : probeFiles.length > 0
          ? 0
          : 0;

    return {
      ucId,
      title: uc.title,
      postconditionCount,
      assertionCount: totalAssertions,
      coverageRatio,
      probeFiles,
      hollow,
    };
  });
}

/**
 * Format a postcondition coverage table for display.
 */
export function formatCoverageTable(
  coverage: ReadonlyArray<UcPostconditionCoverage>,
): string {
  if (coverage.length === 0) return "_No use cases found._\n";

  const lines = [
    "| UC | Title | Postconditions | Assertions | Coverage | Status |",
    "|---|---|---|---|---|---|",
  ];

  for (const uc of coverage) {
    const pct =
      uc.postconditionCount > 0
        ? `${Math.round(uc.coverageRatio * 100)}%`
        : "—";
    const status = uc.hollow
      ? "⚠️ HOLLOW"
      : uc.probeFiles.length === 0
        ? "❌ NO PROBE"
        : uc.assertionCount === 0
          ? "⏳ STUB"
          : uc.coverageRatio >= 0.8
            ? "✅ COVERED"
            : uc.coverageRatio >= 0.4
              ? "⚠️ PARTIAL"
              : "❌ LOW";
    lines.push(
      `| ${uc.ucId} | ${uc.title} | ${uc.postconditionCount} | ${uc.assertionCount} | ${pct} | ${status} |`,
    );
  }

  return lines.join("\n");
}
