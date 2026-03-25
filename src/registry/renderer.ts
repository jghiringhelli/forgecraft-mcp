/**
 * Template renderer.
 *
 * Renders composed template content with project-specific variable substitution.
 * Supports multiple output targets (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 * Handles {{variable}} and {{variable | default: value}} syntax.
 */

import { createLogger } from "../shared/logger/index.js";
import type {
  InstructionBlock,
  NfrBlock,
  ReferenceBlock,
  ReviewBlock,
  ReviewDimension,
  OutputTarget,
} from "../shared/types.js";
import {
  OUTPUT_TARGET_CONFIGS,
  DEFAULT_OUTPUT_TARGET,
} from "../shared/types.js";
import type { RenderContext, RenderOptions } from "./renderer-types.js";
import { renderTemplate } from "./renderer-template.js";

export type { RenderContext, RenderOptions } from "./renderer-types.js";
export { renderTemplate } from "./renderer-template.js";
export {
  renderStatusMd,
  renderPrdSkeleton,
  renderTechSpecSkeleton,
} from "./renderer-skeletons.js";

const logger = createLogger("registry/renderer");

/**
 * Render an instruction file from composed blocks and project context.
 * Supports all output targets (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 *
 * @param blocks - Composed instruction blocks
 * @param context - Project context for variable substitution
 * @param target - Output target (defaults to "claude")
 * @param options - Rendering options (compact mode, etc.)
 * @returns Full instruction file content as a string
 */
export function renderInstructionFile(
  blocks: InstructionBlock[],
  context: RenderContext,
  target: OutputTarget = DEFAULT_OUTPUT_TARGET,
  options: RenderOptions = {},
): string {
  const targetConfig = OUTPUT_TARGET_CONFIGS[target];
  const header = buildHeader(context);
  const sections: string[] = [];

  if (targetConfig.usesFrontmatter) {
    sections.push(buildCursorFrontmatter(context));
  }

  sections.push(`${targetConfig.heading}\n`);
  sections.push(header);

  for (const block of blocks) {
    const rendered = renderTemplate(block.content, context);
    sections.push(rendered);
  }

  const assembled = sections.join("\n");
  return options.compact ? compactifyContent(assembled) : assembled;
}

/** Patterns that introduce explanatory clauses in bullet point lines. */
const EXPLANATORY_TAIL_RE = /\.\s+(?:This|It\b|Because|These|They|Note:)\b.*$/;

/**
 * Compact post-processor for instruction file content.
 *
 * Strips explanatory tail clauses from bullet lines
 * (e.g. ". This ensures X", ". Because Y", ". It prevents Z"),
 * deduplicates identical bullet lines across the full document,
 * and compresses excessive blank lines.
 *
 * Reduces token count by ~20–40% depending on tag mix.
 *
 * @param content - Full rendered instruction file content
 * @returns Compacted content
 */
export function compactifyContent(content: string): string {
  const seenBullets = new Set<string>();
  const lines = content
    .split("\n")
    .map((line) => {
      if (!line.startsWith("- ")) return line;
      const stripped = line.replace(EXPLANATORY_TAIL_RE, ".");
      if (seenBullets.has(stripped)) return null;
      seenBullets.add(stripped);
      return stripped;
    })
    .filter((line): line is string => line !== null);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * @deprecated Use renderInstructionFile instead. Kept for backward compatibility.
 */
export function renderClaudeMd(
  blocks: InstructionBlock[],
  context: RenderContext,
): string {
  return renderInstructionFile(blocks, context, "claude");
}

/**
 * Build the ForgeCraft metadata header for the instruction file.
 *
 * @param context - Project render context
 * @returns Single-line metadata comment
 */
function buildHeader(context: RenderContext): string {
  const date = new Date().toISOString().split("T")[0];
  const tagList = context.tags.join(", ");
  return `<!-- ForgeCraft | ${date} | tags: ${tagList} | npx forgecraft-mcp refresh . to update -->\n`;
}

/**
 * Build Cursor-specific MDC frontmatter.
 *
 * @param context - Project render context
 * @returns YAML frontmatter block
 */
function buildCursorFrontmatter(context: RenderContext): string {
  return (
    `---\n` +
    `description: Engineering standards for ${context.projectName}\n` +
    `globs:\n` +
    `alwaysApply: true\n` +
    `---\n`
  );
}

/**
 * Render NFR sections from composed blocks.
 *
 * @param blocks - Composed NFR blocks
 * @param context - Project context for variable substitution
 * @returns Rendered NFR content as a string
 */
export function renderNfrs(
  blocks: NfrBlock[],
  context: RenderContext,
): string {
  return blocks.map((block) => renderTemplate(block.content, context)).join("\n");
}

/**
 * Render design reference blocks (DDD, CQRS, GoF patterns) for on-demand retrieval.
 *
 * @param blocks - Composed reference blocks
 * @param context - Project context for variable substitution
 * @returns Formatted markdown content
 */
export function renderReference(
  blocks: ReferenceBlock[],
  context: RenderContext,
): string {
  return blocks.map((block) => renderTemplate(block.content, context)).join("\n");
}

/**
 * Render a skill template's content with project-specific variable substitution.
 * Skills are written as individual `.md` files in `.claude/commands/`.
 *
 * @param content - Raw skill content with {{variable}} placeholders
 * @param context - Project context for variable substitution
 * @returns Rendered skill content ready to write to file
 */
export function renderSkill(
  content: string,
  context: RenderContext,
): string {
  return renderTemplate(content, context);
}

/** Dimension display order for review output. */
const DIMENSION_ORDER: readonly ReviewDimension[] = [
  "architecture",
  "code-quality",
  "tests",
  "performance",
] as const;

/** Human-readable titles for review dimensions. */
const DIMENSION_TITLES: Record<ReviewDimension, string> = {
  architecture: "Architecture Review",
  "code-quality": "Code Quality Review",
  tests: "Test Review",
  performance: "Performance Review",
};

/**
 * Render review checklist blocks grouped by dimension.
 *
 * @param blocks - Composed review blocks from all active tags.
 * @param scope  - "comprehensive" renders all items; "focused" limits to critical items.
 * @returns Formatted markdown review checklist.
 */
export function renderReviewChecklist(
  blocks: ReviewBlock[],
  scope: "comprehensive" | "focused",
): string {
  const sections: string[] = [];

  const byDimension = new Map<ReviewDimension, ReviewBlock[]>();
  for (const block of blocks) {
    const existing = byDimension.get(block.dimension) ?? [];
    existing.push(block);
    byDimension.set(block.dimension, existing);
  }

  for (const dimension of DIMENSION_ORDER) {
    const dimensionBlocks = byDimension.get(dimension);
    if (!dimensionBlocks || dimensionBlocks.length === 0) continue;

    sections.push(`## ${DIMENSION_TITLES[dimension]}`);
    sections.push("");

    for (const block of dimensionBlocks) {
      sections.push(`### ${block.title}`);
      sections.push(block.description.trim());
      sections.push("");

      const items =
        scope === "focused"
          ? block.checklist.filter((item) => item.severity === "critical")
          : block.checklist;

      for (const item of items) {
        const icon =
          item.severity === "critical"
            ? "🔴"
            : item.severity === "important"
              ? "🟡"
              : "🟢";
        sections.push(`- ${icon} **[${item.severity.toUpperCase()}]** ${item.description}`);
      }
      sections.push("");
    }
  }

  sections.push("---");
  sections.push("");
  sections.push("## Per-Issue Output Format");
  sections.push("");
  sections.push("For every issue found, provide:");
  sections.push("1. **Problem**: Describe concretely, with file and line references.");
  sections.push("2. **Options**: Present 2-3 options (including \"do nothing\" where reasonable).");
  sections.push("3. **For each option**: implementation effort, risk, impact on other code, maintenance burden.");
  sections.push("4. **Recommendation**: Your preferred option with rationale.");
  sections.push("5. **Confirmation**: Ask whether to proceed or choose a different direction.");
  sections.push("");

  logger.debug("Review checklist rendered", { blocks: blocks.length, scope });

  return sections.join("\n");
}
