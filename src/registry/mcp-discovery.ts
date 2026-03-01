/**
 * MCP Server Discovery Service.
 *
 * Discovers recommended MCP servers for a set of project tags by:
 * 1. Loading curated entries from mcp-servers.yaml template files (built-in + community).
 * 2. Optionally fetching from a remote registry URL for dynamic recommendations.
 *
 * Results are deduplicated by server name, with local (built-in/community)
 * entries taking priority over remote ones.
 */

import { createLogger } from "../shared/logger/index.js";
import { DiscoveryError } from "../shared/errors/index.js";
import { loadAllTemplatesWithExtras } from "./loader.js";
import type {
  Tag,
  McpServerRecommendation,
  McpDiscoveryOptions,
  McpServerEntry,
  TagTemplateSet,
} from "../shared/types.js";

const logger = createLogger("registry/mcp-discovery");

// ── Interface ────────────────────────────────────────────────────────

/**
 * Contract for MCP server discovery.
 * Implementations resolve a set of tags into recommended MCP servers.
 */
export interface McpDiscoveryService {
  /**
   * Discover recommended MCP servers for the given tags.
   *
   * @param tags - Active project classification tags
   * @param options - Optional discovery configuration
   * @returns Deduplicated list of server recommendations
   */
  discoverServers(
    tags: Tag[],
    options?: McpDiscoveryOptions,
  ): Promise<McpServerRecommendation[]>;
}

// ── Constants ────────────────────────────────────────────────────────

/** Default remote registry URL. Configurable via FORGECRAFT_MCP_REGISTRY_URL. */
const DEFAULT_REMOTE_REGISTRY_URL =
  process.env["FORGECRAFT_MCP_REGISTRY_URL"] ?? "";

/** Default timeout for remote registry fetches in milliseconds. */
const DEFAULT_REMOTE_TIMEOUT_MS = 5_000;

// ── Implementation ───────────────────────────────────────────────────

/**
 * Default MCP discovery service.
 *
 * Loads curated servers from YAML templates, optionally augments
 * with servers from a remote JSON registry.
 */
export class DefaultMcpDiscoveryService implements McpDiscoveryService {
  private readonly templatesDirOverride?: string;
  private readonly extraDirs?: string[];

  /**
   * @param templatesDirOverride - Override built-in templates directory (testing)
   * @param extraDirs - Additional community template directories
   */
  constructor(templatesDirOverride?: string, extraDirs?: string[]) {
    this.templatesDirOverride = templatesDirOverride;
    this.extraDirs = extraDirs;
  }

  /**
   * Discover MCP servers for the given tags.
   *
   * @param tags - Active project classification tags
   * @param options - Discovery options
   * @returns Deduplicated recommendations sorted by relevance
   */
  async discoverServers(
    tags: Tag[],
    options?: McpDiscoveryOptions,
  ): Promise<McpServerRecommendation[]> {
    const localServers = this.loadLocalServers(tags);

    logger.info("Loaded local MCP server recommendations", {
      count: localServers.length,
      tags,
    });

    let remoteServers: McpServerRecommendation[] = [];

    if (options?.includeRemote) {
      const registryUrl =
        options.remoteRegistryUrl ?? DEFAULT_REMOTE_REGISTRY_URL;

      if (registryUrl) {
        remoteServers = await this.fetchRemoteServers(
          tags,
          registryUrl,
          options.remoteTimeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS,
        );

        logger.info("Fetched remote MCP server recommendations", {
          count: remoteServers.length,
          url: registryUrl,
        });
      } else {
        logger.warn(
          "Remote discovery requested but no registry URL configured. " +
            "Set FORGECRAFT_MCP_REGISTRY_URL or pass remoteRegistryUrl.",
        );
      }
    }

    return this.deduplicateServers(localServers, remoteServers);
  }

  /**
   * Load MCP server entries from local YAML templates for the given tags.
   * Collects from all matching tag template sets.
   */
  private loadLocalServers(tags: Tag[]): McpServerRecommendation[] {
    const templates = loadAllTemplatesWithExtras(
      this.templatesDirOverride,
      this.extraDirs,
    );

    const seen = new Set<string>();
    const results: McpServerRecommendation[] = [];

    for (const tag of tags) {
      const templateSet: TagTemplateSet | undefined = templates.get(tag);
      if (!templateSet?.mcpServers) {
        continue;
      }

      for (const entry of templateSet.mcpServers.servers) {
        if (seen.has(entry.name)) {
          continue;
        }
        seen.add(entry.name);
        results.push(entryToRecommendation(entry, "built-in"));
      }
    }

    return results;
  }

  /**
   * Fetch MCP server entries from a remote JSON registry.
   *
   * Expected remote format:
   * ```json
   * {
   *   "servers": [
   *     {
   *       "name": "some-server",
   *       "description": "...",
   *       "command": "npx",
   *       "args": ["-y", "some-package"],
   *       "tags": ["API", "UNIVERSAL"],
   *       "category": "testing",
   *       "url": "https://..."
   *     }
   *   ]
   * }
   * ```
   *
   * Only servers whose tags overlap with the requested tags are returned.
   */
  private async fetchRemoteServers(
    tags: Tag[],
    registryUrl: string,
    timeoutMs: number,
  ): Promise<McpServerRecommendation[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(registryUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new DiscoveryError(
          `Remote registry returned HTTP ${response.status}`,
          registryUrl,
        );
      }

      const data = (await response.json()) as {
        servers?: McpServerEntry[];
      };

      if (!Array.isArray(data.servers)) {
        throw new DiscoveryError(
          "Remote registry response missing 'servers' array",
          registryUrl,
        );
      }

      const tagSet = new Set<string>(tags);

      return data.servers
        .filter((entry) => entry.tags.some((t) => tagSet.has(t)))
        .map((entry) => entryToRecommendation(entry, "remote"));
    } catch (error) {
      if (error instanceof DiscoveryError) {
        logger.warn("Remote MCP registry error", {
          url: registryUrl,
          error: error.message,
        });
      } else {
        const message =
          error instanceof Error ? error.message : String(error);
        logger.warn("Failed to fetch remote MCP registry", {
          url: registryUrl,
          error: message,
        });
      }
      // Remote failures are non-fatal — return empty and rely on local
      return [];
    }
  }

  /**
   * Deduplicate server lists. Local entries take priority over remote.
   * Sorts by: number of matching tags (desc), then alphabetically.
   */
  private deduplicateServers(
    local: McpServerRecommendation[],
    remote: McpServerRecommendation[],
  ): McpServerRecommendation[] {
    const seen = new Set<string>();
    const merged: McpServerRecommendation[] = [];

    // Local first (higher priority)
    for (const server of local) {
      if (!seen.has(server.name)) {
        seen.add(server.name);
        merged.push(server);
      }
    }

    // Remote fills gaps
    for (const server of remote) {
      if (!seen.has(server.name)) {
        seen.add(server.name);
        merged.push(server);
      }
    }

    return merged.sort((a, b) => {
      const tagDiff = b.relevantTags.length - a.relevantTags.length;
      if (tagDiff !== 0) return tagDiff;
      return a.name.localeCompare(b.name);
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Convert a raw McpServerEntry to a McpServerRecommendation.
 *
 * @param entry - Raw entry from YAML or remote
 * @param source - Where this entry was discovered
 * @returns Normalized recommendation
 */
function entryToRecommendation(
  entry: McpServerEntry,
  source: McpServerRecommendation["source"],
): McpServerRecommendation {
  return {
    name: entry.name,
    description: entry.description,
    command: entry.command,
    args: entry.args,
    env: entry.env,
    relevantTags: entry.tags,
    category: entry.category,
    url: entry.url,
    source,
    tier: entry.tier,
  };
}
