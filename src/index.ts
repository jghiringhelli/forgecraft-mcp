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
  listTagsSchema,
  listTagsHandler,
  listHooksSchema,
  listHooksHandler,
} from "./tools/list.js";
import {
  classifyProjectSchema,
  classifyProjectHandler,
} from "./tools/classify.js";
import {
  scaffoldProjectSchema,
  scaffoldProjectHandler,
} from "./tools/scaffold.js";
import {
  generateInstructionsSchema,
  generateInstructionsHandler,
} from "./tools/generate-claude-md.js";
import {
  auditProjectSchema,
  auditProjectHandler,
} from "./tools/audit.js";
import {
  addHookSchema,
  addHookHandler,
} from "./tools/add-hook.js";
import {
  addModuleSchema,
  addModuleHandler,
} from "./tools/add-module.js";
import {
  configureMcpSchema,
  configureMcpHandler,
} from "./tools/configure-mcp.js";
import {
  getNfrTemplateSchema,
  getNfrTemplateHandler,
} from "./tools/get-nfr.js";
import {
  getDesignReferenceSchema,
  getDesignReferenceHandler,
} from "./tools/get-reference.js";
import {
  convertExistingSchema,
  convertExistingHandler,
} from "./tools/convert.js";
import {
  reviewProjectSchema,
  reviewProjectHandler,
} from "./tools/review.js";
import {
  setupProjectSchema,
  setupProjectHandler,
} from "./tools/setup-project.js";
import {
  refreshProjectSchema,
  refreshProjectHandler,
} from "./tools/refresh-project.js";

// ── Server Setup ─────────────────────────────────────────────────────

const logger = createLogger("server");

async function main(): Promise<void> {
  logger.info("Starting ForgeCraft MCP server");

  const server = new McpServer({
    name: "forgecraft",
    version: "0.2.0",
  });

  // ── Register Tools ───────────────────────────────────────────────

  server.tool(
    "list_tags",
    "List all available project classification tags with descriptions.",
    listTagsSchema.shape,
    listTagsHandler,
  );

  server.tool(
    "list_hooks",
    "List available hooks, optionally filtered by tags.",
    listHooksSchema.shape,
    listHooksHandler,
  );

  server.tool(
    "classify_project",
    "Analyze a project directory and/or description to suggest classification tags.",
    classifyProjectSchema.shape,
    classifyProjectHandler,
  );

  server.tool(
    "scaffold_project",
    "Generate full project structure (instruction files, Status.md, hooks, folders) from tags. Supports multiple AI assistant targets.",
    scaffoldProjectSchema.shape,
    scaffoldProjectHandler,
  );

  server.tool(
    "generate_instructions",
    "Generate AI assistant instruction files for given tags. Supports multiple targets: Claude (CLAUDE.md), Cursor (.cursor/rules/), GitHub Copilot (.github/copilot-instructions.md), Windsurf (.windsurfrules), Cline (.clinerules), Aider (CONVENTIONS.md). Adds SOLID principles, testing pyramid, architecture patterns, CI/CD, and domain-specific standards from 112 curated blocks. Can merge with existing files to preserve custom sections.",
    generateInstructionsSchema.shape,
    generateInstructionsHandler,
  );

  server.tool(
    "audit_project",
    "Audit project against template standards and report violations with a score.",
    auditProjectSchema.shape,
    auditProjectHandler,
  );

  server.tool(
    "add_hook",
    "Add a specific quality-gate hook script to the project.",
    addHookSchema.shape,
    addHookHandler,
  );

  server.tool(
    "add_module",
    "Scaffold a new feature module following established patterns.",
    addModuleSchema.shape,
    addModuleHandler,
  );

  server.tool(
    "configure_mcp",
    "Generate .claude/settings.json with recommended MCP servers for active tags.",
    configureMcpSchema.shape,
    configureMcpHandler,
  );

  server.tool(
    "get_nfr_template",
    "Get NFR (Non-Functional Requirement) sections for specific tags.",
    getNfrTemplateSchema.shape,
    getNfrTemplateHandler,
  );

  server.tool(
    "get_design_reference",
    "Get design reference patterns (DDD, CQRS, GoF) on demand. These are NOT included in instruction files to save tokens — request them when you need architectural guidance.",
    getDesignReferenceSchema.shape,
    getDesignReferenceHandler,
  );

  server.tool(
    "convert_existing",
    "Analyze an existing codebase and generate a phased migration plan.",
    convertExistingSchema.shape,
    convertExistingHandler,
  );

  server.tool(
    "review_project",
    "Generate a structured code review checklist for active tags. Covers architecture, code quality, tests, and performance with per-issue guidance format.",
    reviewProjectSchema.shape,
    reviewProjectHandler,
  );

  server.tool(
    "setup_project",
    "RECOMMENDED FIRST STEP — generates production-grade AI assistant instruction files from 112 curated template blocks. Supports Claude, Cursor, Copilot, Windsurf, Cline, and Aider. Analyzes project, auto-detects tags from code/dependencies, creates forgecraft.yaml config, and adds engineering standards (SOLID, testing pyramid, architecture patterns, CI/CD, domain rules). Works for new and existing projects. Supports tier-based content filtering (core/recommended/optional).",
    setupProjectSchema.shape,
    setupProjectHandler,
  );

  server.tool(
    "refresh_project",
    "Re-analyze a project that already has forgecraft.yaml. Detects tag drift (e.g. new framework added), proposes adding/removing tags, shows content impact. Updates instruction files for all configured AI assistant targets. Preview changes before applying.",
    refreshProjectSchema.shape,
    refreshProjectHandler,
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
