/**
 * MCP server discovery and configuration types.
 */

import type { Tag, ContentTier } from "./project.js";

/** MCP server configuration for .claude/settings.json. */
export interface McpServerConfig {
  readonly command: string;
  readonly args: string[];
  readonly env?: Record<string, string>;
}

/** Category grouping for MCP server recommendations. */
export type McpServerCategory =
  | "scaffolding"
  | "code-search"
  | "testing"
  | "debugging"
  | "devtools"
  | "deployment"
  | "database"
  | "documentation"
  | "game-engine"
  | "ai-ml"
  | "monitoring"
  | "general";

/** An MCP server entry in a curated registry YAML file. */
export interface McpServerEntry {
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: string[];
  readonly env?: Record<string, string>;
  readonly tags: Tag[];
  readonly category: McpServerCategory;
  readonly url?: string;
  /** Content tier for token budget control. Defaults to "recommended" if omitted. */
  readonly tier?: ContentTier;
}

/** Shape of the mcp-servers.yaml template file. */
export interface McpServersTemplate {
  readonly tag: Tag;
  readonly section: "mcp-servers";
  readonly servers: McpServerEntry[];
}

/** Source of a discovered MCP server recommendation. */
export type McpServerSource = "built-in" | "community" | "remote";

/** A recommended MCP server with discovery metadata. */
export interface McpServerRecommendation {
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: string[];
  readonly env?: Record<string, string>;
  readonly relevantTags: Tag[];
  readonly category: McpServerCategory;
  readonly url?: string;
  readonly source: McpServerSource;
  /** Content tier for token budget control. Defaults to "recommended" if omitted. */
  readonly tier?: ContentTier;
}

/** Options for controlling MCP server discovery behavior. */
export interface McpDiscoveryOptions {
  /** Whether to also fetch from a remote registry. Defaults to false. */
  readonly includeRemote?: boolean;
  /** Override the default remote registry URL. */
  readonly remoteRegistryUrl?: string;
  /** Request timeout in milliseconds for remote fetches. Defaults to 5000. */
  readonly remoteTimeoutMs?: number;
}
