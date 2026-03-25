/**
 * Detects whether an AI assistant with MCP support is configured
 * in the current project or the user's global environment.
 *
 * ForgeCraft is designed to work inside an AI assistant loop.
 * Without one, tag inference is limited to directory heuristics and
 * the two-phase spec analysis cannot run.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AssistantDetectionResult {
  /** True if at least one AI assistant with MCP support is found. */
  readonly detected: boolean;
  /** Human-readable label of the first detected assistant. */
  readonly name: string | null;
}

/**
 * Paths relative to the project directory that indicate MCP is configured.
 */
const PROJECT_MCP_PATHS = [
  ".vscode/mcp.json",
  ".cursor/mcp.json",
  ".cline/mcp.json",
  "CLAUDE.md",
  ".claude/mcp.json",
];

/**
 * Paths relative to the user's home directory that indicate a global MCP client.
 */
function globalMcpPaths(): Array<{ path: string; name: string }> {
  const home = homedir();
  return [
    {
      path: join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
      name: "Claude Desktop",
    },
    {
      path: join(
        home,
        "AppData",
        "Roaming",
        "Claude",
        "claude_desktop_config.json",
      ),
      name: "Claude Desktop",
    },
    {
      path: join(home, ".config", "claude", "claude_desktop_config.json"),
      name: "Claude Desktop",
    },
    {
      path: join(home, ".cursor", "mcp.json"),
      name: "Cursor",
    },
    {
      path: join(home, ".codeium", "windsurf", "mcp_config.json"),
      name: "Windsurf",
    },
  ];
}

/**
 * Detect an AI assistant in the given project directory or the global environment.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Detection result with assistant name if found
 */
export function detectAiAssistant(
  projectDir: string,
): AssistantDetectionResult {
  for (const rel of PROJECT_MCP_PATHS) {
    if (existsSync(join(projectDir, rel))) {
      const name = rel.includes("vscode")
        ? "VS Code Copilot / Claude"
        : rel.includes("cursor")
          ? "Cursor"
          : rel.includes("cline")
            ? "Cline"
            : "Claude";
      return { detected: true, name };
    }
  }

  for (const { path, name } of globalMcpPaths()) {
    if (existsSync(path)) {
      return { detected: true, name };
    }
  }

  return { detected: false, name: null };
}

/**
 * Build a human-readable warning message for when no AI assistant is found.
 *
 * @returns Multi-line warning string
 */
export function buildNoAssistantWarning(): string {
  return [
    "⚠️  No AI assistant detected",
    "",
    "ForgeCraft is designed to work inside an AI coding assistant (Claude, Copilot,",
    "Cursor, Windsurf, etc.). Without one, tag inference is limited to directory",
    "heuristics and the spec-reading phase cannot run.",
    "",
    "To get full value from ForgeCraft, configure your assistant first:",
    "",
    "  Claude Desktop / Claude CLI:",
    "    claude mcp add forgecraft-mcp -- npx -y forgecraft-mcp",
    "",
    "  VS Code Copilot (add to .vscode/mcp.json):",
    '    { "servers": { "forgecraft": { "type": "stdio", "command": "npx", "args": ["-y", "forgecraft-mcp"] } } }',
    "",
    "  Cursor / Windsurf:",
    "    See https://github.com/jghiringhelli/forgecraft-mcp#mcp-sentinel",
    "",
    'Then ask your assistant: "Run forgecraft setup_project on this project."',
    "",
    "Continuing with directory-only analysis (tags may be inaccurate)...",
    "─────────────────────────────────────────────────────────────────────",
    "",
  ].join("\n");
}
