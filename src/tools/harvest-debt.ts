/**
 * harvest_debt tool handler.
 *
 * Scans the project for inline debt markers and harvests them into an
 * auditable ledger. The marker convention is the one emitted by the
 * `minimization` skill:
 *
 *   TODO(<scope>): <description> — upgrade: <upgrade path>
 *
 * `<scope>` defaults to "min" when omitted by the regex (the token group is
 * always present, so scope is whatever the producer wrote). The tail after
 * ` — upgrade:` (em-dash) is split off as an optional upgrade path.
 *
 * This is the *harvest* side of the convention — it concretizes the Auditable
 * GS property at the level of a deliberate code shortcut.
 *
 * Read-only by default: files are written ONLY when `apply: true` (mirrors
 * review_stubs / refresh). The scanner itself is pure.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { listAllFiles } from "../analyzers/folder-structure.js";
import type { ToolResult } from "../shared/types.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface DebtMarker {
  /** Project-relative file path, forward-slash normalized for stable diffs. */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** Marker scope token (e.g. "min", "perf", "security"). Default "min". */
  readonly scope: string;
  /** Human description (the text between the colon and the upgrade tail). */
  readonly description: string;
  /** Optional upgrade path (the tail after ` — upgrade:`). */
  readonly upgradePath?: string;
}

export interface DebtLedger {
  /** Wall-clock generation time. Lives ONLY in the machine JSON, never the markdown. */
  readonly generatedAt: string;
  readonly total: number;
  /** Marker count grouped by scope. */
  readonly byScope: Record<string, number>;
  readonly markers: DebtMarker[];
}

export interface HarvestDebtInput {
  readonly project_dir: string;
  /** Write the ledger artifacts. Default false (read-only). */
  readonly apply?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────

/** Machine-readable ledger (regenerated state, not committed). */
const LEDGER_JSON_REL = ".forgecraft/debt.json";
/** Human-readable ledger (committed). */
const LEDGER_MD_REL = "docs/debt-ledger.md";

const DEFAULT_SCOPE = "min";

/**
 * Matches a debt marker token anywhere in a line comment.
 * Group 1 = scope token, Group 2 = the tail (description + optional upgrade).
 */
const MARKER_RE = /TODO\((\w[\w-]*)\):\s*(.*)/;

/** Em-dash separator splitting description from the upgrade path. */
const UPGRADE_SEP = " — upgrade:";

// ── Scanner (pure) ─────────────────────────────────────────────────────

/**
 * Parse a single line into a DebtMarker, or null if it carries no marker.
 *
 * @param file - Project-relative, forward-slash file path
 * @param lineNo - 1-based line number
 * @param text - The raw line text
 */
function parseLine(
  file: string,
  lineNo: number,
  text: string,
): DebtMarker | null {
  const match = MARKER_RE.exec(text);
  if (!match) return null;
  const scope = match[1] ?? DEFAULT_SCOPE;
  const tail = (match[2] ?? "").trim();

  const sepIdx = tail.indexOf(UPGRADE_SEP);
  if (sepIdx === -1) {
    return { file, line: lineNo, scope, description: tail };
  }
  const description = tail.slice(0, sepIdx).trim();
  const upgradePath = tail.slice(sepIdx + UPGRADE_SEP.length).trim();
  return upgradePath
    ? { file, line: lineNo, scope, description, upgradePath }
    : { file, line: lineNo, scope, description };
}

/**
 * Scan a project directory for inline debt markers. PURE — reads files, never
 * writes. Reuses the folder-structure walker (and its static skip-list; no
 * .gitignore parsing). Skips the machine ledger file itself so a committed
 * marker inside it can't double-count. Markers are sorted by file then line
 * for stable diffs.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Markers in stable (file, line) order
 */
export function scanDebtMarkers(projectDir: string): DebtMarker[] {
  const markers: DebtMarker[] = [];
  const files = listAllFiles(projectDir);

  for (const relPath of files) {
    // listAllFiles returns OS-native separators; normalize for portability.
    const normalized = relPath.split(/[\\/]/).join("/");
    // The walker already skips .forgecraft (dotdir), but be explicit and
    // defensive in case the skip-list ever changes.
    if (normalized === LEDGER_JSON_REL || normalized === LEDGER_MD_REL) {
      continue;
    }

    let content = "";
    try {
      content = readFileSync(join(projectDir, relPath), "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const marker = parseLine(normalized, i + 1, lines[i] ?? "");
      if (marker) markers.push(marker);
    }
  }

  markers.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
  return markers;
}

// ── Ledger builder (pure) ──────────────────────────────────────────────

/**
 * Aggregate markers into a ledger. The `generatedAt` timestamp lives only on
 * the machine JSON artifact (the markdown body has no volatile timestamp so
 * diffs stay stable).
 *
 * @param markers - Markers from scanDebtMarkers (already sorted)
 * @returns The aggregated ledger
 */
export function buildDebtLedger(markers: DebtMarker[]): DebtLedger {
  const byScope: Record<string, number> = {};
  for (const m of markers) {
    byScope[m.scope] = (byScope[m.scope] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    total: markers.length,
    byScope,
    markers,
  };
}

// ── Markdown formatter (pure, no volatile timestamp) ───────────────────

/**
 * Render the human-readable ledger markdown. Deliberately contains NO
 * wall-clock timestamp so committed diffs are stable — the generation time
 * lives in .forgecraft/debt.json only.
 *
 * @param ledger - The aggregated ledger
 * @returns Markdown body
 */
export function renderDebtLedgerMarkdown(ledger: DebtLedger): string {
  const lines: string[] = ["# Debt Ledger", ""];

  if (ledger.total === 0) {
    lines.push(
      "No inline debt markers found. The project carries no harvested `TODO(<scope>)` shortcuts.",
      "",
    );
    return lines.join("\n");
  }

  const scopes = Object.keys(ledger.byScope).sort();
  const summary = scopes.map((s) => `${s}: ${ledger.byScope[s]}`).join(", ");
  lines.push(`**${ledger.total}** marker(s) — ${summary}`, "");

  for (const scope of scopes) {
    const inScope = ledger.markers.filter((m) => m.scope === scope);
    lines.push(`## ${scope} (${inScope.length})`, "");
    for (const m of inScope) {
      const upgrade = m.upgradePath ? ` (→ upgrade: ${m.upgradePath})` : "";
      lines.push(`- \`${m.file}:${m.line}\` — ${m.description}${upgrade}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Writer (apply only) ────────────────────────────────────────────────

/**
 * Write the ledger artifacts to disk. Called only when apply:true.
 *
 * @param projectDir - Absolute path to project root
 * @param ledger - The aggregated ledger
 * @returns The project-relative paths written
 */
function writeLedger(projectDir: string, ledger: DebtLedger): string[] {
  const jsonPath = join(projectDir, ".forgecraft", "debt.json");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(ledger, null, 2) + "\n", "utf-8");

  const mdPath = join(projectDir, "docs", "debt-ledger.md");
  mkdirSync(dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, renderDebtLedgerMarkdown(ledger), "utf-8");

  return [LEDGER_JSON_REL, LEDGER_MD_REL];
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * MCP handler for the harvest_debt action. Read-only by default; writes the
 * ledger artifacts only when apply:true.
 *
 * @param args - project_dir (required) + optional apply flag
 * @returns MCP-style tool result with the rendered ledger
 */
export async function harvestDebtHandler(
  args: HarvestDebtInput,
): Promise<ToolResult> {
  const projectDir = args.project_dir;
  const apply = args.apply ?? false;

  const markers = scanDebtMarkers(projectDir);
  const ledger = buildDebtLedger(markers);

  const lines: string[] = [renderDebtLedgerMarkdown(ledger).trimEnd(), ""];

  if (apply) {
    const written = writeLedger(projectDir, ledger);
    lines.push(
      "---",
      "",
      `Wrote ${written.map((p) => `\`${p}\``).join(" + ")}.`,
      "`docs/debt-ledger.md` is committed (human ledger); `.forgecraft/debt.json` is regenerated state.",
    );
  } else {
    lines.push(
      "---",
      "",
      "Read-only preview. Re-run with `apply: true` (CLI: `--write`) to write `docs/debt-ledger.md` + `.forgecraft/debt.json`.",
    );
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
