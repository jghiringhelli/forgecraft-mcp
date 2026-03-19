/**
 * get_nfr_template tool handler.
 *
 * Returns NFR (Non-Functional Requirements) sections for specified tags.
 */
// @ts-nocheck


import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderNfrs } from "../registry/renderer.js";

// ── Schema ───────────────────────────────────────────────────────────

export const getNfrTemplateSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Tags to get NFR templates for."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function getNfrTemplateHandler(
  args: z.infer<typeof getNfrTemplateSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  const templateSets = await loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  if (composed.nfrBlocks.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No NFR templates found for the specified tags.",
        },
      ],
    };
  }

  const context = {
    projectName: "Project",
    language: "typescript" as const,
    tags,
  };

  const nfrContent = renderNfrs(composed.nfrBlocks, context);

  return {
    content: [
      {
        type: "text",
        text:
          `# Non-Functional Requirements\n\n` +
          `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n` +
          `**Sections:** ${composed.nfrBlocks.length}\n\n` +
          nfrContent,
      },
    ],
  };
}
