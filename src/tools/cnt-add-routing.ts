/**
 * cnt_add_routing tool handler.
 *
 * Generates and appends a routing block to .claude/index.md — one line per
 * leaf node in .claude/standards/, with a "[NEEDS CLARIFICATION: when to load]"
 * placeholder that the practitioner fills in.
 *
 * This closes the "Bounded" property gap: without explicit routing directives,
 * the AI has no instruction about when to descend to each leaf, so it either
 * loads everything (expensive) or guesses (unreliable).
 *
 * Idempotent: leaves already referenced in index.md are skipped.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findUnroutedLeaves } from "../shared/cnt-health.js";
import type { ToolResult } from "../shared/types.js";

export interface CntAddRoutingInput {
  readonly project_dir: string;
  /** Optional domain-level description hints keyed by leaf stem name. */
  readonly hints?: Record<string, string>;
}

/**
 * Append routing directives for unrouted leaves into .claude/index.md.
 *
 * @param args - Input with project_dir and optional hints
 * @returns MCP tool result with added/skipped counts and the appended block
 */
export async function cntAddRoutingHandler(
  args: CntAddRoutingInput,
): Promise<ToolResult> {
  const { project_dir, hints = {} } = args;
  const indexPath = join(project_dir, ".claude", "index.md");

  if (!existsSync(indexPath)) {
    return {
      content: [
        {
          type: "text",
          text: "`.claude/index.md` not found — run `cnt_add_node` or `scaffold` first to initialize the CNT.",
        },
      ],
    };
  }

  const unrouted = findUnroutedLeaves(project_dir);

  if (unrouted.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "All CNT leaf nodes already have routing directives in `.claude/index.md`. No changes needed.",
        },
      ],
    };
  }

  const routingBlock = buildRoutingBlock(unrouted, hints);
  const existing = readFileSync(indexPath, "utf-8");

  // Append after a separator if the file doesn't already end with one
  const separator = existing.trimEnd().endsWith("---") ? "\n" : "\n\n---\n\n";
  const updated = existing.trimEnd() + separator + routingBlock + "\n";
  writeFileSync(indexPath, updated, "utf-8");

  const lines = [
    `## CNT Routing Updated`,
    ``,
    `Added routing directives for **${unrouted.length}** leaf node(s) to \`.claude/index.md\`.`,
    ``,
    `**Added:**`,
    ...unrouted.map((leaf) => `- \`${leaf}\``),
    ``,
    `**Next step:** Replace each \`[NEEDS CLARIFICATION]\` placeholder with a concrete "when to load" condition.`,
    ``,
    `Example good routing:`,
    `\`\`\``,
    `- **tools-routing** → load \`.claude/standards/tools-routing.md\` when working on MCP tool handlers in \`src/tools/\``,
    `\`\`\``,
    ``,
    `Example weak routing (avoid — too broad):`,
    `\`\`\``,
    `- **tools-routing** → general guidelines`,
    `\`\`\``,
    ``,
    `### Appended block`,
    ``,
    "```markdown",
    routingBlock,
    "```",
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Build the routing block markdown to append to index.md.
 */
export function buildRoutingBlock(
  unrouted: string[],
  hints: Record<string, string>,
): string {
  const lines = [
    `## Context Navigation — When to Load Each Leaf`,
    ``,
    `Load the relevant leaf file BEFORE modifying code in the corresponding domain.`,
    `Do NOT load all leaves at session start — load on demand per task.`,
    ``,
  ];

  for (const leaf of unrouted) {
    const hint =
      hints[leaf] ??
      `[NEEDS CLARIFICATION: describe what task or file pattern triggers loading \`.claude/standards/${leaf}.md\`]`;
    lines.push(`- **${leaf}** → \`.claude/standards/${leaf}.md\` — ${hint}`);
  }

  return lines.join("\n");
}
