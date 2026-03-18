/**
 * review_project tool handler.
 *
 * Returns a structured code review checklist composed from review templates
 * for the project's active tags. Supports comprehensive (all items) or
 * focused (critical-only) scope.
 */
// @ts-nocheck


import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderReviewChecklist } from "../registry/renderer.js";

// ── Schema ───────────────────────────────────────────────────────────

export const reviewProjectSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Active project tags to generate review checklist for."),
  scope: z
    .enum(["comprehensive", "focused"])
    .default("comprehensive")
    .describe(
      "Review scope: 'comprehensive' covers all severity levels across all 4 dimensions. " +
      "'focused' limits to critical items only — ideal for quick pre-merge reviews.",
    ),
});

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate a structured code review checklist for the given tags and scope.
 *
 * @param args - Validated tool input with tags and scope.
 * @returns MCP tool response with rendered review checklist.
 */
export async function reviewProjectHandler(
  args: z.infer<typeof reviewProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  const templateSets = loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  if (composed.reviewBlocks.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No review templates found for the specified tags.",
        },
      ],
    };
  }

  const reviewContent = renderReviewChecklist(
    composed.reviewBlocks,
    args.scope,
  );

  const scopeLabel =
    args.scope === "comprehensive"
      ? "Comprehensive (all severity levels)"
      : "Focused (critical items only)";

  const dimensionCount = new Set(
    composed.reviewBlocks.map((block) => block.dimension),
  ).size;

  const totalChecks = composed.reviewBlocks.reduce(
    (sum, block) => sum + block.checklist.length,
    0,
  );

  let text = `# Code Review Checklist\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Scope:** ${scopeLabel}\n`;
  text += `**Dimensions:** ${dimensionCount}\n`;
  text += `**Total checks:** ${totalChecks}\n\n`;
  text += reviewContent;

  return { content: [{ type: "text", text }] };
}
