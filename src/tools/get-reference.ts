/**
 * get_design_reference tool handler.
 *
 * Returns design reference patterns (DDD, CQRS, GoF) on demand.
 * These blocks are NOT included in generated instruction files to save tokens —
 * they are served only when explicitly requested.
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderReference } from "../registry/renderer.js";

// ── Schema ───────────────────────────────────────────────────────────

export const getDesignReferenceSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Tags to get design reference patterns for."),
});

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Handle get_design_reference tool calls.
 *
 * @param args - Validated tool input with tags array
 * @returns Design reference patterns as formatted markdown
 */
export async function getDesignReferenceHandler(
  args: z.infer<typeof getDesignReferenceSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  const templateSets = await loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  if (composed.referenceBlocks.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No design reference patterns found for the specified tags.",
        },
      ],
    };
  }

  const context = {
    projectName: "Project",
    language: "typescript" as const,
    tags,
  };

  const referenceContent = renderReference(composed.referenceBlocks, context);

  return {
    content: [
      {
        type: "text",
        text:
          `# Design Reference Patterns\n\n` +
          `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n` +
          `**Patterns:** ${composed.referenceBlocks.length}\n\n` +
          `> These patterns are served on demand to save tokens. ` +
          `They are NOT included in your instruction files.\n\n` +
          referenceContent,
      },
    ],
  };
}
