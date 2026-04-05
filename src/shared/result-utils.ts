/**
 * MCP tool result size utilities.
 *
 * Prevents silent schema truncation at the MCP transport layer by:
 * - Annotating large results with their size (chars + lines)
 * - Truncating results that exceed the limit with an explicit marker
 *   so the caller knows to refine their query rather than acting on
 *   incomplete data.
 */

/** Maximum characters returned in a single tool result. */
export const MAX_TOOL_RESULT_CHARS = 50_000;

/** Minimum size (chars) before a size annotation is appended. */
const SIZE_ANNOTATION_THRESHOLD = 1_000;

/**
 * Annotate a tool result text with its size and truncate if necessary.
 *
 * - Under `maxChars` and over `SIZE_ANNOTATION_THRESHOLD`: appends a compact
 *   footer showing char/line count.
 * - Over `maxChars`: truncates to `maxChars` and appends a `[TRUNCATED]`
 *   footer so the caller knows the response is incomplete.
 * - Under `SIZE_ANNOTATION_THRESHOLD`: returned as-is (no footer noise for
 *   short replies like "No violations recorded.").
 *
 * @param text - Raw tool result text
 * @param maxChars - Truncation limit (default: MAX_TOOL_RESULT_CHARS)
 * @returns Annotated (and possibly truncated) text
 */
export function annotateResult(
  text: string,
  maxChars: number = MAX_TOOL_RESULT_CHARS,
): string {
  const total = text.length;

  if (total <= SIZE_ANNOTATION_THRESHOLD) return text;

  if (total <= maxChars) {
    const lines = text.split("\n").length;
    return `${text}\n\n---\n_↩ ${total.toLocaleString()} chars · ${lines.toLocaleString()} lines_`;
  }

  const truncated = text.slice(0, maxChars);
  return (
    `${truncated}\n\n---\n` +
    `_[TRUNCATED: showing first ${maxChars.toLocaleString()} of ${total.toLocaleString()} chars — ` +
    `use a more specific query or smaller scope to see the rest]_`
  );
}
