/**
 * EDR — spec-change records with cascade re-verify (ADR-0012 §6d).
 *
 * An ADR records an architectural *decision*; an EDR (Evolving-spec / spec-change
 * record) records that the **spec itself changed** and which use-cases that change
 * touches. The point is the cascade: when the spec moves, the affected UCs' green
 * flags become *stale* — a UC that passed run_harness yesterday proves nothing
 * about a spec edited today. FC-1 (the generative-execution gate) blocks red and
 * unrun UCs but trusts a green; this gate adds the missing axis — a green that
 * predates a spec change affecting that UC is not trustworthy and must be re-run.
 *
 * This composes directly with FC-1: it is how a spec edit proves it did not
 * silently break a downstream UC. Opt-in: with no EDRs the gate is skipped.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadVerificationState } from "./verification-state-core.js";

/** Directory holding EDR markdown files. */
export const EDR_DIR = "docs/edrs";

/** One parsed spec-change record. */
export interface SpecChangeRecord {
  /** Source filename (for messages). */
  readonly file: string;
  /** EDR id token if present (e.g. "EDR-003"), else the filename. */
  readonly id: string;
  /** Recorded date, "YYYY-MM-DD" (or "" if absent → treated as always-stale). */
  readonly date: string;
  /** Affected use-case ids, upper-cased (e.g. ["UC-001", "UC-003"]). */
  readonly affectedUcs: readonly string[];
}

/** A use-case whose verification is stale relative to a spec change. */
export interface StaleUc {
  readonly uc: string;
  readonly edr: string;
  readonly reason: string;
}

/** Result of the spec-change cascade evaluation. */
export interface SpecChangeCascadeEvaluation {
  /** True when no EDRs exist (opt-in) — gate skipped. */
  readonly skipped: boolean;
  /** Parsed EDRs. */
  readonly records: readonly SpecChangeRecord[];
  /** Affected UCs needing re-verification (green is stale, or never run). */
  readonly staleUcs: readonly StaleUc[];
  /** True when at least one affected UC is stale. */
  readonly blocked: boolean;
}

/**
 * Parse a single EDR markdown body. Recognizes a `Date:` line (YYYY-MM-DD) and
 * an `Affected UCs:` line listing UC ids (comma/space separated). Both may
 * appear anywhere; the id is taken from the first `EDR-NNN` token if present.
 *
 * @param file - Source filename (kept for reporting)
 * @param content - The EDR markdown
 * @returns The parsed record
 */
export function parseEdr(file: string, content: string): SpecChangeRecord {
  const idTok = /EDR-\d+/.exec(content)?.[0];
  const dateTok = /^\s*Date:\s*(\d{4}-\d{2}-\d{2})/im.exec(content)?.[1] ?? "";
  const ucsLine = /^\s*Affected UCs?:\s*(.+)$/im.exec(content)?.[1] ?? "";
  const affectedUcs = [...ucsLine.matchAll(/UC-\d+/gi)].map((m) =>
    m[0]!.toUpperCase(),
  );
  return {
    file,
    id: idTok ?? file,
    date: dateTok,
    affectedUcs,
  };
}

/**
 * Discover and parse all EDRs under docs/edrs/ (excluding README).
 *
 * @param projectRoot - Absolute project root
 * @returns Parsed records (only those declaring at least one affected UC)
 */
export function findSpecChangeRecords(projectRoot: string): SpecChangeRecord[] {
  const dir = join(projectRoot, EDR_DIR);
  if (!existsSync(dir)) return [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
    );
  } catch {
    return [];
  }
  const records: SpecChangeRecord[] = [];
  for (const f of files) {
    try {
      const content = readFileSync(join(dir, f), "utf-8");
      const record = parseEdr(f, content);
      if (record.affectedUcs.length > 0) records.push(record);
    } catch {
      // Unreadable EDR — skip
    }
  }
  return records;
}

/**
 * Evaluate the spec-change cascade: for every EDR's affected UC, the UC's
 * generative-execution evidence must be at least as recent as the spec change.
 * Pure: read-only, no writes/console/exit — reusable as an oracle and testable.
 *
 * A UC is **stale** when it has no generative-execution record, or its
 * `lastRunAt` is strictly before the EDR's date (day-granular). Such a UC must
 * be re-run (run_harness) so its green reflects the changed spec. FC-1 already
 * blocks red/unrun UCs; this gate adds the staleness axis for green UCs.
 *
 * @param projectRoot - Absolute project root (read-only)
 * @returns The evaluation (skipped / records / staleUcs / blocked)
 */
export function evaluateSpecChangeCascade(
  projectRoot: string,
): SpecChangeCascadeEvaluation {
  const records = findSpecChangeRecords(projectRoot);
  if (records.length === 0) {
    return { skipped: true, records: [], staleUcs: [], blocked: false };
  }

  const state = loadVerificationState(projectRoot);
  const runAtByUc = new Map<string, string>();
  for (const f of state?.generativeExecution ?? []) {
    runAtByUc.set(f.ucId.toUpperCase(), f.lastRunAt);
  }

  const staleUcs: StaleUc[] = [];
  for (const edr of records) {
    // An EDR with no date is always treated as newer than any prior run.
    const edrTime = edr.date ? Date.parse(edr.date) : Number.POSITIVE_INFINITY;
    for (const uc of edr.affectedUcs) {
      const lastRunAt = runAtByUc.get(uc);
      if (!lastRunAt) {
        staleUcs.push({
          uc,
          edr: edr.id,
          reason:
            "no generative-execution evidence — run_harness after the spec change",
        });
        continue;
      }
      const runTime = Date.parse(lastRunAt);
      if (Number.isNaN(runTime) || runTime < edrTime) {
        staleUcs.push({
          uc,
          edr: edr.id,
          reason: `last run (${lastRunAt}) predates spec change ${edr.id} (${edr.date || "undated"}) — re-run run_harness`,
        });
      }
    }
  }

  return {
    skipped: false,
    records,
    staleUcs,
    blocked: staleUcs.length > 0,
  };
}

/**
 * Build the docs/edrs/README.md format guide. EDRs are authored by hand (or by a
 * future generate_edr tool) following this shape; close_cycle reads the
 * `Affected UCs:` line to drive cascade re-verification.
 *
 * @returns README content
 */
export function buildEdrsReadme(): string {
  return [
    `# Spec-Change Records (EDR)`,
    ``,
    `> An **ADR** records an architectural *decision*. An **EDR** records that the`,
    `> *spec itself changed* and which use-cases the change touches. When the spec`,
    `> moves, the affected UCs' green flags go **stale** — a UC that passed`,
    `> \`run_harness\` before the edit proves nothing about the edited spec.`,
    `>`,
    `> \`close_cycle\` reads each EDR's \`Affected UCs:\` line and **blocks** until those`,
    `> UCs have generative-execution evidence at least as recent as the EDR — i.e.`,
    `> you re-ran \`run_harness\` after changing the spec. This is how a spec edit`,
    `> proves it did not silently break a downstream UC (composes with FC-1).`,
    ``,
    `## Format`,
    ``,
    `One file per change: \`docs/edrs/EDR-NNN-short-title.md\`:`,
    ``,
    `\`\`\`markdown`,
    `# EDR-001: <what changed in the spec>`,
    `Date: YYYY-MM-DD`,
    `Affected UCs: UC-001, UC-003`,
    ``,
    `## Change`,
    `<the spec delta — what the contract now says that it did not before>`,
    ``,
    `## Rationale`,
    `<why the spec changed>`,
    `\`\`\``,
    ``,
    `After writing an EDR, re-run \`run_harness\` for the affected UCs, then`,
    `\`close_cycle\` — the cascade gate confirms each affected UC was re-verified`,
    `against the new spec.`,
    ``,
  ].join("\n");
}
