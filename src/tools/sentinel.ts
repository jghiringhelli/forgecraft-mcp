/**
 * Minimal MCP sentinel tool.
 *
 * Diagnoses project state and recommends CLI commands.
 * Replaces the full MCP tool suite for users who only need setup-time operations.
 * Near-zero token cost: 1 tool, 1 param, short description (~200 tokens vs ~1,500).
 */

import { z } from "zod";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ── Schema ───────────────────────────────────────────────────────────

export const sentinelSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to project root."),
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

  const hasConfig  = existsSync(join(project_dir, "forgecraft.yaml"));
  const hasClaudeMd = existsSync(join(project_dir, "CLAUDE.md"));
  const hasHooks   = existsSync(join(project_dir, ".claude", "hooks"));

  const lines: string[] = [];

  if (!hasConfig && !hasClaudeMd) {
    lines.push(
      "## Project has no engineering standards configured.",
      "",
      "Run the following command to auto-detect your stack and generate CLAUDE.md, hooks, and skills:",
      `  npx forgecraft-mcp setup ${project_dir}`,
      "",
      "Options:",
      "  --tags UNIVERSAL API        Override auto-detected tags",
      "  --tier core|recommended     Content depth (default: recommended)",
      "  --targets claude cursor     Additional AI assistant targets",
      "  --dry-run                   Preview without writing files",
    );
  } else if (hasConfig && !hasHooks) {
    lines.push(
      "## Project has forgecraft.yaml but is missing hooks and skills.",
      "",
      "Regenerate the project structure:",
      `  npx forgecraft-mcp scaffold ${project_dir}`,
      "",
      "Or refresh to re-sync everything:",
      `  npx forgecraft-mcp refresh ${project_dir} --apply`,
    );
  } else {
    const configStatus = hasConfig ? "forgecraft.yaml ✓" : "no forgecraft.yaml";
    const mdStatus     = hasClaudeMd ? "CLAUDE.md ✓" : "no CLAUDE.md";
    const hooksStatus  = hasHooks ? ".claude/hooks ✓" : "no hooks";

    lines.push(
      `## Project status: ${configStatus} | ${mdStatus} | ${hooksStatus}`,
      "",
      "To re-sync instruction files after project changes:",
      `  npx forgecraft-mcp refresh ${project_dir} --apply`,
      "",
      "To audit against configured standards:",
      `  npx forgecraft-mcp audit ${project_dir}`,
      "",
      "To add new output targets (cursor, copilot, windsurf):",
      `  npx forgecraft-mcp refresh ${project_dir} --apply --targets claude cursor copilot`,
    );
  }

  lines.push(
    "",
    "---",
    "**ForgeCraft is a setup-time tool.** Once your project is configured,",
    "remove it from your MCP servers to save tokens.",
    "Re-add it temporarily when you need to refresh, audit, or scaffold.",
    "",
    "All commands: setup | refresh | audit | scaffold | review | list | classify | generate | convert | add-hook | add-module",
    "Docs: https://github.com/jghiringhelli/forgecraft-mcp",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
