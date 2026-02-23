import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { join } from "node:path";
import { DefaultMcpDiscoveryService } from "../../src/registry/mcp-discovery.js";
import type { McpServerRecommendation, Tag } from "../../src/shared/types.js";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "..", "templates");

describe("McpDiscoveryService", () => {
  describe("DefaultMcpDiscoveryService — local discovery", () => {
    let service: DefaultMcpDiscoveryService;

    beforeAll(() => {
      service = new DefaultMcpDiscoveryService(TEMPLATES_DIR);
    });

    it("should discover servers for UNIVERSAL tag", async () => {
      const results = await service.discoverServers(["UNIVERSAL"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should include forgecraft for UNIVERSAL tag", async () => {
      const results = await service.discoverServers(["UNIVERSAL"]);
      const names = results.map((r) => r.name);
      expect(names).toContain("forgecraft");
    });

    it("should include context7 for UNIVERSAL tag", async () => {
      const results = await service.discoverServers(["UNIVERSAL"]);
      const names = results.map((r) => r.name);
      expect(names).toContain("context7");
    });

    it("should return built-in source for local servers", async () => {
      const results = await service.discoverServers(["UNIVERSAL"]);
      for (const server of results) {
        expect(server.source).toBe("built-in");
      }
    });

    it("should discover chrome-devtools for WEB-REACT tag", async () => {
      const results = await service.discoverServers(["WEB-REACT"]);
      const names = results.map((r) => r.name);
      expect(names).toContain("chrome-devtools");
    });

    it("should discover unity-mcp for GAME tag", async () => {
      const results = await service.discoverServers(["GAME"]);
      const names = results.map((r) => r.name);
      expect(names).toContain("unity-mcp");
    });

    it("should discover docker for INFRA tag", async () => {
      const results = await service.discoverServers(["INFRA"]);
      const names = results.map((r) => r.name);
      expect(names).toContain("docker");
    });

    it("should merge servers across multiple tags without duplicates", async () => {
      const tags: Tag[] = ["UNIVERSAL", "WEB-REACT", "WEB-STATIC"];
      const results = await service.discoverServers(tags);
      const names = results.map((r) => r.name);

      // chrome-devtools appears in both WEB-REACT and WEB-STATIC but should be deduplicated
      const chromeCount = names.filter((n) => n === "chrome-devtools").length;
      expect(chromeCount).toBe(1);
    });

    it("should return servers for every supported tag", async () => {
      // All 24 tags now have mcp-servers.yaml — verify none returns empty
      const tagsToCheck: Tag[] = [
        "UNIVERSAL", "WEB-REACT", "API", "CLI", "LIBRARY",
        "GAME", "INFRA", "DATA-PIPELINE", "ML", "MOBILE",
        "ANALYTICS", "FINTECH", "HEALTHCARE", "WEB3",
        "REALTIME", "STATE-MACHINE", "SOCIAL", "WEB-STATIC",
        "HIPAA", "SOC2", "DATA-LINEAGE", "OBSERVABILITY-XRAY",
        "MEDALLION-ARCHITECTURE", "ZERO-TRUST",
      ];
      for (const tag of tagsToCheck) {
        const results = await service.discoverServers([tag]);
        expect(results.length, `Expected servers for tag ${tag}`).toBeGreaterThan(0);
      }
    });

    it("should populate all recommendation fields", async () => {
      const results = await service.discoverServers(["UNIVERSAL"]);
      const forgecraft = results.find((r) => r.name === "forgecraft");
      expect(forgecraft).toBeDefined();
      expect(forgecraft!.description).toBeTruthy();
      expect(forgecraft!.command).toBe("npx");
      expect(forgecraft!.args).toContain("-y");
      expect(forgecraft!.relevantTags).toContain("UNIVERSAL");
      expect(forgecraft!.category).toBe("scaffolding");
      expect(forgecraft!.url).toBeTruthy();
    });

    it("should include servers with env vars for DATA-PIPELINE", async () => {
      const results = await service.discoverServers(["DATA-PIPELINE"]);
      const postgres = results.find((r) => r.name === "postgres");
      expect(postgres).toBeDefined();
      expect(postgres!.env).toBeDefined();
      expect(postgres!.env!["POSTGRES_CONNECTION_STRING"]).toBeDefined();
    });
  });

  describe("DefaultMcpDiscoveryService — remote discovery", () => {
    let service: DefaultMcpDiscoveryService;

    beforeAll(() => {
      service = new DefaultMcpDiscoveryService(TEMPLATES_DIR);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should skip remote when includeRemote is false", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await service.discoverServers(["UNIVERSAL"], { includeRemote: false });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should skip remote when no registry URL is configured", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      // No URL configured and env var is empty
      await service.discoverServers(["UNIVERSAL"], {
        includeRemote: true,
        remoteRegistryUrl: undefined,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should merge remote servers with local, local taking priority", async () => {
      const remotePayload = {
        servers: [
          {
            name: "forgecraft",
            description: "Remote version (should be skipped)",
            command: "npx",
            args: ["-y", "forgecraft-mcp-remote"],
            tags: ["UNIVERSAL"],
            category: "scaffolding",
          },
          {
            name: "remote-only-server",
            description: "Only in remote",
            command: "npx",
            args: ["-y", "remote-only"],
            tags: ["UNIVERSAL"],
            category: "general",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(remotePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const results = await service.discoverServers(["UNIVERSAL"], {
        includeRemote: true,
        remoteRegistryUrl: "https://example.com/registry.json",
      });

      // forgecraft should come from local (built-in), not remote
      const forgecraft = results.find((r) => r.name === "forgecraft");
      expect(forgecraft!.source).toBe("built-in");
      expect(forgecraft!.args).not.toContain("forgecraft-mcp-remote");

      // remote-only-server should appear with remote source
      const remoteOnly = results.find((r) => r.name === "remote-only-server");
      expect(remoteOnly).toBeDefined();
      expect(remoteOnly!.source).toBe("remote");
    });

    it("should gracefully handle remote fetch failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Network error"),
      );

      const results = await service.discoverServers(["UNIVERSAL"], {
        includeRemote: true,
        remoteRegistryUrl: "https://example.com/broken.json",
      });

      // Should still return local servers
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.source === "built-in")).toBe(true);
    });

    it("should gracefully handle non-200 remote response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Not Found", { status: 404 }),
      );

      const results = await service.discoverServers(["UNIVERSAL"], {
        includeRemote: true,
        remoteRegistryUrl: "https://example.com/missing.json",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.source === "built-in")).toBe(true);
    });

    it("should filter remote servers by requested tags", async () => {
      const remotePayload = {
        servers: [
          {
            name: "api-specific",
            description: "API only",
            command: "npx",
            args: ["-y", "api-server"],
            tags: ["API"],
            category: "testing",
          },
          {
            name: "ml-specific",
            description: "ML only",
            command: "npx",
            args: ["-y", "ml-server"],
            tags: ["ML"],
            category: "ai-ml",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(remotePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const results = await service.discoverServers(["UNIVERSAL", "API"], {
        includeRemote: true,
        remoteRegistryUrl: "https://example.com/registry.json",
      });

      const names = results.map((r) => r.name);
      expect(names).toContain("api-specific");
      expect(names).not.toContain("ml-specific");
    });
  });
});
