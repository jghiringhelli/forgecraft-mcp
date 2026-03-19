/**
 * Tests for spec-parser.ts
 *
 * Covers: structured heading extraction, freeform keyword fallback,
 * tag inference from text, OpenAPI-style spec, empty input.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseSpec, inferTagsFromDirectory } from "../../src/tools/spec-parser.js";
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
      expect(result.users.some((u) => u.toLowerCase().includes("developer"))).toBe(true);
    });

    it("extracts success criteria from ## Goals heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.successCriteria.length).toBeGreaterThan(0);
    });

    it("extracts components from ## Components heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.components.length).toBeGreaterThan(0);
      expect(result.components.some((c) => c.toLowerCase().includes("gateway"))).toBe(true);
    });

    it("extracts external systems from ## External Systems heading", () => {
      const result = parseSpec(STRUCTURED_SPEC);
      expect(result.externalSystems.length).toBeGreaterThan(0);
      expect(result.externalSystems.some((s) => s.toLowerCase().includes("stripe"))).toBe(true);
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
      expect(result.successCriteria.some((s) => s.toLowerCase().includes("success") || s.toLowerCase().includes("measure"))).toBe(true);
    });

    it("infers WEB3 tag from blockchain keywords", () => {
      const result = parseSpec(PROSE_SPEC);
      expect(result.inferredTags).toContain("WEB3");
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

  describe("blockchain keywords", () => {
    it("infers WEB3 tag from smart contract keyword", () => {
      const result = parseSpec("A smart contract platform for DeFi token swaps.");
      expect(result.inferredTags).toContain("WEB3");
    });

    it("infers WEB3 tag from crypto keyword", () => {
      const result = parseSpec("Manage your crypto wallet and blockchain assets.");
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
    const tags = await inferTagsFromDirectory(tempDir);
    expect(tags).toContain("UNIVERSAL");
  });

  it("infers CLI tag from package.json bin field", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "my-cli", bin: { "my-cli": "dist/index.js" } }),
      "utf-8",
    );
    const tags = await inferTagsFromDirectory(tempDir);
    expect(tags).toContain("CLI");
  });

  it("infers CLI tag from commander dependency", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { commander: "^12.0.0" } }),
      "utf-8",
    );
    const tags = await inferTagsFromDirectory(tempDir);
    expect(tags).toContain("CLI");
  });

  it("infers API tag from express dependency", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "utf-8",
    );
    const tags = await inferTagsFromDirectory(tempDir);
    expect(tags).toContain("API");
  });

  it("infers API tag from src/routes directory", async () => {
    mkdirSync(join(tempDir, "src", "routes"), { recursive: true });
    writeFileSync(join(tempDir, "src", "routes", "users.ts"), "export {};", "utf-8");
    const tags = await inferTagsFromDirectory(tempDir);
    expect(tags).toContain("API");
  });

  it("infers CLI tag from bin/ directory", async () => {
    mkdirSync(join(tempDir, "bin"), { recursive: true });
    writeFileSync(join(tempDir, "bin", "cli.js"), "#!/usr/bin/env node", "utf-8");
    const tags = await inferTagsFromDirectory(tempDir);
    expect(tags).toContain("CLI");
  });
});
