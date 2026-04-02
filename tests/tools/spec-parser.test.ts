/**
 * Tests for spec-parser.ts
 *
 * Covers: structured heading extraction, freeform keyword fallback,
 * tag inference from text, OpenAPI-style spec, empty input.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseSpec,
  inferTagsFromDirectory,
  findRichestSpecFile,
  inferSensitiveData,
  scanSourceForSensitivePatterns,
} from "../../src/tools/spec-parser.js";
import { detectToolSampleConflation } from "../../src/tools/spec-parser-tags.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-spec-parser-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("parseSpec", () => {
  describe("structured markdown spec", () => {
    const STRUCTURED_SPEC = `# Payment Gateway SDK

## Problem
Merchants struggle to integrate multiple payment providers using incompatible APIs.
The SDK solves this by providing a unified interface.

## Users
- Backend developers at e-commerce companies
- Payment integration engineers
- Platform teams at SaaS companies

## Goals
- 99.9% uptime SLA
- Sub-100ms p99 latency
- Support 10+ payment providers

## Components
- Gateway abstraction layer
- Provider adapter registry
- Retry and circuit-breaker middleware

## External Systems
- Stripe payment API
- PayPal REST API
- Braintree gateway
`;

    it("extracts project name from H1", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.name).toBe("Payment Gateway SDK");
    });

    it("extracts problem from ## Problem heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.problem).toContain("Merchants struggle");
    });

    it("extracts users as array from ## Users heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.users.length).toBeGreaterThan(0);
      expect(
        result.users.some((u) => u.toLowerCase().includes("developer")),
      ).toBe(true);
    });

    it("extracts success criteria from ## Goals heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.successCriteria.length).toBeGreaterThan(0);
    });

    it("extracts components from ## Components heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.components.length).toBeGreaterThan(0);
      expect(
        result.components.some((c) => c.toLowerCase().includes("gateway")),
      ).toBe(true);
    });

    it("extracts external systems from ## External Systems heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.externalSystems.length).toBeGreaterThan(0);
      expect(
        result.externalSystems.some((s) => s.toLowerCase().includes("stripe")),
      ).toBe(true);
    });

    it("infers FINTECH tag from payment keywords", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.inferredTags).toContain("FINTECH");
    });

    it("infers LIBRARY tag from SDK keyword", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.inferredTags).toContain("LIBRARY");
    });

    it("always includes UNIVERSAL tag", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.inferredTags).toContain("UNIVERSAL");
    });
  });

  describe("freeform prose spec (keyword fallback)", () => {
    const PROSE_SPEC = `
      This tool helps developers and teams manage blockchain wallet integrations.
      The main challenge is that DeFi protocols use incompatible token interfaces.
      The goal is to measure success by adoption rate and transaction throughput.
      Users include Web3 developers and DeFi protocol teams.
      The service includes a wallet adapter module and a token registry database.
      External: Ethereum JSON-RPC API and IPFS gateway integration.
    `;

    it("falls back to keyword extraction for problem", () => {
      const result = parseSpec(PROSE_SPEC);
      expect(result.problem.length).toBeGreaterThan(0);
    });

    it("extracts user sentences via keyword fallback", () => {
      const result = parseSpec(PROSE_SPEC);
      expect(result.users.length).toBeGreaterThan(0);
    });

    it("extracts success criteria sentences via keyword fallback", () => {
      const result = parseSpec(PROSE_SPEC);
      expect(
        result.successCriteria.some(
          (s) =>
            s.toLowerCase().includes("success") ||
            s.toLowerCase().includes("measure"),
        ),
      ).toBe(true);
    });

    it("does NOT infer WEB3 tag from prose blockchain/DeFi/wallet mentions", () => {
      const result = parseSpec(PROSE_SPEC);
      expect(result.inferredTags).not.toContain("WEB3");
    });
  });

  describe("OpenAPI-style spec", () => {
    const OPENAPI_SPEC = `# User Management API

This REST API provides HTTP endpoints for managing users. It exposes
GraphQL and REST endpoint routes for creating, updating, and deleting users.

## Overview
The API serves frontend applications and third-party integrations.

## Components
- AuthController
- UserRepository
- SessionCache
`;

    it("infers API tag from REST/endpoint/HTTP keywords", () => {
      const result = parseSpec(OPENAPI_SPEC);
      expect(result.inferredTags).toContain("API");
    });

    it("extracts name from H1", () => {
      const result = parseSpec(OPENAPI_SPEC);
      expect(result.name).toBe("User Management API");
    });
  });

  describe("WEB3 tag requires code-level signals, not prose", () => {
    it("does NOT infer WEB3 from 'smart contract' as a concept in prose", () => {
      const result = parseSpec(
        "A smart contract platform for DeFi token swaps.",
      );
      expect(result.inferredTags).not.toContain("WEB3");
    });

    it("does NOT infer WEB3 from crypto/wallet/blockchain as narrative prose", () => {
      const result = parseSpec(
        "Manage your crypto wallet and blockchain assets.",
      );
      expect(result.inferredTags).not.toContain("WEB3");
    });

    it("infers WEB3 from Solidity pragma (code-level signal)", () => {
      const result = parseSpec("pragma solidity ^0.8.0;\ncontract Token { }");
      expect(result.inferredTags).toContain("WEB3");
    });

    it("infers WEB3 from ethers dependency reference (code-level signal)", () => {
      const result = parseSpec(
        'import { ethers } from "ethers";\nconst provider = new ethers.JsonRpcProvider();',
      );
      expect(result.inferredTags).toContain("WEB3");
    });
  });

  describe("empty string input", () => {
    it("returns default SpecSummary with empty fields", () => {
      const result = parseSpec("");
      expect(result.name).toBe("[Project Name]");
      expect(result.problem).toBe("");
      expect(result.users).toHaveLength(0);
      expect(result.successCriteria).toHaveLength(0);
      expect(result.components).toHaveLength(0);
      expect(result.externalSystems).toHaveLength(0);
      expect(result.ambiguities).toHaveLength(0);
    });

    it("still includes UNIVERSAL tag", () => {
      const result = parseSpec("");
      expect(result.inferredTags).toContain("UNIVERSAL");
      expect(result.inferredTags).toHaveLength(1);
    });

    it("uses hintName when provided with empty text", () => {
      const result = parseSpec("", "my-custom-project");
      expect(result.name).toBe("my-custom-project");
    });
  });

  describe("hintName fallback", () => {
    it("uses hintName when no H1 present", () => {
      const result = parseSpec("Some prose without a heading.", "my-project");
      expect(result.name).toBe("my-project");
    });

    it("prefers H1 over hintName", () => {
      const result = parseSpec("# Real Name\nSome content.", "hint-name");
      expect(result.name).toBe("Real Name");
    });
  });

  describe("ambiguity detection — deployment target", () => {
    it("detects deployment_target ambiguity when spec mentions 'system' without deployment tags", () => {
      const result = parseSpec(
        "# Storycraft\n\nA narrative design system for interactive fiction authors.\n\n" +
          "## Problem\nAuthors need a unified workflow for designing branching narratives.",
      );
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "deployment_target",
      );
      expect(ambiguity).toBeDefined();
    });

    it("deployment_target ambiguity has CLI, API, and LIBRARY interpretations", () => {
      const result = parseSpec(
        "An event-driven platform for orchestrating data workflows.",
      );
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "deployment_target",
      );
      expect(ambiguity).toBeDefined();
      expect(ambiguity!.interpretations.map((i) => i.label)).toEqual([
        "A",
        "B",
        "C",
      ]);
      expect(
        ambiguity!.interpretations.some((i) => i.description.includes("CLI")),
      ).toBe(true);
      expect(
        ambiguity!.interpretations.some((i) => i.description.includes("API")),
      ).toBe(true);
      expect(
        ambiguity!.interpretations.some((i) =>
          i.description.includes("LIBRARY"),
        ),
      ).toBe(true);
    });

    it("does NOT report deployment_target ambiguity when CLI tag is inferred from code signals", () => {
      const result = parseSpec(
        "A system for managing deployments using yargs.",
      );
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "deployment_target",
      );
      expect(ambiguity).toBeUndefined();
    });

    it("does NOT report deployment_target ambiguity when API tag is inferred", () => {
      const result = parseSpec(
        "A REST API system that exposes HTTP endpoints for user management.",
      );
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "deployment_target",
      );
      expect(ambiguity).toBeUndefined();
    });

    it("returns empty ambiguities for a spec with clear deployment signals", () => {
      const result = parseSpec(
        "# Payment Library\n\nAn npm package for payment integration.",
      );
      expect(result.ambiguities).toHaveLength(0);
    });
  });
});

describe("inferTagsFromDirectory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("always includes UNIVERSAL", async () => {
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("UNIVERSAL");
  });

  it("infers CLI tag from package.json bin field", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "my-cli", bin: { "my-cli": "dist/index.js" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("CLI");
  });

  it("infers CLI tag from commander dependency", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { commander: "^12.0.0" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("CLI");
  });

  it("infers API tag from express dependency", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("API");
  });

  it("infers API tag from src/routes directory", async () => {
    mkdirSync(join(tempDir, "src", "routes"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "routes", "users.ts"),
      "export {};",
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("API");
  });

  it("infers CLI tag from bin/ directory", async () => {
    mkdirSync(join(tempDir, "bin"), { recursive: true });
    writeFileSync(
      join(tempDir, "bin", "cli.js"),
      "#!/usr/bin/env node",
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("CLI");
  });

  it("returns empty ambiguities for an unambiguous CLI project", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "my-cli",
        bin: { "my-cli": "dist/index.js" },
        main: "dist/index.js",
      }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    const primaryTagAmbiguities = result.ambiguities.filter(
      (a) => a.field === "primary_tag",
    );
    expect(primaryTagAmbiguities).toHaveLength(0);
  });

  // ── Ambiguity: pure markdown project (DOCS) ───────────────────────

  describe("ambiguity detection — pure markdown project", () => {
    it("infers DOCS tag when no build system and markdown files present", async () => {
      writeFileSync(
        join(tempDir, "README.md"),
        "# My Design Spec\n\nThis is a narrative design system.",
        "utf-8",
      );
      writeFileSync(
        join(tempDir, "DESIGN.md"),
        "## Architecture\n\nSomething.",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("DOCS");
    });

    it("reports project_type ambiguity for pure markdown project", async () => {
      writeFileSync(
        join(tempDir, "README.md"),
        "# Design System\n\nA narrative design spec.",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "project_type",
      );
      expect(ambiguity).toBeDefined();
      expect(ambiguity!.signals).toContain("no package.json");
      expect(ambiguity!.signals).toContain("markdown files present");
    });

    it("ambiguity interpretations include DOCS and early-stage software options", async () => {
      writeFileSync(
        join(tempDir, "SPEC.md"),
        "# Spec\n\nDesign document.",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "project_type",
      );
      expect(ambiguity).toBeDefined();
      expect(
        ambiguity!.interpretations.some((i) => i.description.includes("DOCS")),
      ).toBe(true);
      expect(
        ambiguity!.interpretations.some((i) =>
          i.description.includes("Early-stage"),
        ),
      ).toBe(true);
    });

    it("does NOT add DOCS ambiguity when package.json is present", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "my-lib" }),
        "utf-8",
      );
      writeFileSync(
        join(tempDir, "README.md"),
        "# My Lib\n\nA library.",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "project_type",
      );
      expect(ambiguity).toBeUndefined();
    });
  });

  // ── Ambiguity: conflicting tag signals (CLI vs LIBRARY) ───────────

  describe("ambiguity detection — CLI vs LIBRARY", () => {
    it("reports primary_tag ambiguity when CLI framework dep and main field coexist", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "my-pkg",
          dependencies: { commander: "^12.0.0" },
          main: "dist/index.js",
        }),
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("CLI");
      expect(result.tags).toContain("LIBRARY");
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "primary_tag",
      );
      expect(ambiguity).toBeDefined();
    });

    it("CLI vs LIBRARY ambiguity has three interpretations (CLI, LIBRARY, CLI+LIBRARY)", async () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "my-pkg",
          dependencies: { commander: "^12.0.0" },
          main: "dist/index.js",
        }),
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      const ambiguity = result.ambiguities.find(
        (a) => a.field === "primary_tag",
      );
      expect(ambiguity).toBeDefined();
      expect(ambiguity!.interpretations).toHaveLength(3);
      expect(ambiguity!.interpretations.map((i) => i.label)).toEqual([
        "A",
        "B",
        "C",
      ]);
    });
  });

  // ── DATABASE and AUTH tag inference ───────────────────────────────

  it("infers DATABASE tag when prisma in deps", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { prisma: "^5.0.0" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("DATABASE");
  });

  it("infers DATABASE tag when pg in deps", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { pg: "^8.0.0" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("DATABASE");
  });

  it("infers AUTH tag when next-auth in deps", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { "next-auth": "^4.0.0" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("AUTH");
  });

  it("infers AUTH tag when clerk in deps", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { "@clerk/nextjs": "^4.0.0" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("AUTH");
  });

  // ── LIBRARY false positive prevention ────────────────────────────

  it("does NOT infer LIBRARY when only src/lib/ exists (no main/exports)", async () => {
    mkdirSync(join(tempDir, "src", "lib"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "lib", "utils.ts"),
      "export const x = 1;",
      "utf-8",
    );
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "my-app" }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).not.toContain("LIBRARY");
  });

  it("infers LIBRARY when package.json has main field (and no bin)", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "my-lib", main: "dist/index.js" }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("LIBRARY");
  });

  it("infers LIBRARY when package.json has exports field (and no bin)", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "my-lib", exports: { ".": "./dist/index.js" } }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("LIBRARY");
  });

  it("does NOT infer LIBRARY when main is set but bin is also set", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "my-cli",
        main: "dist/index.js",
        bin: { "my-cli": "dist/index.js" },
      }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).not.toContain("LIBRARY");
  });

  // ── MCP server pattern ────────────────────────────────────────────

  it("infers CLI and API tags from @modelcontextprotocol/sdk dependency", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" },
      }),
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("CLI");
    expect(result.tags).toContain("API");
  });

  // ── Fix 2: subdirectory package detection ────────────────────────

  describe("subdirectory package detection", () => {
    it("infers API tag from backend/package.json with express dependency", async () => {
      mkdirSync(join(tempDir, "backend"), { recursive: true });
      writeFileSync(
        join(tempDir, "backend", "package.json"),
        JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("API");
    });

    it("infers WEB-REACT tag from frontend/package.json with react dependency", async () => {
      mkdirSync(join(tempDir, "frontend"), { recursive: true });
      writeFileSync(
        join(tempDir, "frontend", "package.json"),
        JSON.stringify({
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
        }),
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("WEB-REACT");
    });

    it("infers API tag from api/requirements.txt with fastapi", async () => {
      mkdirSync(join(tempDir, "api"), { recursive: true });
      writeFileSync(
        join(tempDir, "api", "requirements.txt"),
        "fastapi==0.100.0\nuvicorn==0.23.0\n",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("API");
    });

    it("merges tags from multiple subdirectories (frontend + backend)", async () => {
      mkdirSync(join(tempDir, "frontend"), { recursive: true });
      mkdirSync(join(tempDir, "backend"), { recursive: true });
      writeFileSync(
        join(tempDir, "frontend", "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" } }),
        "utf-8",
      );
      writeFileSync(
        join(tempDir, "backend", "package.json"),
        JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("WEB-REACT");
      expect(result.tags).toContain("API");
    });
  });

  // ── Fix 4: Python framework detection ────────────────────────────

  describe("Python framework detection", () => {
    it("infers API tag from fastapi in requirements.txt", async () => {
      writeFileSync(
        join(tempDir, "requirements.txt"),
        "fastapi==0.100.0\nuvicorn==0.23.0\n",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("API");
    });

    it("infers CLI tag from click in requirements.txt", async () => {
      writeFileSync(
        join(tempDir, "requirements.txt"),
        "click==8.0.0\n",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("CLI");
    });

    it("infers CLI tag from typer in requirements.txt", async () => {
      writeFileSync(
        join(tempDir, "requirements.txt"),
        "typer==0.9.0\n",
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("CLI");
    });

    it("infers API tag from fastapi in pyproject.toml", async () => {
      writeFileSync(
        join(tempDir, "pyproject.toml"),
        '[tool.poetry.dependencies]\npython = "^3.11"\nfastapi = "^0.100.0"\n',
        "utf-8",
      );
      const result = await inferTagsFromDirectory(tempDir);
      expect(result.tags).toContain("API");
    });
  });
});

// ── findRichestSpecFile ──────────────────────────────────────────────

describe("findRichestSpecFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-richest-spec-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns largest qualifying spec file", () => {
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "spec.md"), "a".repeat(600), "utf-8");
    writeFileSync(join(docsDir, "notes.md"), "b".repeat(1200), "utf-8");
    const result = findRichestSpecFile(tempDir);
    expect(result).not.toBeNull();
    expect(result).toContain("notes.md");
  });

  it("returns null when no qualifying files (all too short)", () => {
    writeFileSync(join(tempDir, "README.md"), "short", "utf-8");
    const result = findRichestSpecFile(tempDir);
    expect(result).toBeNull();
  });

  it("excludes PRD.md from candidates", () => {
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "PRD.md"), "p".repeat(1000), "utf-8");
    const result = findRichestSpecFile(tempDir);
    expect(result).toBeNull();
  });

  it("excludes TechSpec.md from candidates", () => {
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "TechSpec.md"), "t".repeat(1000), "utf-8");
    const result = findRichestSpecFile(tempDir);
    expect(result).toBeNull();
  });

  it("returns root-level README.md when it qualifies", () => {
    writeFileSync(join(tempDir, "README.md"), "r".repeat(600), "utf-8");
    const result = findRichestSpecFile(tempDir);
    expect(result).not.toBeNull();
    expect(result).toContain("README.md");
  });
});

// ── inferSensitiveData ──────────────────────────────────────────────

describe("inferSensitiveData", () => {
  it("returns true for spec mentioning medical keywords", () => {
    const spec = parseSpec(
      "# Health Monitor\n\n## Problem\nA patient data system that tracks medical records.\n\n## Users\n- Hospital staff\n- Patients",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL"])).toBe(true);
  });

  it("returns true for FINTECH tag", () => {
    const spec = parseSpec("A project management tool.");
    expect(inferSensitiveData(spec, ["UNIVERSAL", "FINTECH"])).toBe(true);
  });

  it("returns true for HIPAA tag", () => {
    const spec = parseSpec("A document editor.");
    expect(inferSensitiveData(spec, ["UNIVERSAL", "HIPAA"])).toBe(true);
  });

  it("returns false for unrelated spec with no sensitive tags", () => {
    const spec = parseSpec(
      "A static website generator with markdown support and themes.",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL", "DOCS"])).toBe(false);
  });

  it("returns true when spec mentions payment keywords", () => {
    const spec = parseSpec(
      "# Invoice App\n\n## Problem\nAn invoicing system that processes payment transactions for small businesses.\n\n## Users\n- Small business owners",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL"])).toBe(true);
  });

  it("returns true for SOCIAL tag (SOCIAL always implies sensitive data)", () => {
    const spec = parseSpec("A social platform tool.");
    expect(inferSensitiveData(spec, ["UNIVERSAL", "SOCIAL"])).toBe(true);
  });

  it("does not trigger on 'health' used as game/network metric (false positive regression)", () => {
    // Storycraft spec uses "network health", "character health: integer 0-100"
    const spec = parseSpec(
      "## Problem\nA narrative OS with network health monitoring and character physiology tracking.\n\n## Users\n- Authors using scene generation\n\n## Components\n- Health bar: integer 0-100 per character\n- Inciting incident tracking for plot arcs",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL", "API"])).toBe(false);
  });

  it("does not trigger on 'phi' inside 'physiology' (substring false positive regression)", () => {
    const spec = parseSpec(
      "## Problem\nStory generation system.\n\n## Components\n- physiology: { age: string, health: integer }\n- philosophy module for character motivation",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL"])).toBe(false);
  });

  it("triggers on 'phi' as a standalone acronym (Protected Health Information)", () => {
    const spec = parseSpec(
      "## Problem\nA HIPAA-compliant system that handles PHI including patient records.\n\n## Components\n- PHI vault with encryption",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL"])).toBe(true);
  });

  it("does not trigger on 'incident' in a story/narrative context (false positive regression)", () => {
    // Inciting incident is a story structure term
    const spec = parseSpec(
      "## Problem\nNarrative OS. Each scene has an inciting incident that disturbs life balance.\n\n## Components\n- incident tracking for plot structure",
    );
    expect(inferSensitiveData(spec, ["UNIVERSAL"])).toBe(false);
  });
});

// ── scanSourceForSensitivePatterns ──────────────────────────────────

describe("scanSourceForSensitivePatterns", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-scraping-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects playwright cookie injection in src/ TypeScript file", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "scraper.ts"),
      "const cookie = playwright.cookie('li_at');\nawait page.context().addCookies([cookie]);\n",
      "utf-8",
    );
    expect(await scanSourceForSensitivePatterns(tempDir)).toBe(true);
  });

  it("detects li_at session cookie reference", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "linkedin.py"),
      "session_cookie = os.environ['li_at']\nheaders = {'Cookie': f'li_at={session_cookie}'}\n",
      "utf-8",
    );
    expect(await scanSourceForSensitivePatterns(tempDir)).toBe(true);
  });

  it("detects linkedin scraping pattern", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "harvester.py"),
      "# linkedin scrape module\ndef scrape_linkedin_profiles(url: str) -> list:\n    pass\n",
      "utf-8",
    );
    expect(await scanSourceForSensitivePatterns(tempDir)).toBe(true);
  });

  it("returns false for benign source files with no scraping patterns", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "main.ts"),
      "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n",
      "utf-8",
    );
    expect(await scanSourceForSensitivePatterns(tempDir)).toBe(false);
  });

  it("returns false when no src/ directory exists", async () => {
    expect(await scanSourceForSensitivePatterns(tempDir)).toBe(false);
  });

  it("inferTagsFromDirectory adds SOCIAL tag when scraping patterns detected", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "scraper.py"),
      "# linkedin scrape utility\ndef scrape_linkedin(url: str):\n    session = requests.Session()\n    return session.get(url)\n",
      "utf-8",
    );
    const result = await inferTagsFromDirectory(tempDir);
    expect(result.tags).toContain("SOCIAL");
  });
});

// ── detectToolSampleConflation ──────────────────────────────────────

describe("detectToolSampleConflation", () => {
  const AI_GHOSTWRITER_SPEC = `
# AI Ghostwriter Platform

## Problem
Authors struggle to maintain their unique voice across long-form works.
We are building an AI writing assistant that generates prose in the author's style.

## Core Tool
- Style-fingerprinting engine that learns from uploaded samples
- AI prose generator using the author's learned patterns
- Chapter outline renderer and scene expansion module

## Sample Project — "The Last Signal"
The first novel produced with the tool will be "The Last Signal", a sci-fi thriller
about Dr. Elena Vasquez who discovers an alien transmission buried in background radiation.
Chapter 1 will demonstrate the tool's voice-matching capability.
`;

  const PURE_TOOL_SPEC = `
# AI Writing Assistant SDK

## Problem
Developers need an SDK to add AI writing capabilities to their applications.

## Core
- Text generation API
- Style adaptation module
- Grammar and tone analysis
`;

  const PURE_CONTENT_SPEC = `
# "The Last Signal" — A Novel

## Story
Dr. Elena Vasquez discovers an alien transmission buried in background radiation.
She must decode it before government agents silence her.

## Chapters
- Chapter 1: The Discovery
- Chapter 2: The Cover-Up
`;

  it("fires when spec contains both generative-tool signals and named creative content", () => {
    const result = detectToolSampleConflation(AI_GHOSTWRITER_SPEC);
    expect(result).not.toBeNull();
    expect(result!.field).toBe("tool_vs_sample_output");
  });

  it("does NOT fire on a pure tool spec with no named creative content", () => {
    const result = detectToolSampleConflation(PURE_TOOL_SPEC);
    expect(result).toBeNull();
  });

  it("does NOT fire on a pure content spec with no generative-tool language", () => {
    const result = detectToolSampleConflation(PURE_CONTENT_SPEC);
    expect(result).toBeNull();
  });

  it("returned ambiguity has tool_and_sample, tool_only, and content_only interpretations", () => {
    const result = detectToolSampleConflation(AI_GHOSTWRITER_SPEC);
    expect(result).not.toBeNull();
    const labels = result!.interpretations.map((i) => i.label);
    expect(labels).toContain("tool_and_sample");
    expect(labels).toContain("tool_only");
    expect(labels).toContain("content_only");
  });

  it("parseSpec includes tool_vs_sample_output ambiguity for AI ghostwriter spec", () => {
    const result = parseSpec(AI_GHOSTWRITER_SPEC);
    const ambiguity = result.ambiguities.find(
      (a) => a.field === "tool_vs_sample_output",
    );
    expect(ambiguity).toBeDefined();
  });

  it("stable diffusion + specific artwork spec fires detection", () => {
    const spec = `
# AI Art Studio

## Problem
Artists need an AI image generation pipeline for their studio workflow.

## Core
- Stable diffusion model fine-tuning pipeline
- Prompt engineering module
- Style transfer for artist voice replication

## First Artwork — "Solitude at Dawn"
"Solitude at Dawn" is a landscape series the studio will generate using the platform.
The series features rolling hills at sunrise and will be submitted to the annual art fair.
`;
    const result = detectToolSampleConflation(spec);
    expect(result).not.toBeNull();
  });
});
