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

  // Guidance blocks (topic: guidance) are served via get_reference(resource: guidance).
  // Exclude them here so design-pattern results stay focused on DDD, CQRS, GoF.
  const designBlocks = composed.referenceBlocks.filter(
    (block) => block.topic !== "guidance",
  );

  if (designBlocks.length === 0) {
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

  const referenceContent = renderReference(designBlocks, context);

  return {
    content: [
      {
        type: "text",
        text:
          `# Design Reference Patterns\n\n` +
          `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n` +
          `**Patterns:** ${designBlocks.length}\n\n` +
          `> These patterns are served on demand to save tokens. ` +
          `They are NOT included in your instruction files.\n\n` +
          referenceContent,
      },
    ],
  };
}

// ── Guidance Handler ─────────────────────────────────────────────────

/**
 * Handle get_reference with resource="guidance".
 *
 * Returns the five GS Practitioner Protocol procedure blocks (session loop,
 * context-loading strategy, incremental cascade, bound roadmap, diagnostic
 * checklist) on demand. These blocks are intentionally excluded from generated
 * CLAUDE.md files to preserve the token budget of the instruction file.
 *
 * @returns GS guidance procedures as formatted markdown
 */
export async function getGuidanceHandler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const tags: Tag[] = ["UNIVERSAL"];
  const templateSets = await loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  const guidanceBlocks = composed.referenceBlocks.filter(
    (block) => block.topic === "guidance",
  );

  if (guidanceBlocks.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No GS guidance blocks found. Ensure the UNIVERSAL reference template contains blocks with topic: guidance.",
        },
      ],
    };
  }

  const context = {
    projectName: "Project",
    language: "typescript" as const,
    tags,
  };

  const guidanceContent = renderReference(guidanceBlocks, context);

  return {
    content: [
      {
        type: "text",
        text:
          `# GS Practitioner Protocol — Guidance Procedures\n\n` +
          `**Procedures:** ${guidanceBlocks.length}\n\n` +
          `> These procedures are served on demand via \`get_reference(resource: guidance)\`.\n` +
          `> They are NOT inlined in instruction files to preserve the token budget.\n\n` +
          guidanceContent,
      },
    ],
  };
}
