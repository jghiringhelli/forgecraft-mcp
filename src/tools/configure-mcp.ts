/**
 * configure_mcp tool handler.
 *
 * Generates .claude/settings.json with recommended MCP servers based on tags.
 * Uses the McpDiscoveryService to load curated servers from YAML templates
 * and optionally fetch from a remote registry at setup time.
 */

import { z } from "zod";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag, McpServerConfig, McpDiscoveryOptions } from "../shared/types.js";
import type { McpDiscoveryService } from "../registry/mcp-discovery.js";
import { DefaultMcpDiscoveryService } from "../registry/mcp-discovery.js";

// ── Schema ───────────────────────────────────────────────────────────

export const configureMcpSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Active project tags."),
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
  custom_servers: z
    .record(
      z.object({
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string()).optional(),
      }),
    )
    .optional()
    .describe("Custom MCP servers to add alongside recommended ones."),
  auto_approve_tools: z
    .boolean()
    .default(true)
    .describe(
      "If true, adds permissions.allow entries for all configured MCP servers " +
      "so tool invocations are auto-approved without manual confirmation.",
    ),
  include_remote: z
    .boolean()
    .default(false)
    .describe(
      "If true, also queries a remote MCP server registry for additional recommendations. " +
      "Requires FORGECRAFT_MCP_REGISTRY_URL env var or remote_registry_url parameter.",
    ),
  remote_registry_url: z
    .string()
    .optional()
    .describe("Override URL for the remote MCP server registry."),
});

// ── Handler ──────────────────────────────────────────────────────────

/** Injected discovery service for testing. Defaults to DefaultMcpDiscoveryService. */
let injectedDiscoveryService: McpDiscoveryService | undefined;

/**
 * Inject a custom discovery service (for testing).
 *
 * @param service - Discovery service to use, or undefined to reset to default
 */
export function setDiscoveryService(service: McpDiscoveryService | undefined): void {
  injectedDiscoveryService = service;
}

/**
 * Generate .claude/settings.json with discovered MCP servers for active tags.
 *
 * @param args - Validated tool input
 * @returns MCP tool response with configuration summary
 */
export async function configureMcpHandler(
  args: z.infer<typeof configureMcpSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags = args.tags as Tag[];
  const discovery = injectedDiscoveryService ?? new DefaultMcpDiscoveryService();

  // ── Discover servers ─────────────────────────────────────────────

  const discoveryOptions: McpDiscoveryOptions = {
    includeRemote: args.include_remote,
    remoteRegistryUrl: args.remote_registry_url,
  };

  const recommendations = await discovery.discoverServers(tags, discoveryOptions);

  // Convert recommendations to server config map
  const servers: Record<string, McpServerConfig & { source?: string; description?: string }> = {};

  for (const rec of recommendations) {
    servers[rec.name] = {
      command: rec.command,
      args: rec.args,
      ...(rec.env ? { env: rec.env } : {}),
      source: rec.source,
      description: rec.description,
    };
  }

  // Add custom servers (user-provided, highest priority)
  if (args.custom_servers) {
    for (const [name, config] of Object.entries(args.custom_servers)) {
      servers[name] = { ...config, source: "custom" };
    }
  }

  // ── Build settings.json ──────────────────────────────────────────

  const mcpConfig: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
  for (const [name, config] of Object.entries(servers)) {
    mcpConfig[name] = {
      command: config.command,
      args: config.args,
      ...(config.env ? { env: config.env } : {}),
    };
  }

  // Build permissions.allow entries for auto-approval
  const permissionRules: string[] = [];
  if (args.auto_approve_tools) {
    for (const serverName of Object.keys(servers)) {
      permissionRules.push(`mcp__${serverName}__*`);
    }
  }

  const settings: Record<string, unknown> = { mcpServers: mcpConfig };
  if (permissionRules.length > 0) {
    settings["permissions"] = { allow: permissionRules };
  }

  // ── Handle existing settings ─────────────────────────────────────

  const settingsDir = join(args.project_dir, ".claude");
  const settingsPath = join(settingsDir, "settings.json");

  let merged: Record<string, unknown> = settings;
  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      const existingPerms = (existing["permissions"] as Record<string, unknown>) ?? {};
      const existingAllow = (existingPerms["allow"] as string[]) ?? [];

      // Merge permissions: deduplicate existing + new rules
      const mergedAllow = [...new Set([...existingAllow, ...permissionRules])];

      merged = {
        ...existing,
        permissions: {
          ...existingPerms,
          allow: mergedAllow,
        },
        mcpServers: {
          ...(existing["mcpServers"] as Record<string, unknown> ?? {}),
          ...mcpConfig,
        },
      };
    } catch {
      // Existing file unparseable, overwrite
    }
  }

  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  // ── Build response ───────────────────────────────────────────────

  const serverNames = Object.keys(servers);
  const bySource = groupBySource(servers);

  return {
    content: [
      {
        type: "text",
        text:
          `MCP configuration written to \`.claude/settings.json\`.\n\n` +
          `**Servers configured (${serverNames.length}):**\n` +
          formatServerList(servers) +
          (bySource["remote"] && bySource["remote"] > 0
            ? `\n\n📡 ${bySource["remote"]} server(s) discovered from remote registry.`
            : "") +
          (permissionRules.length > 0
            ? `\n\n**Auto-approved (${permissionRules.length}):**\n` +
              permissionRules.map((r) => `- \`${r}\``).join("\n")
            : "") +
          `\n\n⚠️ Restart required to pick up MCP server changes.`,
      },
    ],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Format the server list for display, grouped by source.
 *
 * @param servers - Server config map with source metadata
 * @returns Markdown-formatted server list
 */
function formatServerList(
  servers: Record<string, McpServerConfig & { source?: string; description?: string }>,
): string {
  return Object.entries(servers)
    .map(([name, config]) => {
      const sourceLabel = config.source ? ` [${config.source}]` : "";
      const descLabel = config.description ? ` — ${config.description}` : "";
      return `- \`${name}\`${sourceLabel}: \`${config.command} ${config.args.join(" ")}\`${descLabel}`;
    })
    .join("\n");
}

/**
 * Count servers by source.
 *
 * @param servers - Server config map with source metadata
 * @returns Counts per source type
 */
function groupBySource(
  servers: Record<string, { source?: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const config of Object.values(servers)) {
    const source = config.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}
