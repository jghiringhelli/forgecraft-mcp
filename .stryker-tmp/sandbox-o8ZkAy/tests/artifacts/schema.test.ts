/**
 * Tests for SchemaArtifact — Zod / JSON Schema data contract enforcement.
 */
// @ts-nocheck


import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SchemaArtifact, SCHEMA_ARTIFACT_ID } from "../../src/artifacts/schema.js";

const TMP_DIR = join(tmpdir(), `forgecraft-test-schema-${Date.now()}`);

beforeAll(() => mkdirSync(TMP_DIR, { recursive: true }));
afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("SchemaArtifact", () => {
  describe("identity properties", () => {
    it("has the correct specId", () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      expect(artifact.specId).toBe(SCHEMA_ARTIFACT_ID);
    });

    it("has a non-empty name mentioning Zod or Schema", () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      expect(artifact.name.toLowerCase()).toMatch(/schema|zod/);
    });

    it("covers tool handler schemas and DTOs", () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      const coversText = artifact.covers.join(" ");
      expect(coversText).toContain("Zod");
    });

    it("excludes test fixture types", () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      const excludesText = artifact.excludes.join(" ");
      expect(excludesText.toLowerCase()).toContain("test");
    });

    it("accepts a custom version", () => {
      const artifact = new SchemaArtifact(TMP_DIR, "3.0.0");
      expect(artifact.version).toBe("3.0.0");
    });
  });

  describe("isInScope", () => {
    const artifact = new SchemaArtifact(TMP_DIR);

    it("returns true for files containing 'Schema'", () => {
      expect(artifact.isInScope("src/tools/myToolSchema.ts")).toBe(true);
    });

    it("returns true for *.schema.ts files", () => {
      expect(artifact.isInScope("src/models/user.schema.ts")).toBe(true);
    });

    it("returns true for types.ts files", () => {
      expect(artifact.isInScope("src/shared/types.ts")).toBe(true);
    });

    it("returns false for unrelated files", () => {
      expect(artifact.isInScope("src/services/users.ts")).toBe(false);
      expect(artifact.isInScope("README.md")).toBe(false);
    });
  });

  describe("verify()", () => {
    it("fails for non-existent file", async () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      const results = await artifact.verify("nonexistent.ts");
      expect(results).toHaveLength(1);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.criterion).toBe("file-exists");
    });
  });

  describe("defend()", () => {
    it("returns allPassed and results array", async () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      const { allPassed, results } = await artifact.defend();
      expect(typeof allPassed).toBe("boolean");
      expect(Array.isArray(results)).toBe(true);
    });

    it("each result has gate, exitCode, message", async () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      const { results } = await artifact.defend();
      for (const r of results) {
        expect(r.gate.id.length).toBeGreaterThan(0);
        expect(typeof r.exitCode).toBe("number");
        expect(typeof r.message).toBe("string");
      }
    });

    it("passes the schema-for-tool-inputs gate when no tools dir (skipped)", async () => {
      const artifact = new SchemaArtifact("/nonexistent/path");
      const { results } = await artifact.defend();
      const gate = results.find((r) => r.gate.id === "schema-for-tool-inputs");
      // When tools dir doesn't exist the gate is skipped with exitCode 0
      expect(gate?.exitCode).toBe(0);
      expect(gate?.message).toContain("skipped");
    });
  });

  describe("findDecision()", () => {
    it("returns undefined when decisions is empty", () => {
      const artifact = new SchemaArtifact(TMP_DIR);
      expect(artifact.findDecision("validation")).toBeUndefined();
    });
  });

  describe("composeWith()", () => {
    it("returns empty conflict array", () => {
      const a = new SchemaArtifact(TMP_DIR);
      const b = new SchemaArtifact(TMP_DIR);
      expect(a.composeWith(b)).toHaveLength(0);
    });
  });
});
