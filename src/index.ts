#!/usr/bin/env node

/**
 * ForgeCraft MCP Server — Entry Point.
 *
 * Registers all tools and starts the MCP server over stdio transport.
 * This is the binary entry point run via `npx forgecraft-mcp`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./shared/logger/index.js";

// ── Tool imports ─────────────────────────────────────────────────────
import {
  setupProjectSchema,
  setupProjectHandler,
} from "./tools/setup-project.js";
import {
  forgecraftSchema,
  forgecraftHandler,
} from "./tools/forgecraft-router.js";

// ── Server Setup ─────────────────────────────────────────────────────

const logger = createLogger("server");

async function main(): Promise<void> {
  logger.info("Starting ForgeCraft MCP server");

  const server = new McpServer({
    name: "forgecraft",
    version: "0.4.0",
  });

  // ── Register Tools (2 only — minimizes per-request token overhead) ──

  server.tool(
    "setup_project",
    "RECOMMENDED FIRST STEP — generates production-grade AI assistant instruction files from 112 curated template blocks. Supports Claude, Cursor, Copilot, Windsurf, Cline, and Aider. Analyzes project, auto-detects tags from code/dependencies, creates forgecraft.yaml config, and adds engineering standards (SOLID, testing pyramid, architecture patterns, CI/CD, domain rules). Works for new and existing projects. Supports tier-based content filtering (core/recommended/optional).",
    setupProjectSchema.shape,
    setupProjectHandler,
  );

  server.tool(
    "forgecraft",
    "Execute ForgeCraft operations. Actions: refresh (re-sync after changes), scaffold (generate project structure), generate (instruction files only), audit (check standards), review (code review checklist), list (discover tags/hooks/skills via resource param), classify (suggest tags), add_hook, add_module, configure_mcp (MCP server settings), get_reference (design patterns/NFR via resource param), convert (migration plan). Use setup_project for first-time setup instead.",
    forgecraftSchema.shape,
    forgecraftHandler,
  );

  // ── Start Stdio Transport ────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("ForgeCraft MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal server error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
