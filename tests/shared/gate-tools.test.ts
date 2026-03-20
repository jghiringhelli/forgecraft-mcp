/**
 * Tests for resolveToolsForLanguage in src/shared/project-gates.ts
 */

import { describe, it, expect } from "vitest";
import { resolveToolsForLanguage } from "../../src/shared/project-gates.js";
import type { ProjectGate, ToolRequirement } from "../../src/shared/types.js";

const BASE_GATE: ProjectGate = {
  id: "test-gate",
  title: "Test Gate",
  description: "A test gate",
  domain: "security",
  gsProperty: "defended",
  phase: "development",
  hook: "pre-commit",
  check: "Run security scan",
  passCriterion: "No vulnerabilities found",
  status: "ready",
  source: "project",
  os: "cross-platform",
  implementation: "tooled",
  addedAt: new Date().toISOString(),
};

const ESLINT_TOOL: ToolRequirement = {
  name: "eslint-plugin-security",
  purpose: "JavaScript/TypeScript security scanning",
  category: "npm",
  required: true,
};

const BANDIT_TOOL: ToolRequirement = {
  name: "bandit",
  purpose: "Python security scanning",
  installCommand: "pip install bandit",
  category: "pip",
  required: true,
};

const GOSEC_TOOL: ToolRequirement = {
  name: "gosec",
  purpose: "Go security scanning",
  category: "binary",
  required: true,
};

describe("resolveToolsForLanguage", () => {
  it("returns empty array when gate has no tools and no variants", () => {
    const gate: ProjectGate = {
      ...BASE_GATE,
      tools: undefined,
      toolVariants: undefined,
    };
    const result = resolveToolsForLanguage(gate, "typescript");
    expect(result).toEqual([]);
  });

  it("returns variant tool when language matches", () => {
    const gate: ProjectGate = {
      ...BASE_GATE,
      tools: [GOSEC_TOOL],
      toolVariants: [
        { languages: ["typescript", "javascript"], tool: ESLINT_TOOL },
        { languages: ["python"], tool: BANDIT_TOOL },
      ],
    };

    const result = resolveToolsForLanguage(gate, "typescript");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("eslint-plugin-security");
  });

  it("falls back to gate.tools when no variant matches the language", () => {
    const gate: ProjectGate = {
      ...BASE_GATE,
      tools: [GOSEC_TOOL],
      toolVariants: [{ languages: ["python"], tool: BANDIT_TOOL }],
    };

    const result = resolveToolsForLanguage(gate, "go");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("gosec");
  });

  it("is case-insensitive when matching language", () => {
    const gate: ProjectGate = {
      ...BASE_GATE,
      toolVariants: [{ languages: ["TypeScript"], tool: ESLINT_TOOL }],
    };

    const result = resolveToolsForLanguage(gate, "typescript");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("eslint-plugin-security");
  });

  it("returns gate.tools when toolVariants is absent", () => {
    const gate: ProjectGate = {
      ...BASE_GATE,
      tools: [GOSEC_TOOL],
      toolVariants: undefined,
    };

    const result = resolveToolsForLanguage(gate, "go");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("gosec");
  });

  it("matches the first variant when multiple could apply", () => {
    const gate: ProjectGate = {
      ...BASE_GATE,
      toolVariants: [
        { languages: ["typescript"], tool: ESLINT_TOOL },
        { languages: ["typescript"], tool: BANDIT_TOOL },
      ],
    };

    const result = resolveToolsForLanguage(gate, "typescript");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("eslint-plugin-security");
  });
});
