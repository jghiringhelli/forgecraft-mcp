/**
 * Tests for src/core — GenerativeSpec interfaces and type composition.
 *
 * The core module contains only TypeScript interfaces. These tests verify:
 *   1. The artifact implementations satisfy the interface contracts (type correctness)
 *   2. The GenerativeSpec intersection type is satisfiable
 *   3. The module re-exports are accessible and stable
 */

import { describe, it, expect } from "vitest";
import type {
  GenerativeSpec,
  SelfDescribingSpec,
  BoundedSpec,
  VerifiableSpec,
  DefendedSpec,
  AuditableSpec,
  ComposableSpec,
  CompositionConflict,
  VerificationResult,
  QualityGate,
  ArchDecision,
  SpecChange,
} from "../../src/core/index.js";

// ── Import artifact implementations (this also covers core/index.js exports) ──

import { ClaudeInstructionsArtifact } from "../../src/artifacts/claude-instructions.js";
import { CommitHooksArtifact } from "../../src/artifacts/commit-hooks.js";
import { SchemaArtifact } from "../../src/artifacts/schema.js";
import { AdrArtifact } from "../../src/artifacts/adr.js";
import { CommitHistoryArtifact } from "../../src/artifacts/commit-history.js";

// ── Type-level assertions (compile-time; if these fail the build fails) ────────

/**
 * Assert that a value satisfies the GenerativeSpec intersection at compile time.
 * Assigning an artifact to this type ensures it implements all 6 properties.
 */
function assertIsGenerativeSpec(_: GenerativeSpec): void { /* noop */ }

describe("GenerativeSpec — core interface contract", () => {
  describe("ClaudeInstructionsArtifact satisfies GenerativeSpec", () => {
    it("can be assigned to GenerativeSpec type", () => {
      const artifact = new ClaudeInstructionsArtifact("/tmp/test", "1.0.0");
      assertIsGenerativeSpec(artifact);
      expect(artifact).toBeDefined();
    });

    it("has all six required property groups", () => {
      const artifact = new ClaudeInstructionsArtifact("/tmp/test");
      // SelfDescribingSpec
      expect(typeof artifact.name).toBe("string");
      expect(typeof artifact.purpose).toBe("string");
      expect(Array.isArray(artifact.covers)).toBe(true);
      expect(Array.isArray(artifact.excludes)).toBe(true);
      // BoundedSpec
      expect(typeof artifact.version).toBe("string");
      expect(typeof artifact.specId).toBe("string");
      expect(typeof artifact.isInScope).toBe("function");
      // VerifiableSpec
      expect(typeof artifact.verify).toBe("function");
      // DefendedSpec
      expect(Array.isArray(artifact.gates)).toBe(true);
      expect(typeof artifact.defend).toBe("function");
      // AuditableSpec
      expect(Array.isArray(artifact.decisions)).toBe(true);
      expect(Array.isArray(artifact.changeHistory)).toBe(true);
      expect(typeof artifact.findDecision).toBe("function");
      // ComposableSpec
      expect(Array.isArray(artifact.dependsOn)).toBe(true);
      expect(typeof artifact.composeWith).toBe("function");
    });
  });

  describe("CommitHooksArtifact satisfies GenerativeSpec", () => {
    it("can be assigned to GenerativeSpec type", () => {
      const artifact = new CommitHooksArtifact("/tmp/test");
      assertIsGenerativeSpec(artifact);
      expect(artifact.name).toContain("Hook");
    });
  });

  describe("SchemaArtifact satisfies GenerativeSpec", () => {
    it("can be assigned to GenerativeSpec type", () => {
      const artifact = new SchemaArtifact("/tmp/test");
      assertIsGenerativeSpec(artifact);
      expect(artifact.name).toContain("Schema");
    });
  });

  describe("AdrArtifact satisfies GenerativeSpec", () => {
    it("can be assigned to GenerativeSpec type", () => {
      const artifact = new AdrArtifact("/tmp/test");
      assertIsGenerativeSpec(artifact);
      expect(artifact.name).toContain("ADR");
    });
  });

  describe("CommitHistoryArtifact satisfies GenerativeSpec", () => {
    it("can be assigned to GenerativeSpec type", () => {
      const artifact = new CommitHistoryArtifact("/tmp/test");
      assertIsGenerativeSpec(artifact);
      expect(artifact.name).toContain("Commit");
    });
  });
});

describe("VerificationResult shape", () => {
  it("can be constructed as a plain object", () => {
    const result: VerificationResult = { passed: true, criterion: "test", detail: "ok" };
    expect(result.passed).toBe(true);
    expect(result.criterion).toBe("test");
  });

  it("detail is optional", () => {
    const result: VerificationResult = { passed: false, criterion: "file-exists" };
    expect(result.detail).toBeUndefined();
  });
});

describe("QualityGate shape", () => {
  it("can be constructed as an object literal", async () => {
    const gate: QualityGate = {
      id: "test-gate",
      description: "A test gate",
      phase: "pre-commit",
      async run() { return { exitCode: 0, message: "ok" }; },
    };
    const result = await gate.run();
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("ok");
  });

  it("all phases are valid string literals", () => {
    const phases: QualityGate["phase"][] = ["pre-commit", "pre-push", "ci", "pre-merge"];
    expect(phases).toHaveLength(4);
  });
});

describe("ArchDecision shape", () => {
  it("accepted decision has required fields", () => {
    const decision: ArchDecision = {
      id: "ADR-0001",
      date: "2026-03-12",
      title: "Use TypeScript",
      status: "accepted",
      context: "We need type safety",
      decision: "Use TypeScript",
      consequences: "Better tooling",
    };
    expect(decision.supersededBy).toBeUndefined();
    expect(decision.status).toBe("accepted");
  });

  it("superseded decision can reference a new ADR", () => {
    const decision: ArchDecision = {
      id: "ADR-0001",
      date: "2026-01-01",
      title: "Old decision",
      status: "superseded",
      context: "Prior context",
      decision: "Old choice",
      consequences: "Was fine",
      supersededBy: "ADR-0002",
    };
    expect(decision.supersededBy).toBe("ADR-0002");
  });
});

describe("CompositionConflict shape", () => {
  it("can be constructed as a plain object", () => {
    const conflict: CompositionConflict = {
      specA: "artifact:claude-instructions",
      specB: "artifact:adr",
      conflictingProperty: "naming",
      description: "Naming conflict between specs",
    };
    expect(conflict.specA).toBeDefined();
    expect(conflict.conflictingProperty).toBeDefined();
  });
});

describe("SpecChange shape", () => {
  it("can be constructed as a plain object", () => {
    const change: SpecChange = {
      timestamp: "2026-03-12T00:00:00Z",
      author: "jghiringhelli",
      description: "Added new section",
      specVersionBefore: "1.0.0",
      specVersionAfter: "1.1.0",
    };
    expect(change.specVersionAfter).toBe("1.1.0");
  });
});
