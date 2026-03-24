/**
 * setup-cnt-builders: Content builders for CNT (Context Navigation Tree) markdown files.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SpecSummary } from "./spec-parser.js";
import { getActiveProjectGates, readProjectGates } from "../shared/project-gates.js";

// ── Claude index content ──────────────────────────────────────────────

/**
 * Build `.claude/index.md` content — routing root with navigation protocol.
 *
 * @param projectName - Project name for the index title
 * @param tags - Effective tags used to build domain rows
 * @returns Formatted index.md content
 */
export function buildClaudeIndexContent(
  projectName: string,
  tags: readonly string[],
): string {
  const domainRows = buildDomainRows(tags);
  return [
    `# ${projectName} Context Index`, ``,
    `## Always Load`, `@.claude/core.md`, ``,
    `## Navigate by Task`,
    `Identify the task domain before generating any code.`,
    `Load ONLY the node that matches. Do not load siblings.`, ``,
    `| Task Domain | Node | When to Use |`, `|---|---|---|`,
    `| Architecture decisions | @.claude/adr/index.md | Before proposing any structural change |`,
    `| Quality gates | @.claude/gates/index.md | When running or interpreting gate results |`,
    ...domainRows, ``, `---`, ``,
    buildNavigationProtocol(),
  ].join("\n");
}

function buildDomainRows(tags: readonly string[]): string[] {
  const rows: string[] = [
    `| Architecture | @.claude/standards/architecture.md | Layer rules, SOLID, patterns |`,
  ];
  if (tags.some((t) => ["API", "WEB-REACT"].includes(t)))
    rows.push(`| API / routes | @.claude/standards/api.md | Route handlers, middleware, validation |`);
  if (tags.some((t) => ["DATA-PIPELINE", "ML"].includes(t)))
    rows.push(`| Data pipeline | @.claude/standards/data.md | Pipeline, transforms, quality |`);
  if (tags.some((t) => ["FINTECH", "WEB3"].includes(t)))
    rows.push(`| Financial logic | @.claude/standards/security.md | Transactions, compliance, safety |`);
  rows.push(`| Protocols | @.claude/standards/protocols.md | Commit convention, branching |`);
  return rows;
}

function buildNavigationProtocol(): string {
  return [
    `## Navigation Protocol — read before any task`, ``,
    `1. Read this file (index.md). Identify the task domain from the table above.`,
    `2. Read .claude/core.md. Always. It is always relevant.`,
    `3. Read the domain index for the matching task domain. One domain only.`,
    `4. If the task touches an architecture decision, read .claude/adr/index.md and the relevant ADR.`,
    `5. If the task touches quality gates, read .claude/gates/index.md.`,
    `6. Do not read nodes outside the identified domain unless the task explicitly spans domains.`,
    `   If it spans domains, name them before reading both — do not load the full tree silently.`,
    `7. If no node matches the task, read core.md only and flag the missing coverage.`,
  ].join("\n");
}

// ── Core.md content ───────────────────────────────────────────────────

/**
 * Build `.claude/core.md` content — always-loaded project invariants (≤50 lines).
 *
 * @param projectName - Project name
 * @param spec - Parsed spec summary (optional)
 * @param tags - Effective project tags
 * @returns Formatted core.md content
 */
export function buildCoreMdContent(
  projectName: string,
  spec: SpecSummary | null,
  tags: readonly string[],
): string {
  const identity = spec?.problem
    ? spec.problem.slice(0, 200).replace(/\n/g, " ").trim()
    : `${projectName} — purpose not yet defined in spec.`;
  const entitiesLines = spec?.components && spec.components.length > 0
    ? spec.components.slice(0, 8).map((c) => `- ${c}`).join("\n")
    : `- <!-- FILL: list primary entities here -->`;
  const tagList = tags.map((t) => `[${t}]`).join(" ");
  return [
    `# ${projectName} — Core`, ``,
    `> Always loaded. Contains only what is true across all domains.`,
    `> Hard limit: 50 lines. If it grows, move the excess to a domain node.`, ``,
    `## Domain Identity`, identity, ``, `## Tags`, tagList, ``,
    `## Primary Entities`, entitiesLines, ``,
    `## Layer Map`,
    "```",
    `[API/CLI] → [Services] → [Domain] → [Repositories] → [Infrastructure]`,
    `Dependencies point inward. Domain has zero external imports.`,
    "```", ``,
    `## Invariants`,
    `- Every public function has a JSDoc with typed params and returns`,
    `- No circular imports (enforced by pre-commit hook)`,
    `- Test coverage ≥80% on all changed files`,
  ].join("\n");
}

// ── ADR index content ─────────────────────────────────────────────────

/**
 * Build `.claude/adr/index.md` content — ADR navigation index.
 *
 * @param projectDir - Project root
 * @returns Formatted adr/index.md content
 */
export function buildAdrIndexContent(projectDir: string): string {
  const rows = scanAdrFiles(projectDir);
  const tableBody = rows.length > 0 ? rows.join("\n") : `(No decisions recorded yet — add ADRs to docs/adrs/)`;
  return [
    `# Architecture Decisions`, ``,
    `Read the specific ADR before proposing any structural change to the relevant domain.`,
    `Do not re-open a decision without creating a new ADR that supersedes it.`, ``,
    `| ID | Decision | Status | Node |`, `|---|---|---|---|`,
    tableBody,
  ].join("\n");
}

function scanAdrFiles(projectDir: string): string[] {
  const rows: string[] = [];
  for (const dir of ["docs/adrs", "docs/adr"]) {
    const fullDir = join(projectDir, dir);
    if (!existsSync(fullDir)) continue;
    const files = readdirSync(fullDir).filter((f) => /^ADR-\d+/i.test(f) && f.endsWith(".md")).sort();
    for (const file of files) {
      const title = readFirstHeading(join(fullDir, file));
      const id = file.match(/^ADR-\d+/i)?.[0] ?? file.replace(".md", "");
      rows.push(`| ${id} | ${title} | Accepted | @${dir}/${file} |`);
    }
    break;
  }
  return rows;
}

function readFirstHeading(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8").split("\n")[0]?.replace(/^#+\s*/, "").trim() ?? filePath;
  } catch { return filePath; }
}

// ── Gates index content ───────────────────────────────────────────────

/**
 * Build `.claude/gates/index.md` content — active quality gates list.
 *
 * @param projectDir - Project root
 * @returns Formatted gates/index.md content
 */
export function buildGatesIndexContent(projectDir: string): string {
  const rows = buildGateRows(projectDir);
  const tableBody = rows.length > 0 ? rows.join("\n") : `(No project gates active — gates are added during close_cycle)`;
  return [
    `# Active Quality Gates`, ``,
    `Run \`close_cycle\` to evaluate all gates before committing.`, ``,
    `| Gate | Phase | When It Fires |`, `|---|---|---|`,
    tableBody,
  ].join("\n");
}

function buildGateRows(projectDir: string): string[] {
  const activeGates = getActiveProjectGates(projectDir);
  const flatGates = readProjectGates(projectDir);
  const activeIds = new Set(activeGates.map((g) => g.id));
  const allGates = [...activeGates, ...flatGates.filter((g) => !activeIds.has(g.id))];
  return allGates.map((g) => {
    const check = (g.check ?? "").slice(0, 60);
    const ellipsis = (g.check?.length ?? 0) > 60 ? "…" : "";
    return `| ${g.id} | ${g.phase ?? "—"} | ${check}${ellipsis} |`;
  });
}

// ── ADR-000 content ───────────────────────────────────────────────────

/**
 * Build ADR-000 content — CNT initialization decision record.
 *
 * @param tags - Effective project tags
 * @returns Formatted ADR-000 markdown content
 */
export function buildAdr000Content(tags: readonly string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `# ADR-000: Context Navigation Tree Initialization`, ``,
    `**Date**: ${today}`, `**Status**: Accepted`, `**Decided by**: ForgeCraft setup`, ``,
    `## Context`, ``,
    `This project was initialized with ForgeCraft. The Context Navigation Tree (CNT)`,
    `structure was selected to provide O(log N) context load in the average case.`, ``,
    `## Decision`, ``,
    `Use CNT: CLAUDE.md (3-line root) + .claude/index.md (routing) + .claude/core.md`,
    `(always-loaded invariants) + domain leaf nodes (≤30 lines each).`, ``,
    `## Consequences`, ``,
    `- CLAUDE.md stays ≤3 lines always`,
    `- New concerns get a leaf node via \`add_node\``,
    `- core.md must never exceed 50 lines; excess moves to domain nodes`,
    `- Stateless agents navigate by task domain, not by loading everything`, ``,
    `## Tags`, tags.join(", "),
  ].join("\n");
}
