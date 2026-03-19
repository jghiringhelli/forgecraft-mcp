#!/usr/bin/env node
// @ts-nocheck

/**
 * ForgeCraft — Entry Point.
 *
 * Dual-mode binary: runs as a CLI tool when subcommands are provided,
 * or starts the MCP server in stdio mode when invoked without subcommands.
 *
 * CLI usage:   npx forgecraft-mcp setup .
 * MCP usage:   npx forgecraft-mcp          (or: npx forgecraft-mcp serve)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./shared/logger/index.js";
import { runCli } from "./cli.js";
import { sentinelSchema, sentinelHandler } from "./tools/sentinel.js";

// ── Entry Point ──────────────────────────────────────────────────────

const logger = createLogger("server");

async function startMcpServer(): Promise<void> {
  logger.info("Starting ForgeCraft MCP server");

  const server = new McpServer({
    name: "forgecraft",
    version: "1.0.0",
  });

  // ── Single sentinel tool (~200 tokens vs ~1,500 for full suite) ──
  server.tool(
    "forgecraft",
    "Setup-time tool for engineering standards. Diagnoses project state and recommends CLI commands to run. Remove this MCP server after setup is complete to save tokens.",
    sentinelSchema.shape,
    sentinelHandler,
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
