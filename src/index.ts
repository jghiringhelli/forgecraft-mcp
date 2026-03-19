#!/usr/bin/env node

/**
 * ForgeCraft — Entry Point.
 *
 * Dual-mode binary: runs as a CLI tool when subcommands are provided,
 * or starts the MCP server in stdio mode when invoked without subcommands.
 *
 * CLI usage:   npx forgecraft-mcp setup .
 * MCP usage:   npx forgecraft-mcp          (or: npx forgecraft-mcp serve)
 *
 * MCP tool strategy:
 *   - "forgecraft" sentinel: lightweight status probe (~200 tokens)
 *   - "forgecraft_actions" full router: all setup/cascade actions (~1,500 tokens)
 *
 * Recommendation: remove this MCP server after initial project setup.
 * Re-add temporarily for refresh, audit, or cascade checks.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./shared/logger/index.js";
import { runCli } from "./cli.js";
import { sentinelSchema, sentinelHandler } from "./tools/sentinel.js";
import {
  forgecraftSchema,
  forgecraftHandler,
} from "./tools/forgecraft-router.js";

// ── Entry Point ──────────────────────────────────────────────────────

const logger = createLogger("server");

async function startMcpServer(): Promise<void> {
  logger.info("Starting ForgeCraft MCP server");

  const server = new McpServer({
    name: "forgecraft",
    version: "1.0.0",
  });

  // ── Sentinel: lightweight status probe + next-step guidance ──
  server.tool(
    "forgecraft",
    "Setup-time tool for engineering standards. Diagnoses project state. Remove this MCP server after setup is complete to save tokens.",
    sentinelSchema.shape,
    sentinelHandler,
  );

  // ── Full action router: setup, cascade, audit, generate, etc. ──
  server.tool(
    "forgecraft_actions",
    "Full ForgeCraft action suite. Use action='setup_project' to onboard, 'check_cascade' to verify GS steps, 'generate_session_prompt' for a bound prompt, 'audit' for compliance score. Remove after setup to save tokens.",
    forgecraftSchema.shape,
    async (args) => {
      const result = await forgecraftHandler(
        args as Parameters<typeof forgecraftHandler>[0],
      );
      return result as { content: Array<{ type: "text"; text: string }> };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("ForgeCraft MCP server running on stdio");
}

async function main(): Promise<void> {
  const cliHandled = await runCli(process.argv);
  if (!cliHandled) {
    await startMcpServer();
  }
}

main().catch((error) => {
  logger.error("Fatal error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
