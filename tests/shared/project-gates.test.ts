/**
 * Tests for the project-gates module.
 *
 * Tests cover: addProjectGate, readProjectGates, getContributableGates, validateGate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addProjectGate,
  readProjectGates,
  getContributableGates,
  validateGate,
} from "../../src/shared/project-gates.js";
import type { ProjectGate } from "../../src/shared/types.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-gates-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".forgecraft"), { recursive: true });
  return dir;
}

const VALID_GATE: Omit<ProjectGate, "addedAt"> = {
  id: "check-no-direct-db-in-controller",
  title: "No direct DB calls in controllers",
  description:
    "Controllers must delegate to services, never call repositories directly.",
  category: "layering",
  gsProperty: "composable",
  phase: "development",
  hook: "pre-commit",
  check:
    "Scan controller files for repository imports and flag any direct usage.",
  passCriterion: "Zero repository imports in controller files",
};

describe("project-gates module", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── addProjectGate ─────────────────────────────────────────────────

  describe("addProjectGate", () => {
    it("creates the file if absent and returns gate with addedAt", () => {
      const filePath = join(tempDir, ".forgecraft", "project-gates.yaml");
      expect(existsSync(filePath)).toBe(false);

      const result = addProjectGate(tempDir, VALID_GATE);

      expect(existsSync(filePath)).toBe(true);
      expect(result.id).toBe(VALID_GATE.id);
      expect(result.addedAt).toBeDefined();
      expect(new Date(result.addedAt!).getTime()).toBeGreaterThan(0);
    });

    it("appends a gate to an existing file", () => {
      const secondGate: Omit<ProjectGate, "addedAt"> = {
        ...VALID_GATE,
        id: "check-no-eval",
        title: "No eval() with dynamic input",
      };

      addProjectGate(tempDir, VALID_GATE);
      addProjectGate(tempDir, secondGate);

      const gates = readProjectGates(tempDir);
      expect(gates).toHaveLength(2);
      expect(gates[0]!.id).toBe(VALID_GATE.id);
      expect(gates[1]!.id).toBe("check-no-eval");
    });

    it("throws if a gate with the same id already exists", () => {
      addProjectGate(tempDir, VALID_GATE);

      expect(() => addProjectGate(tempDir, VALID_GATE)).toThrowError(
        `Gate with id '${VALID_GATE.id}' already exists`,
      );
    });
  });

  // ── readProjectGates ───────────────────────────────────────────────

  describe("readProjectGates", () => {
    it("returns empty array for missing file", () => {
      const result = readProjectGates(tempDir);
      expect(result).toEqual([]);
    });

    it("returns all gates from valid file", () => {
      addProjectGate(tempDir, VALID_GATE);
      addProjectGate(tempDir, {
        ...VALID_GATE,
        id: "another-gate",
        title: "Another",
      });

      const gates = readProjectGates(tempDir);
      expect(gates).toHaveLength(2);
    });
  });

  // ── getContributableGates ──────────────────────────────────────────

  describe("getContributableGates", () => {
    it("returns only gates marked generalizable: true", () => {
      addProjectGate(tempDir, VALID_GATE);
      addProjectGate(tempDir, {
        ...VALID_GATE,
        id: "generalizable-gate",
        title: "A gate worth sharing",
        generalizable: true,
        evidence:
          "Caused a production incident on 2024-01-15 when a controller called the DB directly.",
      });

      const result = getContributableGates(tempDir);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("generalizable-gate");
    });

    it("returns empty array when no generalizable gates exist", () => {
      addProjectGate(tempDir, VALID_GATE);
      expect(getContributableGates(tempDir)).toHaveLength(0);
    });
  });

  // ── validateGate ──────────────────────────────────────────────────

  describe("validateGate", () => {
    it("returns no errors for a valid gate", () => {
      const errors = validateGate(VALID_GATE);
      expect(errors).toHaveLength(0);
    });

    it("returns errors for missing required fields", () => {
      const errors = validateGate({});
      expect(errors).toContain("id is required");
      expect(errors).toContain("title is required");
      expect(errors).toContain("description is required");
      expect(errors).toContain("check is required");
      expect(errors).toContain("passCriterion is required");
      expect(errors).toContain("gsProperty is required");
      expect(errors).toContain("phase is required");
    });

    it("requires evidence when generalizable: true", () => {
      const errors = validateGate({
        ...VALID_GATE,
        generalizable: true,
        evidence: undefined,
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        "evidence is required when generalizable: true",
      );
    });

    it("does not require evidence when generalizable is false or absent", () => {
      const errors = validateGate({ ...VALID_GATE, generalizable: false });
      expect(errors).toHaveLength(0);
    });
  });
});
