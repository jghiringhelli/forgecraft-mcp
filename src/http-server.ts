#!/usr/bin/env node

/**
 * ForgeCraft — HTTP Server Entry Point.
 *
 * Exposes the ForgeCraft sentinel and tag classifier over Streamable HTTP
 * for hosted deployment (Smithery, Railway). Tools accept file CONTENTS
 * rather than local paths — the AI agent reads files locally and sends
 * them here; the server returns CLI command guidance.
 *
 * Also exposes POST /contribute/gate — receives gate proposals from
 * forgecraft clients and opens GitHub Issues on jghiringhelli/quality-gates.
 *
 * Local / CLI usage stays on stdio via the main entry point (index.ts).
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ALL_TAGS } from "./shared/types.js";
import { createContributeGateRouter } from "./http-server-contribute.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST ?? "0.0.0.0";

// ── Tool: hosted sentinel ─────────────────────────────────────────────

const hostedSentinelSchema = z.object({
  forgecraft_yaml_content: z
    .string()
    .optional()
    .describe("Contents of forgecraft.yaml if it exists in the project root."),
  claude_md_exists: z
    .boolean()
    .optional()
    .describe("Whether CLAUDE.md exists in the project root."),
  hooks_dir_exists: z
    .boolean()
    .optional()
    .describe("Whether .claude/hooks/ directory exists."),
  project_name: z
    .string()
    .optional()
    .describe("Project name for display purposes."),
});

/**
 * Cloud sentinel: accepts project state as arguments, returns CLI commands.
 * Mirror of the local sentinel but file-content-based instead of path-based.
 */
function hostedSentinelHandler(args: z.infer<typeof hostedSentinelSchema>): {
  content: Array<{ type: "text"; text: string }>;
} {
  const { forgecraft_yaml_content, claude_md_exists, hooks_dir_exists } = args;

  const hasConfig = Boolean(forgecraft_yaml_content);
  const hasClaudeMd = claude_md_exists ?? false;
  const hasHooks = hooks_dir_exists ?? false;

  const validTagList = ALL_TAGS.join(" | ");
  const lines: string[] = [];

  if (!hasConfig && !hasClaudeMd) {
    lines.push(
      "## Project has no engineering standards configured.",
      "",
      "Run in your project root:",
      "```bash",
      "npx forgecraft-mcp setup .",
      "```",
      "",
      "This analyzes your project, infers tags from spec files, and generates",
      "CLAUDE.md, .github/copilot-instructions.md, hooks, and skills.",
      "",
      `Available tags (pass only these to --tags): ${validTagList}`,
      "",
      "To set tags explicitly:",
      "```bash",
      "npx forgecraft-mcp setup . --tags UNIVERSAL API",
      "```",
    );
  } else if (hasConfig && !hasHooks) {
    lines.push(
      "## forgecraft.yaml found but hooks are missing.",
      "",
      "Run in your project root:",
      "```bash",
      "npx forgecraft-mcp scaffold .",
      "```",
    );
  } else {
    const configStatus = hasConfig ? "forgecraft.yaml ✓" : "no forgecraft.yaml";
    const mdStatus = hasClaudeMd ? "CLAUDE.md ✓" : "no CLAUDE.md";
    const hooksStatus = hasHooks ? ".claude/hooks ✓" : "no hooks";

    lines.push(
      `## Project status: ${configStatus} | ${mdStatus} | ${hooksStatus}`,
      "",
      "Available commands (run in your project root):",
      "```bash",
      "npx forgecraft-mcp refresh .      # re-sync after project changes",
      "npx forgecraft-mcp audit .        # score compliance 0-100",
      "npx forgecraft-mcp verify .       # run tests + GS property scores",
      "```",
    );
  }

  lines.push(
    "",
    "---",
    "ForgeCraft runs locally via npx — your project files never leave your machine.",
    "Docs: https://github.com/jghiringhelli/forgecraft-mcp",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Tool: list tags ───────────────────────────────────────────────────

function listTagsHandler(): { content: Array<{ type: "text"; text: string }> } {
  const rows = ALL_TAGS.map((tag) => `- \`${tag}\``).join("\n");
  return {
    content: [
      {
        type: "text",
        text: [
          `## ForgeCraft Tags (${ALL_TAGS.length} available)`,
          "",
          rows,
          "",
          "Use `npx forgecraft-mcp setup . --tags <TAG1> <TAG2>` to set tags explicitly,",
          "or let `setup` auto-detect them from your codebase.",
        ].join("\n"),
      },
    ],
  };
}

// ── MCP Server factory ────────────────────────────────────────────────

/**
 * Create a fresh MCP server instance with all hosted tools, prompts, and
 * resources registered. Called per-request in stateless mode.
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: "forgecraft",
    version: "1.0.0",
  });

  // ── Tools ──────────────────────────────────────────────────────────

  server.tool(
    "forgecraft",
    "Diagnose ForgeCraft project state and return CLI commands to run locally. Pass forgecraft.yaml contents and artifact presence flags.",
    hostedSentinelSchema.shape,
    { readOnlyHint: true, openWorldHint: false },
    (args: z.infer<typeof hostedSentinelSchema>) => hostedSentinelHandler(args),
  );

  server.tool(
    "list_tags",
    "Return all ForgeCraft classification tags. Use these to pick the right tags for npx forgecraft-mcp setup.",
    {},
    { readOnlyHint: true, openWorldHint: false },
    () => listTagsHandler(),
  );

  // ── Prompts ────────────────────────────────────────────────────────

  server.prompt(
    "setup-project",
    "Scaffold ForgeCraft engineering standards for a project. Checks current state then runs setup.",
    {
      project_dir: z
        .string()
        .describe("Absolute path to the project root directory."),
    },
    ({ project_dir }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Set up ForgeCraft engineering standards for the project at: ${project_dir}`,
              "",
              "Steps:",
              "1. Call the `forgecraft` tool with the artifact presence flags for this project.",
              "2. Follow its recommendations: run the suggested npx forgecraft-mcp commands locally.",
              "3. Once setup is complete, remove ForgeCraft from your MCP servers to save tokens.",
              "",
              "Tip: After running `npx forgecraft-mcp setup .`, your project will have a CLAUDE.md",
              "constitution, commit hooks, and a forgecraft.yaml config — all auto-tailored to your stack.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  // ── Resources ──────────────────────────────────────────────────────

  server.resource(
    "tag-taxonomy",
    "forgecraft://tags",
    {
      description:
        "Complete ForgeCraft tag taxonomy. Use these tags to configure stack-specific engineering standards.",
      mimeType: "text/plain",
    },
    () => ({
      contents: [
        {
          uri: "forgecraft://tags",
          mimeType: "text/plain",
          text: [
            "# ForgeCraft Tag Taxonomy",
            "",
            "Use these tags with: npx forgecraft-mcp setup . --tags <TAG1> <TAG2>",
            "",
            ...ALL_TAGS.map((tag) => `- ${tag}`),
            "",
            "Stack tags (UNIVERSAL is always included):",
            "  UNIVERSAL  — core standards for all projects",
            "  API        — REST/GraphQL API standards",
            "  WEB-REACT  — React/Next.js frontend standards",
            "  GAME       — game development standards",
            "  FINTECH    — financial/compliance standards",
            "  ML         — machine learning pipeline standards",
            "  MOBILE     — React Native / mobile standards",
            "  CLI        — command-line tool standards",
            "  LIBRARY    — npm/pip package standards",
            "  WEB3       — smart contract / blockchain standards",
          ].join("\n"),
        },
      ],
    }),
  );

  return server;
}

// ── Express app ───────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", transport: "streamable-http" });
});

// ── Gate contribution endpoint (extracted to http-server-contribute.ts) ──
app.use(createContributeGateRouter());

/** Stateless Streamable HTTP — new transport per request, no session state. */
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createServer();
  await server.connect(transport);

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createServer();
  await server.connect(transport);

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode" });
});

app.listen(PORT, HOST, () => {
  console.log(`ForgeCraft MCP HTTP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`Health: http://${HOST}:${PORT}/health`);
});
