#!/usr/bin/env node

/**
 * Forgekit MCP Server — Entry Point.
 *
 * Registers all tools and starts the MCP server over stdio transport.
 * This is the binary entry point run via `npx @forgekit/mcp-server`.
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
  generateClaudeMdSchema,
  generateClaudeMdHandler,
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
  logger.info("Starting Forgekit MCP server");

  const server = new McpServer({
    name: "forgekit",
    version: "0.1.0",
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
    "Generate full project structure (CLAUDE.md, Status.md, hooks, folders) from tags.",
    scaffoldProjectSchema.shape,
    scaffoldProjectHandler,
  );

  server.tool(
    "generate_claude_md",
    "Generate or regenerate CLAUDE.md for given tags.",
    generateClaudeMdSchema.shape,
    generateClaudeMdHandler,
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
    "RECOMMENDED FIRST STEP. Analyzes project, auto-detects tags from code/dependencies, creates forgekit.yaml config, and generates a tailored CLAUDE.md with engineering standards. Call this when starting a new project, onboarding an existing codebase, or when no forgekit.yaml exists. Works for new and existing projects. Supports tier-based content filtering (core/recommended/optional).",
    setupProjectSchema.shape,
    setupProjectHandler,
  );

  server.tool(
    "refresh_project",
    "Re-analyze a project that already has forgekit.yaml. Detects tag drift (e.g. new framework added), proposes adding/removing tags, shows content impact. Use when project scope changes, new dependencies are added, or to upgrade content tier. Preview changes before applying.",
    refreshProjectSchema.shape,
    refreshProjectHandler,
  );

  // ── Start Stdio Transport ────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Forgekit MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal server error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
