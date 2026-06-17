/**
 * Two-stream discovery log + fixture-on-close gate (ADR-0012 §6c).
 *
 * VairixDX kept two distinct streams of discovered work, and the distinction
 * matters because they enter the cycle at different points:
 *
 *   - **Deviations (D-XXX)** — spec deviations / debt registered *before* coding
 *     ("the spec says X, I'm doing Y because Z"). Known at design time.
 *   - **Deltas (DELTA-NNN)** — runtime discoveries registered *after* generative
 *     execution (a bug or behavior the spec did not predict).
 *
 * The load-bearing rule (VairixDX DELTA-079/051/007: a sanitizer bug that
 * recurred three times because the breaking input never became a fixture): a
 * DELTA cannot be *closed* until a regression fixture — the exact triggering
 * input — is captured and referenced. This module parses the log and evaluates
 * that rule; close_cycle blocks on a DELTA marked closed without a live fixture.
 *
 * This extends the debt/PT-4 path: harvest-debt collects inline TODO(<scope>)
 * markers; the discovery log is the auditable two-stream ledger of deviations
 * and runtime deltas, and the fixture-on-close gate is its acceptance rule.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The canonical discovery-log path (human-edited, committed). */
export const DISCOVERY_LOG_PATH = "docs/discovery-log.md";

/** One parsed discovery-log entry. */
export interface DiscoveryEntry {
  /** Full id token, e.g. "D-001" or "DELTA-014". */
  readonly id: string;
  /** Which stream: "deviation" (D-XXX) or "delta" (DELTA-NNN). */
  readonly stream: "deviation" | "delta";
  /** ISO date string as written, or "" if absent. */
  readonly date: string;
  /** "open" | "closed" (anything else normalizes to "open"). */
  readonly status: "open" | "closed";
  /** Free-text description. */
  readonly description: string;
  /** Captured regression fixture path (relative), or undefined. */
  readonly fixture?: string;
}

/** Result of the fixture-on-close evaluation. */
export interface DiscoveryLogEvaluation {
  /** True when the log is absent (feature is opt-in) — gate is skipped. */
  readonly skipped: boolean;
  /** All parsed entries. */
  readonly entries: readonly DiscoveryEntry[];
  /** Deltas marked closed without a live captured fixture (the blockers). */
  readonly closedWithoutFixture: ReadonlyArray<{
    readonly id: string;
    readonly reason: string;
  }>;
  /** True when at least one closed DELTA lacks a live fixture. */
  readonly blocked: boolean;
}

/**
 * Parse a discovery-log markdown body into entries.
 *
 * Real entries are pipe-delimited lines whose first field is a `D-NNN` or
 * `DELTA-NNN` id token; commented-out example lines (inside `<!-- -->`) and
 * prose are ignored. Field order:
 *
 *   <id> | <date> | <status> | <description> [| Fixture: <path>]
 *
 * The `Fixture:` field may appear in any position after the id; it is matched by
 * prefix so authors can place it last.
 *
 * @param content - The discovery-log markdown
 * @returns Parsed entries in file order
 */
export function parseDiscoveryLog(content: string): DiscoveryEntry[] {
  const entries: DiscoveryEntry[] = [];
  let inComment = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    // Track multi-line HTML comment blocks — example entries live inside them
    // and must never be parsed as real entries.
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.startsWith("<!--")) {
      // A single-line comment closes on the same line; otherwise we're inside.
      if (!line.includes("-->")) inComment = true;
      continue;
    }
    // Skip headings and anything not starting with an id token.
    if (line.startsWith("#")) continue;
    const idMatch = /^(D|DELTA)-(\d+)\b/.exec(line);
    if (!idMatch) continue;

    const parts = line
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) continue;

    const id = parts[0]!.match(/^(D|DELTA)-\d+/)?.[0] ?? parts[0]!;
    const stream = id.startsWith("DELTA-") ? "delta" : "deviation";

    let fixture: string | undefined;
    const rest: string[] = [];
    for (const part of parts.slice(1)) {
      const fx = /^Fixture:\s*(.+)$/i.exec(part);
      if (fx) {
        fixture = fx[1]!.trim();
      } else {
        rest.push(part);
      }
    }

    const date = rest[0] ?? "";
    const statusRaw = (rest[1] ?? "open").toLowerCase();
    const status = statusRaw === "closed" ? "closed" : "open";
    const description = rest.slice(2).join(" | ");

    entries.push({
      id,
      stream,
      date,
      status,
      description,
      ...(fixture ? { fixture } : {}),
    });
  }
  return entries;
}

/**
 * Evaluate the fixture-on-close rule for a project. Pure: read-only, no writes,
 * no console, no process.exit — reusable as an oracle and trivially testable.
 *
 * Rule: every **DELTA** with status `closed` MUST carry a `Fixture:` path that
 * resolves to an existing file. A closed DELTA without a live fixture is a
 * blocker. Deviations (D-XXX) are not fixture-gated — they are design-time debt.
 *
 * Opt-in: when `docs/discovery-log.md` is absent the gate is skipped.
 *
 * @param projectRoot - Absolute project root
 * @returns The evaluation (skipped / entries / blockers / blocked)
 */
export function evaluateDiscoveryLog(
  projectRoot: string,
): DiscoveryLogEvaluation {
  const logPath = join(projectRoot, DISCOVERY_LOG_PATH);
  if (!existsSync(logPath)) {
    return {
      skipped: true,
      entries: [],
      closedWithoutFixture: [],
      blocked: false,
    };
  }

  let content = "";
  try {
    content = readFileSync(logPath, "utf-8");
  } catch {
    return {
      skipped: true,
      entries: [],
      closedWithoutFixture: [],
      blocked: false,
    };
  }

  const entries = parseDiscoveryLog(content);
  const closedWithoutFixture: Array<{ id: string; reason: string }> = [];

  for (const e of entries) {
    if (e.stream !== "delta" || e.status !== "closed") continue;
    if (!e.fixture) {
      closedWithoutFixture.push({
        id: e.id,
        reason:
          "closed with no Fixture: reference (capture the triggering input)",
      });
      continue;
    }
    if (!existsSync(join(projectRoot, e.fixture))) {
      closedWithoutFixture.push({
        id: e.id,
        reason: `Fixture path does not exist: ${e.fixture}`,
      });
    }
  }

  return {
    skipped: false,
    entries,
    closedWithoutFixture,
    blocked: closedWithoutFixture.length > 0,
  };
}

/**
 * Build the docs/discovery-log.md template — the two-stream ledger.
 *
 * Deliberately carries no FILL/UNFILLED/TODO markers (so check_cascade does not
 * treat it as an unfinished spec stub); the examples live in HTML comments.
 *
 * @returns The discovery-log template content
 */
export function buildDiscoveryLog(): string {
  return [
    `# Discovery Log`,
    ``,
    `> **Two streams, two entry points into the cycle.**`,
    `>`,
    `> - **Deviations (D-XXX)** — spec deviations / debt registered *before* coding:`,
    `>   "the spec says X, I'm doing Y because Z." Known at design time.`,
    `> - **Deltas (DELTA-NNN)** — runtime discoveries registered *after* generative`,
    `>   execution: a bug or behavior the spec did not predict.`,
    `>`,
    `> **A DELTA cannot be marked \`closed\` until a regression fixture — the exact`,
    `> triggering input — is captured and referenced.** \`close_cycle\` blocks a`,
    `> closed DELTA whose \`Fixture:\` path is missing or does not exist. (Why: a`,
    `> lesson that lives only in a changelog returns under a cousin input; a lesson`,
    `> that lives in a fixture cannot.)`,
    ``,
    `Entry format (one per line, pipe-delimited):`,
    ``,
    `\`\`\``,
    `<id> | <YYYY-MM-DD> | <open|closed> | <description> | Fixture: <path>`,
    `\`\`\``,
    ``,
    `## Deviations (D-XXX) — registered before coding`,
    ``,
    `<!-- Example (delete when you add real entries):`,
    `D-001 | 2026-01-15 | open | Spec mandates axios; using native fetch — Node 18+ ships it`,
    `-->`,
    ``,
    `## Deltas (DELTA-NNN) — runtime discoveries, after generative execution`,
    ``,
    `<!-- Example (delete when you add real entries):`,
    `DELTA-001 | 2026-01-20 | closed | enum cast 500 on "moderate" | Fixture: tests/fixtures/delta-001-moderate.json`,
    `-->`,
    ``,
  ].join("\n");
}
