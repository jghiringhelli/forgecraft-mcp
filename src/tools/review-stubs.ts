/**
 * review_stubs tool handler.
 *
 * Scans docs/adrs/active/, docs/decisions/, and .claude/standards/ for files
 * containing unresolved [NEEDS CLARIFICATION] markers. Triages them by priority
 * so practitioners know what to fill in first.
 *
 * Priority:
 *   high   — ADRs (Retroactive status, most recently dated)
 *   medium — Decision records with unresolved markers
 *   low    — CNT leaf nodes with placeholder content
 *
 * Idempotent — read-only, no files written.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "../shared/types.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface StubFile {
  readonly relPath: string;
  readonly type: "adr" | "decision" | "cnt-leaf";
  readonly status: string | null;
  readonly date: string | null;
  readonly markerCount: number;
  readonly priority: "high" | "medium" | "low";
  readonly firstLine: string;
}

export interface ReviewStubsInput {
  readonly project_dir: string;
}

const MARKER = "[NEEDS CLARIFICATION]";
const SCAFFOLD_SENTINEL = "<!-- ForgeCraft sentinel:";

// ── Scanners ──────────────────────────────────────────────────────────

function extractStatusLine(content: string): string | null {
  const match = /\*\*Status:\*\*\s*(.+)/i.exec(content);
  return match ? (match[1]?.trim() ?? null) : null;
}

function extractDateLine(content: string): string | null {
  const match = /\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/i.exec(content);
  return match ? (match[1] ?? null) : null;
}

function countMarkers(content: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(MARKER, pos)) !== -1) {
    count++;
    pos += MARKER.length;
  }
  return count;
}

function firstHeadingLine(content: string): string {
  const line = content.split("\n").find((l) => l.startsWith("#"));
  return line ? line.replace(/^#+\s*/, "").trim() : "(no title)";
}

function scanDir(
  projectDir: string,
  relDir: string,
  type: "adr" | "decision" | "cnt-leaf",
): StubFile[] {
  const absDir = join(projectDir, ...relDir.split("/"));
  if (!existsSync(absDir)) return [];

  const stubs: StubFile[] = [];
  try {
    for (const filename of readdirSync(absDir)) {
      if (!filename.endsWith(".md")) continue;
      const fullPath = join(absDir, filename);
      let content = "";
      try {
        content = readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      // Skip scaffold-generated files — they're intentionally long
      if (type === "cnt-leaf" && content.startsWith(SCAFFOLD_SENTINEL))
        continue;

      const markerCount = countMarkers(content);
      const status = extractStatusLine(content);
      const date = extractDateLine(content);
      const firstLine = firstHeadingLine(content);

      // Only include files that have markers OR retroactive ADRs without them
      const isRetroactive =
        type === "adr" &&
        (status?.toLowerCase().includes("retroactive") ?? false);
      if (markerCount === 0 && !isRetroactive) continue;

      const priority = derivePriority(type, status, date);
      stubs.push({
        relPath: `${relDir}/${filename}`,
        type,
        status,
        date,
        markerCount,
        priority,
        firstLine,
      });
    }
  } catch {
    // non-throwing
  }
  return stubs;
}

function derivePriority(
  type: "adr" | "decision" | "cnt-leaf",
  status: string | null,
  date: string | null,
): "high" | "medium" | "low" {
  if (type === "adr") {
    // Recent retroactive ADRs are high priority
    if (date) {
      const age = Date.now() - new Date(date).getTime();
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;
      return age < ninetyDays ? "high" : "medium";
    }
    return status?.toLowerCase().includes("retroactive") ? "medium" : "high";
  }
  if (type === "decision") return "medium";
  return "low";
}

// ── Formatter ─────────────────────────────────────────────────────────

function renderGroup(label: string, stubs: StubFile[], lines: string[]): void {
  if (stubs.length === 0) return;
  lines.push(`### ${label}`, "");
  for (const s of stubs) {
    const markerNote =
      s.markerCount > 0 ? `${s.markerCount} marker(s)` : "no markers";
    const statusNote = s.status ? ` [${s.status}]` : "";
    lines.push(`- \`${s.relPath}\`${statusNote} — ${markerNote}`);
    lines.push(`  > ${s.firstLine}`);
    if (s.type === "adr") {
      if (s.markerCount > 0) {
        lines.push(
          "  > Fill Context / Decision / Alternatives / Consequences, then change Status to `Accepted`.",
        );
      } else {
        lines.push(
          "  > Retroactive ADR with no markers — verify the decision is still in force and set Status to `Accepted` or `Superseded`.",
        );
      }
    } else if (s.type === "decision") {
      lines.push("  > Fill Trigger / Root Cause / Fix / Regression Test.");
    } else {
      lines.push(
        "  > Expand this leaf node or remove the placeholder if the domain is not yet relevant.",
      );
    }
  }
  lines.push("");
}

// ── Handler ───────────────────────────────────────────────────────────

export async function reviewStubsHandler(
  args: ReviewStubsInput,
): Promise<ToolResult> {
  const projectDir = args.project_dir;

  const adrStubs = scanDir(projectDir, "docs/adrs/active", "adr");
  const legacyAdrStubs = existsSync(join(projectDir, "docs", "adrs", "active"))
    ? []
    : scanDir(projectDir, "docs/adrs", "adr");
  const allAdrStubs = [...adrStubs, ...legacyAdrStubs];

  const decisionStubs = scanDir(projectDir, "docs/decisions", "decision");
  const cntStubs = scanDir(projectDir, "docs/decisions", "cnt-leaf").concat(
    scanDir(projectDir, ".claude/standards", "cnt-leaf"),
  );

  const allStubs = [...allAdrStubs, ...decisionStubs, ...cntStubs];

  if (allStubs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: [
            "## Stub Triage",
            "",
            "No unresolved stubs found. All ADRs, decisions, and CNT leaves are either filled in or absent.",
            "",
            "If you recently ran `extract_adrs_from_history`, stubs may have been placed in `docs/adrs/` — check there if this seems wrong.",
          ].join("\n"),
        },
      ],
    };
  }

  const high = allStubs.filter((s) => s.priority === "high");
  const medium = allStubs.filter((s) => s.priority === "medium");
  const low = allStubs.filter((s) => s.priority === "low");

  const totalMarkers = allStubs.reduce((sum, s) => sum + s.markerCount, 0);

  const lines: string[] = [
    "## Stub Triage",
    "",
    `Found **${allStubs.length}** stub file(s) with **${totalMarkers}** unresolved marker(s).`,
    "",
    "Work through these in order. Each resolved stub improves your **Auditable** GS property score.",
    "",
  ];

  renderGroup("High Priority — fill these first", high, lines);
  renderGroup("Medium Priority", medium, lines);
  renderGroup("Low Priority (CNT leaf nodes)", low, lines);

  lines.push(
    "### How to prioritize",
    "",
    "1. **Still in force** — fill Context/Decision/Alternatives, change Status → `Accepted`",
    "2. **Since superseded** — record briefly, mark `Superseded by ADR-XXXX`",
    "3. **Not a real decision** — delete the stub",
    "",
    "Once all stubs are resolved, re-run `audit` — the Auditable property score will improve.",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
