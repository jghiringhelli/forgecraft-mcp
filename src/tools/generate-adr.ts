/**
 * generate_adr tool handler.
 *
 * Emits a structured Architecture Decision Record (ADR) file into docs/adrs/
 * with an auto-sequenced number derived from existing files in that directory.
 *
 * ADRs are the primary Auditable artifact in the GS methodology:
 * every non-obvious architectural choice must be recorded with context,
 * decision, alternatives considered, and consequences accepted.
 *
 * Output file: docs/adrs/NNNN-kebab-title.md
 * Format: MADR-inspired with all four required sections (Status, Context, Decision, Consequences).
 */

import { z } from "zod";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/generate-adr");

const ADR_DIR = join("docs", "adrs");
const ADR_FILENAME_RE = /^(\d{4})-[a-z0-9-]+\.md$/;

// ── Schema ───────────────────────────────────────────────────────────

export const generateAdrSchema = z.object({
  project_dir: z
    .string()
    .describe(
      "Absolute path to the project root. ADR is written to {project_dir}/docs/adrs/.",
    ),
  title: z
    .string()
    .describe(
      "Short imperative title of the architectural decision (e.g. 'Use PostgreSQL for primary storage'). " +
        "Becomes the filename in kebab-case and the H1 heading.",
    ),
  context: z
    .string()
    .optional()
    .describe(
      "The situation that forced this decision — constraints, requirements, and forces at play. " +
        "If omitted, a placeholder is written for the practitioner to complete.",
    ),
  decision: z
    .string()
    .optional()
    .describe(
      "What was decided and why this option was chosen over the alternatives. " +
        "If omitted, a placeholder is written.",
    ),
  alternatives: z
    .array(z.string())
    .optional()
    .describe(
      "Alternatives considered and why each was rejected. " +
        "If omitted, a placeholder list is written.",
    ),
  consequences: z
    .string()
    .optional()
    .describe(
      "Positive and negative consequences of this decision — what becomes easier, harder, or newly constrained. " +
        "If omitted, a placeholder is written.",
    ),
});

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate and write a structured ADR file.
 *
 * @param args - Validated tool input
 * @returns MCP tool response with the written file path and content
 */
export async function generateAdrHandler(
  args: z.infer<typeof generateAdrSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { project_dir, title } = args;

  const adrDir = join(project_dir, ADR_DIR);
  if (!existsSync(adrDir)) {
    mkdirSync(adrDir, { recursive: true });
    logger.info("Created docs/adrs/ directory", { adrDir });
  }

  const nextNumber = resolveNextAdrNumber(adrDir);
  const slug = titleToSlug(title);
  const filename = `${String(nextNumber).padStart(4, "0")}-${slug}.md`;
  const filePath = join(adrDir, filename);
  const relativePath = join(ADR_DIR, filename).replace(/\\/g, "/");

  if (existsSync(filePath)) {
    return {
      content: [
        {
          type: "text",
          text: `ADR file already exists: ${relativePath}\nChoose a different title or rename the existing file.`,
        },
      ],
    };
  }

  const content = renderAdr({
    number: nextNumber,
    title,
    context: args.context,
    decision: args.decision,
    alternatives: args.alternatives,
    consequences: args.consequences,
  });

  writeFileSync(filePath, content, "utf-8");
  logger.info("ADR written", { filePath, number: nextNumber });

  const lines = [
    `# ADR Written`,
    ``,
    `**File:** \`${relativePath}\``,
    `**Number:** ADR-${String(nextNumber).padStart(4, "0")}`,
    `**Title:** ${title}`,
    ``,
    `## Content`,
    ``,
    "```markdown",
    content,
    "```",
    ``,
    `> **Next step:** If any sections contain \`[NEEDS CLARIFICATION]\` markers, resolve them before committing.`,
    `> ADR files are immutable once accepted — use a new ADR to supersede this one.`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Find the next available ADR sequence number.
 * Scans existing NNNN-*.md files and returns max + 1 (minimum 1).
 */
function resolveNextAdrNumber(adrDir: string): number {
  const existing = readdirSync(adrDir)
    .map((f) => ADR_FILENAME_RE.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1] as string, 10));

  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

/**
 * Convert a title string to a URL-safe kebab-case slug.
 * Strips punctuation, lowercases, replaces spaces/underscores with hyphens.
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

interface AdrFields {
  readonly number: number;
  readonly title: string;
  readonly context?: string;
  readonly decision?: string;
  readonly alternatives?: string[];
  readonly consequences?: string;
}

/**
 * Render a complete ADR document from the provided fields.
 * Follows the MADR (Markdown Architectural Decision Records) format.
 */
function renderAdr(fields: AdrFields): string {
  const { number, title, context, decision, alternatives, consequences } =
    fields;
  const id = `ADR-${String(number).padStart(4, "0")}`;
  const date = new Date().toISOString().slice(0, 10);

  const alternativeBlock =
    alternatives && alternatives.length > 0
      ? alternatives.map((a) => `- ${a}`).join("\n")
      : "- [NEEDS CLARIFICATION: list alternatives considered and why each was rejected]";

  return [
    `# ${id}: ${title}`,
    ``,
    `**Date:** ${date}`,
    `**Status:** Proposed`,
    ``,
    `## Status`,
    ``,
    `Proposed`,
    ``,
    `## Context`,
    ``,
    context ??
      "[NEEDS CLARIFICATION: describe the situation that forced this decision — what constraints, requirements, and forces are at play]",
    ``,
    `## Decision`,
    ``,
    decision ??
      "[NEEDS CLARIFICATION: state what was decided and why this option was chosen over the alternatives]",
    ``,
    `## Alternatives Considered`,
    ``,
    alternativeBlock,
    ``,
    `## Consequences`,
    ``,
    consequences ??
      "[NEEDS CLARIFICATION: describe what becomes easier, harder, or newly constrained as a result of this decision]",
    ``,
    `---`,
    ``,
    `_This ADR was generated by ForgeCraft. Resolve any [NEEDS CLARIFICATION] sections before accepting — the AI cannot act on ambiguity it cannot see._`,
  ].join("\n");
}
