/**
 * advise_session — session-start advisor.
 *
 * Reads project signals (artifacts, violations, recent git activity) and
 * returns a short advisory the LLM surfaces to the user at session start.
 * Works on any project — GS configuration is not required.
 */

import { z } from "zod";
import type { ToolResult } from "../shared/types.js";
import { readProjectSignals } from "./advise-session-signals.js";
import { buildAdviceItems, formatAdvice } from "./advise-session-advisor.js";

// ── Schema ────────────────────────────────────────────────────────────

export const adviseSessionSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe(
      "Maximum advice items to return. Default: 5. " +
        "Agent-agnostic: works with Claude Code, Cursor, Cline, Windsurf, Copilot, Aider — any MCP-capable client.",
    ),
});

export type AdviseSessionInput = z.infer<typeof adviseSessionSchema>;

// ── Handler ───────────────────────────────────────────────────────────

export async function adviseSessionHandler(
  args: AdviseSessionInput,
): Promise<ToolResult> {
  const { project_dir, max_items = 5 } = args;
  const signals = readProjectSignals(project_dir);
  const items = buildAdviceItems(signals, max_items);
  const text = formatAdvice(items, signals.recentActivity);
  return { content: [{ type: "text", text }] };
}
