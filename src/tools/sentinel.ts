/**
 * Minimal MCP sentinel tool.
 *
 * Diagnoses project state and emits CLI commands for the AI to run autonomously.
 * Replaces the full MCP tool suite for users who only need setup-time operations.
 * Near-zero token cost: 1 tool, 1 param, short description (~200 tokens vs ~1,500).
 */

import { z } from "zod";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ALL_TAGS } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const sentinelSchema = z.object({
  project_dir: z.string().describe("Absolute path to project root."),
});

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Inspect project state and return targeted CLI recommendations.
 *
 * @param args - Validated sentinel input
 * @returns MCP tool response with diagnostic text and CLI commands to run
 */
export async function sentinelHandler(
  args: z.infer<typeof sentinelSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { project_dir } = args;

  const hasConfig = existsSync(join(project_dir, "forgecraft.yaml"));
  const hasClaudeMd = existsSync(join(project_dir, "CLAUDE.md"));
  const hasHooks = existsSync(join(project_dir, ".claude", "hooks"));

  const lines: string[] = [];

  const validTagList = ALL_TAGS.join(" | ");

  if (!hasConfig && !hasClaudeMd) {
    lines.push(
      "## Project has no engineering standards configured.",
      "",
      "**Call `forgecraft_actions` now** with these parameters:",
      `  action: "setup_project"`,
      `  project_dir: "${project_dir}"`,
      "",
      "This will analyze the project, infer tags from any spec files found,",
      "ask calibration questions (MVP? scope complete? existing consumers?),",
      "then scaffold CLAUDE.md, hooks, and skills.",
      "",
      `Valid tags (use ONLY these): ${validTagList}`,
      "",
      "**Do NOT invent tags.** Only pass tags from the list above.",
      "To specify a spec file explicitly, also pass: spec_path: '<absolute path to spec>'",
    );
  } else if (hasConfig && !hasHooks) {
    lines.push(
      "## Project has forgecraft.yaml but is missing hooks and skills.",
      "",
      "**Call `forgecraft_actions` now** with:",
      `  action: "scaffold"`,
      `  project_dir: "${project_dir}"`,
    );
  } else {
    const configStatus = hasConfig ? "forgecraft.yaml ✓" : "no forgecraft.yaml";
    const mdStatus = hasClaudeMd ? "CLAUDE.md ✓" : "no CLAUDE.md";
    const hooksStatus = hasHooks ? ".claude/hooks ✓" : "no hooks";

    lines.push(
      `## Project status: ${configStatus} | ${mdStatus} | ${hooksStatus}`,
      "",
      "Call `forgecraft_actions` as needed:",
      `  action: "refresh",       project_dir: "${project_dir}"   (re-sync after project changes)`,
      `  action: "audit",         project_dir: "${project_dir}"   (score compliance 0-100)`,
      `  action: "check_cascade", project_dir: "${project_dir}"   (verify GS cascade steps)`,
    );
  }

  lines.push(
    "",
    "---",
    "**ForgeCraft is a setup-time tool.** Once your project is configured,",
    "remove it from your MCP servers to save tokens.",
    "Re-add it temporarily when you need to refresh, audit, or cascade-check.",
    "",
    "Docs: https://github.com/jghiringhelli/forgecraft-mcp",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
