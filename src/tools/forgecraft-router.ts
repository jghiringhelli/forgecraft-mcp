/**
 * Unified forgecraft tool router.
 *
 * Thin entry point: dispatches all 30 MCP tool actions to the appropriate
 * handler via forgecraft-dispatch.ts. Ambiguity formatting is applied
 * as a post-processing step before returning to the caller.
 *
 * Schema lives in forgecraft-schema.ts.
 * Dispatch logic lives in forgecraft-dispatch.ts.
 */

import type { ToolResult, ToolAmbiguity } from "../shared/types.js";
import type { ForgecraftArgs } from "./forgecraft-schema.js";
import { dispatchForgecraft } from "./forgecraft-dispatch.js";

export { forgecraftSchema } from "./forgecraft-schema.js";
export type { ForgecraftArgs } from "./forgecraft-schema.js";

// ── Public handler ───────────────────────────────────────────────────

/**
 * Unified handler that dispatches to the appropriate tool handler
 * based on the `action` parameter, then formats any ambiguities.
 *
 * @param args - Validated unified tool input
 * @returns MCP tool response from the delegated handler
 */
export async function forgecraftHandler(
  args: ForgecraftArgs,
): Promise<ToolResult> {
  const result = await dispatchForgecraft(args);
  return applyAmbiguityFormatting(result);
}

// ── Ambiguity formatting ─────────────────────────────────────────────

/**
 * Format a single ToolAmbiguity into the standard ⚡ Ambiguity block.
 *
 * @param ambiguity - The ambiguity to format
 * @returns Formatted multi-line string
 */
export function formatAmbiguity(ambiguity: ToolAmbiguity): string {
  const lines: string[] = [
    `⚡ Ambiguity — ${ambiguity.field}`,
    `   I understood this as: ${ambiguity.understood_as}`,
    `   → Example: ${ambiguity.understood_example}`,
  ];
  for (const alt of ambiguity.alternatives) {
    lines.push(`   Alternative: ${alt.label} → ${alt.action}`);
  }
  lines.push(`   To resolve: ${ambiguity.resolution_hint}`);
  return lines.join("\n");
}

/**
 * Prepend formatted ambiguity blocks to the result's text content.
 * Returns the result unchanged if there are no ambiguities.
 *
 * @param result - Raw tool result, possibly with ambiguities
 * @returns Result with ambiguities merged into text content
 */
export function applyAmbiguityFormatting(result: ToolResult): ToolResult {
  if (!result.ambiguities?.length) return result;

  const ambiguitySection = result.ambiguities.map(formatAmbiguity).join("\n\n");
  const existingText = result.content[0]?.text ?? "";
  const mergedText = `${ambiguitySection}\n\n---\n\n${existingText}`;

  return {
    content: [{ type: "text", text: mergedText }, ...result.content.slice(1)],
  };
}

