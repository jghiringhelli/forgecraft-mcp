/**
 * Sentinel tree renderer.
 *
 * Instead of one large instruction file, renders a 3-level lazy tree:
 *   Level 0: CLAUDE.md  (~50 lines) — project identity + critical rules + wayfinding
 *   Level 1: .claude/standards/{domain}.md — full block content per domain
 *
 * The AI loads only what the current task requires.
 * Typical task: CLAUDE.md (~50 lines) + 1-2 domain files (50-100 lines each).
 * vs monolithic: 800-2000+ lines loaded regardless of task.
 *
 * Only applies to the "claude" target — other AI assistants receive the full file
 * since they do not support multi-file on-demand loading the same way.
 */

import { renderTemplate } from "./renderer.js";
import type { InstructionBlock } from "../shared/types.js";
import type { RenderContext } from "./renderer.js";
import {
  BLOCK_DOMAIN_MAP,
  DOMAIN_DESCRIPTIONS,
  DOMAIN_ORDER,
} from "./sentinel-domain-map.js";

// ── Types ─────────────────────────────────────────────────────────────

/** A single file produced by the sentinel renderer. */
export interface SentinelFile {
  /** Relative path from project root (e.g., "CLAUDE.md" or ".claude/standards/testing.md"). */
  readonly relativePath: string;
  /** File content ready to write. */
  readonly content: string;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Render the full sentinel tree from composed instruction blocks.
 *
 * Returns an array of files to write:
 * - CLAUDE.md (sentinel, ~50 lines)
 * - .claude/standards/{domain}.md for each domain that has content
 *
 * @param blocks - All composed instruction blocks
 * @param context - Project render context
 * @returns Array of files to write, CLAUDE.md first
 */
export function renderSentinelTree(
  blocks: InstructionBlock[],
  context: RenderContext,
): SentinelFile[] {
  const byDomain = groupBlocksByDomain(blocks);
  const files: SentinelFile[] = [];

  // Generate domain standards files
  const domainsWithContent: Array<{ domain: string; description: string }> = [];

  for (const [domain, domainBlocks] of byDomain) {
    if (domainBlocks.length === 0) continue;

    const content = renderDomainFile(domain, domainBlocks, context);
    files.push({ relativePath: `.claude/standards/${domain}.md`, content });

    const description = DOMAIN_DESCRIPTIONS[domain] ?? domain;
    domainsWithContent.push({ domain, description });
  }

  // Sort domains for consistent wayfinding table order
  domainsWithContent.sort(
    (a, b) =>
      (DOMAIN_ORDER.indexOf(a.domain) ?? 99) -
      (DOMAIN_ORDER.indexOf(b.domain) ?? 99),
  );

  // Generate sentinel CLAUDE.md (prepend so it's first in the list)
  files.unshift({
    relativePath: "CLAUDE.md",
    content: renderSentinelClaudeMd(domainsWithContent, context),
  });

  return files;
}

// ── Private helpers ───────────────────────────────────────────────────

/**
 * Group instruction blocks by domain category using the BLOCK_DOMAIN_MAP.
 * Blocks with unrecognized IDs fall into "protocols" (catch-all).
 */
function groupBlocksByDomain(
  blocks: InstructionBlock[],
): Map<string, InstructionBlock[]> {
  const map = new Map<string, InstructionBlock[]>();

  for (const block of blocks) {
    const domain = BLOCK_DOMAIN_MAP[block.id] ?? "protocols";
    const existing = map.get(domain) ?? [];
    existing.push(block);
    map.set(domain, existing);
  }

  return map;
}

/**
 * Render a single domain standards file.
 * Contains full rendered block content for all blocks in that domain.
 *
 * @param domain - Domain name (used in header comment)
 * @param blocks - Blocks belonging to this domain
 * @param context - Render context for variable substitution
 * @returns File content ready to write
 */
function renderDomainFile(
  domain: string,
  blocks: InstructionBlock[],
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    `<!-- ForgeCraft sentinel: ${domain} | ${date} | npx forgecraft-mcp refresh . --apply to update -->`,
    "",
  ];

  for (const block of blocks) {
    const rendered = renderTemplate(block.content, context).trim();
    if (rendered) {
      lines.push(rendered);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Render the CNT root CLAUDE.md — exactly 3 lines: project identity + pointer.
 *
 * Full rules live in .claude/index.md (routing) and .claude/core.md (invariants).
 * Domain standards files are in .claude/standards/{domain}.md (generated alongside).
 *
 * @param _domains - Domains with standards files (unused; wayfinding moved to index.md)
 * @param context - Render context
 * @returns 3-line CLAUDE.md content ready to write
 */
function renderSentinelClaudeMd(
  _domains: Array<{ domain: string; description: string }>,
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const description = buildProjectDescription(context);
  return [
    `# ${context.projectName}`,
    `<!-- ForgeCraft sentinel | ${date} | npx forgecraft-mcp refresh . --apply to update -->`,
    description,
    ``,
    `Read \`.claude/index.md\` before any task. Navigate to the relevant branch. Load core.md always.`,
    ``,
  ].join("\n");
}

/**
 * Build the one-sentence project description line for CLAUDE.md.
 * Uses domain context if available, falls back to tag names.
 *
 * @param context - Render context
 * @returns Single sentence describing the project
 */
function buildProjectDescription(context: RenderContext): string {
  const nonUniversal = context.tags.filter((t) => t !== "UNIVERSAL");
  if (context.domain && context.domain !== "none") {
    return `A ${context.domain} project. Must not become a monolith — navigate via \`.claude/index.md\`.`;
  }
  if (nonUniversal.length > 0) {
    return `A ${nonUniversal.map((t) => t.toLowerCase()).join(", ")} project. Must not become a monolith.`;
  }
  return `<!-- FILL: one sentence — what this project is and what it must not become -->`;
}
