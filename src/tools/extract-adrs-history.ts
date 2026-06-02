/**
 * extract_adrs_from_history tool handler.
 *
 * Scans git log for architectural decision candidates and emits
 * retroactive ADR stubs into docs/adrs/active/.
 *
 * Uses heuristics:
 *   - Commit message keywords: "switch to", "replace", "adopt", "migrate",
 *     "chose", "use X instead", "move from", "change from", "refactor to"
 *   - Large feat/refactor commits (≥ threshold files changed)
 *   - Merge commit PR titles that describe architectural choices
 *
 * Each stub has Status: Retroactive and the commit date/message pre-filled.
 * Practitioners resolve [NEEDS CLARIFICATION] sections after review.
 *
 * Idempotent: skips commits whose slug already exists in docs/adrs/active/.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { ToolResult } from "../shared/types.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface CommitCandidate {
  readonly hash: string;
  readonly date: string;
  readonly subject: string;
  readonly filesChanged: number;
  readonly reason: string;
}

export interface ExtractAdrsHistoryInput {
  readonly project_dir: string;
  /** Max candidates to return (default 10, to avoid flooding). */
  readonly max_candidates?: number;
  /** Min files changed to flag a large commit (default 5). */
  readonly large_commit_threshold?: number;
  /** Branch or ref to walk (default: HEAD). */
  readonly ref?: string;
}

// ── Architecture decision keywords ───────────────────────────────────

const ARCH_KEYWORDS = [
  "switch to",
  "switched to",
  "replace",
  "replaced",
  "adopt",
  "adopted",
  "migrate",
  "migrated",
  "migration",
  "chose",
  "choose",
  "move from",
  "moved from",
  "change from",
  "changed from",
  "refactor to",
  "extract",
  "introduce",
  "introduced",
  "use X instead",
  "restructure",
  "redesign",
  "drop",
  "remove and replace",
  "consolidate",
  "split into",
  "breaking change",
  "breaking:",
  "upgrade",
  "downgrade",
];

// ── Git helpers ───────────────────────────────────────────────────────

/**
 * Run git log and return candidates for architectural decisions.
 * Non-throwing — returns empty array when not a git repo or git unavailable.
 */
export function findArchDecisionCandidates(
  projectDir: string,
  maxCandidates: number,
  largeCommitThreshold: number,
  ref: string,
): CommitCandidate[] {
  if (!existsSync(join(projectDir, ".git"))) return [];

  let logOutput: string;
  try {
    // --no-merges skips merge commits (they're usually redundant with the PR title)
    // We do a second pass with --merges for PR title candidates
    logOutput = execSync(
      `git log --no-merges --format="%H|%as|%s|%ad" --date=short --shortstat ${ref}`,
      { cwd: projectDir, encoding: "utf-8", timeout: 15000 },
    );
  } catch {
    return [];
  }

  const candidates: CommitCandidate[] = [];
  const blocks = logOutput.trim().split(/\n(?=[0-9a-f]{40}\|)/);

  for (const block of blocks) {
    const lines = block.split("\n");
    const headerLine = lines[0];
    if (!headerLine) continue;

    const parts = headerLine.split("|");
    const hash = parts[0] ?? "";
    const date = parts[1] ?? "";
    const subject = parts[2] ?? "";

    if (!hash || !date || !subject) continue;

    const statsLine = lines.find((l) => l.includes("changed"));
    const filesChanged = statsLine
      ? parseInt(/(\d+) files? changed/.exec(statsLine)?.[1] ?? "0", 10)
      : 0;

    const lowerSubject = subject.toLowerCase();
    const matchedKeyword = ARCH_KEYWORDS.find((kw) =>
      lowerSubject.includes(kw.toLowerCase()),
    );

    let reason = "";
    if (matchedKeyword) {
      reason = `keyword: "${matchedKeyword}"`;
    } else if (filesChanged >= largeCommitThreshold) {
      reason = `large commit: ${filesChanged} files changed`;
    }

    if (!reason) continue;

    candidates.push({ hash, date, subject, filesChanged, reason });
    if (candidates.length >= maxCandidates) break;
  }

  return candidates;
}

// ── ADR directory helpers ─────────────────────────────────────────────

function resolveAdrDir(projectDir: string): string {
  const canonical = join(projectDir, "docs", "adrs", "active");
  const legacy = join(projectDir, "docs", "adrs");
  return existsSync(canonical) ? canonical : legacy;
}

function nextAdrNumber(adrDir: string): number {
  if (!existsSync(adrDir)) return 1;
  const existing = readdirSync(adrDir)
    .map((f) => /^(\d{4})-/.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map((n) => parseInt(n, 10));
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function subjectToSlug(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 55);
}

function slugExists(adrDir: string, slug: string): boolean {
  if (!existsSync(adrDir)) return false;
  return readdirSync(adrDir).some((f) => f.includes(slug));
}

// ── ADR content builder ───────────────────────────────────────────────

function renderRetroactiveAdr(
  number: number,
  subject: string,
  date: string,
  hash: string,
  reason: string,
): string {
  const id = `ADR-${String(number).padStart(4, "0")}`;
  const shortHash = hash.slice(0, 8);

  return [
    `# ${id}: ${subject}`,
    ``,
    `**Date:** ${date}`,
    `**Status:** Retroactive`,
    `**Commit:** \`${shortHash}\` — extracted by forgecraft from git history (${reason})`,
    ``,
    `## Status`,
    ``,
    `Retroactive — decision was made implicitly. Practitioner should:`,
    `1. Verify this is actually a recorded architectural decision (not just a refactor).`,
    `2. Fill in Context / Decision / Alternatives from memory, PR description, or Slack history.`,
    `3. Change status to \`Accepted\` once filled in.`,
    `4. Delete this file if the commit does not represent a real decision.`,
    ``,
    `## Context`,
    ``,
    `[NEEDS CLARIFICATION: what problem or constraint forced this change? What was the situation before?]`,
    ``,
    `**Original commit message:** ${subject}`,
    ``,
    `## Decision`,
    ``,
    `[NEEDS CLARIFICATION: what was decided and why was this option chosen over alternatives?]`,
    ``,
    `## Alternatives Considered`,
    ``,
    `- [NEEDS CLARIFICATION: what was the status quo before this change?]`,
    `- [NEEDS CLARIFICATION: what other options were evaluated?]`,
    ``,
    `## Consequences`,
    ``,
    `[NEEDS CLARIFICATION: what became easier, harder, or newly constrained as a result?]`,
    ``,
    `---`,
    ``,
    `_This ADR was generated retroactively by ForgeCraft from git history. Resolve all [NEEDS CLARIFICATION] sections before accepting._`,
  ].join("\n");
}

// ── Handler ───────────────────────────────────────────────────────────

/**
 * Scan git history for architectural decisions and emit retroactive ADR stubs.
 *
 * @param args - Input with project_dir and optional config
 * @returns MCP tool result with written/skipped counts and candidate list
 */
export async function extractAdrsFromHistoryHandler(
  args: ExtractAdrsHistoryInput,
): Promise<ToolResult> {
  const projectDir = args.project_dir;
  const maxCandidates = args.max_candidates ?? 10;
  const largeCommitThreshold = args.large_commit_threshold ?? 5;
  const ref = args.ref ?? "HEAD";

  if (!existsSync(join(projectDir, ".git"))) {
    return {
      content: [
        {
          type: "text",
          text: "Not a git repository — cannot extract ADR candidates from history.",
        },
      ],
    };
  }

  const candidates = findArchDecisionCandidates(
    projectDir,
    maxCandidates,
    largeCommitThreshold,
    ref,
  );

  if (candidates.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: [
            "## No ADR candidates found",
            "",
            "No commits matching architectural decision keywords were found in recent history.",
            "",
            "You can:",
            `- Lower the large_commit_threshold (current: ${largeCommitThreshold} files) to catch smaller refactors`,
            "- Run with a specific ref: `extract_adrs_from_history --ref main`",
            '- Write ADRs manually: `generate_adr --title "..." --context "..." --decision "..."`',
          ].join("\n"),
        },
      ],
    };
  }

  const adrDir = resolveAdrDir(projectDir);
  mkdirSync(adrDir, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];

  for (const candidate of candidates) {
    const slug = subjectToSlug(candidate.subject);

    if (slugExists(adrDir, slug)) {
      skipped.push(candidate.subject);
      continue;
    }

    const number = nextAdrNumber(adrDir);
    const filename = `${String(number).padStart(4, "0")}-${slug}.md`;
    const filePath = join(adrDir, filename);
    const content = renderRetroactiveAdr(
      number,
      candidate.subject,
      candidate.date,
      candidate.hash,
      candidate.reason,
    );

    writeFileSync(filePath, content, "utf-8");
    written.push(filename);
  }

  const relativeAdrDir = adrDir.replace(projectDir, "").replace(/^[\\/]/, "");

  const lines = [
    `## Retroactive ADR Extraction`,
    ``,
    `Scanned git history (${ref}). Found **${candidates.length}** candidate(s).`,
    ``,
    `**Written:** ${written.length}`,
    `**Skipped (already exist):** ${skipped.length}`,
    `**Directory:** \`${relativeAdrDir}\``,
    ``,
  ];

  if (written.length > 0) {
    lines.push(`### Written ADR stubs`, ``);
    for (const f of written) {
      lines.push(`- \`${relativeAdrDir}/${f}\``);
    }
    lines.push(``);
    lines.push(
      `> All stubs have **Status: Retroactive** and \`[NEEDS CLARIFICATION]\` markers.`,
      `> Review each file: fill in Context / Decision / Alternatives / Consequences from memory or PR history, then change status to \`Accepted\`.`,
      `> Delete any stub that doesn't represent a real architectural decision.`,
      ``,
    );
  }

  if (skipped.length > 0) {
    lines.push(`### Skipped (slug already in ADR dir)`, ``);
    for (const s of skipped) {
      lines.push(`- ${s}`);
    }
    lines.push(``);
  }

  lines.push(
    `### How to prioritize`,
    ``,
    `1. Decisions that are **still in force** — fill in and accept these first`,
    `2. Decisions that have since been **superseded** — record briefly, mark \`Superseded\``,
    `3. Commits that turned out **not** to be decisions — delete the stub`,
    ``,
    `Once all retroactive ADRs are processed, \`Auditable\` moves to 2/2.`,
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
