import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { analyzeProject, analyzeDescription } from "../../src/analyzers/package-json.js";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

function createFixtureProject(name: string, packageJson: Record<string, unknown>): string {
  const dir = join(FIXTURES_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(packageJson, null, 2));
  return dir;
}

describe("package-json analyzer", () => {
  describe("analyzeProject", () => {
    it("should detect React from dependencies", () => {
      const dir = createFixtureProject("react-app", {
        dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
      });

      const results = analyzeProject(dir);
      const reactDetection = results.find((d) => d.tag === "WEB-REACT");

      expect(reactDetection).toBeDefined();
      expect(reactDetection!.confidence).toBeGreaterThanOrEqual(0.6);

      rmSync(dir, { recursive: true });
    });

    it("should detect Express as API", () => {
      const dir = createFixtureProject("express-app", {
        dependencies: { express: "^4.18.0" },
      });

      const results = analyzeProject(dir);
      const apiDetection = results.find((d) => d.tag === "API");

      expect(apiDetection).toBeDefined();
      expect(apiDetection!.confidence).toBeGreaterThanOrEqual(0.6);

      rmSync(dir, { recursive: true });
    });

    it("should detect CLI from commander dependency", () => {
      const dir = createFixtureProject("cli-tool", {
        dependencies: { commander: "^11.0.0" },
      });

      const results = analyzeProject(dir);
      const cliDetection = results.find((d) => d.tag === "CLI");

      expect(cliDetection).toBeDefined();

      rmSync(dir, { recursive: true });
    });

    it("should detect CLI from bin entry", () => {
      const dir = createFixtureProject("bin-tool", {
        bin: { "my-tool": "./dist/index.js" },
      });

      const results = analyzeProject(dir);
      const cliDetection = results.find((d) => d.tag === "CLI");

      expect(cliDetection).toBeDefined();
      expect(cliDetection!.confidence).toBe(0.8);

      rmSync(dir, { recursive: true });
    });

    it("should not detect MCP SDK as API", () => {
      const dir = createFixtureProject("mcp-server", {
        dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" },
      });

      const results = analyzeProject(dir);
      const apiDetection = results.find((d) => d.tag === "API");

      // MCP SDK is not an API server indicator — removed from API patterns
      expect(apiDetection).toBeUndefined();

      rmSync(dir, { recursive: true });
    });

    it("should not detect INFRA from Dockerfile alone", () => {
      const dir = join(FIXTURES_DIR, "docker-only");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "Dockerfile"), "FROM node:18\n");

      const results = analyzeProject(dir);
      const infraDetection = results.find((d) => d.tag === "INFRA");

      // Docker alone has confidence 0.45, below the 0.6 threshold
      if (infraDetection) {
        expect(infraDetection.confidence).toBeLessThan(0.6);
      }

      rmSync(dir, { recursive: true });
    });

    it("should not detect API from bare pyproject.toml", () => {
      const dir = join(FIXTURES_DIR, "bare-python");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pyproject.toml"), '[project]\nname = "my-tool"\n');

      const results = analyzeProject(dir);
      const apiDetection = results.find((d) => d.tag === "API");

      // pyproject.toml alone should not trigger API — no web framework inside
      expect(apiDetection).toBeUndefined();

      rmSync(dir, { recursive: true });
    });

    it("should return empty for project without package.json", () => {
      const dir = join(FIXTURES_DIR, "empty-project");
      mkdirSync(dir, { recursive: true });

      const results = analyzeProject(dir);
      expect(results).toEqual([]);

      rmSync(dir, { recursive: true });
    });

    it("should deduplicate detections keeping highest confidence", () => {
      const dir = createFixtureProject("multi-api", {
        dependencies: { express: "^4.0.0", fastify: "^4.0.0" },
      });

      const results = analyzeProject(dir);
      const apiDetections = results.filter((d) => d.tag === "API");

      // Should only have one API detection (deduplicated)
      expect(apiDetections).toHaveLength(1);

      rmSync(dir, { recursive: true });
    });
  });

  describe("analyzeDescription", () => {
    it("should detect React from description", () => {
      const results = analyzeDescription("A React dashboard with real-time charts");
      expect(results.some((d) => d.tag === "WEB-REACT")).toBe(true);
    });

    it("should detect multiple tags", () => {
      const results = analyzeDescription(
        "A blockchain-based social network with real-time messaging",
      );
      expect(results.some((d) => d.tag === "WEB3")).toBe(true);
      expect(results.some((d) => d.tag === "SOCIAL")).toBe(true);
      expect(results.some((d) => d.tag === "REALTIME")).toBe(true);
    });

    it("should detect API from backend keywords", () => {
      const results = analyzeDescription("REST API backend server");
      expect(results.some((d) => d.tag === "API")).toBe(true);
    });

    it("should return empty for generic description", () => {
      const results = analyzeDescription("A simple utility");
      expect(results).toEqual([]);
    });

    it("should detect healthcare from HIPAA keywords", () => {
      const results = analyzeDescription("HIPAA-compliant patient data system");
      expect(results.some((d) => d.tag === "HEALTHCARE")).toBe(true);
    });
  });
});
