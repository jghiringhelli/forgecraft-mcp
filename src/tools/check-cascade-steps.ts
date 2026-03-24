/**
 * check-cascade-steps: Step 1-3 checkers for the GS initialization cascade.
 * Also exports shared types and constants used across cascade modules.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { ForgeCraftConfig } from "../shared/types.js";

// ── Domain Types ─────────────────────────────────────────────────────

export interface CascadeStep {
  readonly step: number;
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "WARN" | "STUB" | "SKIP";
  readonly detail: string;
  readonly action?: string;
  readonly questions: readonly string[];
}

// ── Constants ────────────────────────────────────────────────────────

export const CONSTITUTION_PATHS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursor/rules",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  ".clinerules",
] as const;

export const FUNCTIONAL_SPEC_PATHS = [
  "docs/PRD.md",
  "docs/TechSpec.md",
  "docs/tech-spec.md",
  "docs/functional-spec.md",
  "docs/spec.md",
] as const;

export const ADR_DIRS = ["docs/adrs", "docs/adr"] as const;

export const USE_CASE_PATHS = [
  "docs/use-cases.md",
  "docs/UseCases.md",
  "docs/use-cases",
] as const;

export const CONSTITUTION_LINE_LIMIT = 300;

/** Sections that indicate a document is a functional specification. */
export const FUNCTIONAL_SPEC_STRUCTURAL_SECTIONS = [
  "## background",
  "## problem",
  "## users",
  "## requirements",
  "## user stories",
  "## stakeholders",
  "## goals",
  "## success",
] as const;

/** Python build/package files that indicate a Python project. */
export const PYTHON_PACKAGE_FILES = [
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "poetry.lock",
] as const;

// ── Config Loader ─────────────────────────────────────────────────────

/**
 * Load the full ForgeCraft project config from forgecraft.yaml.
 * Returns null if the file is absent or unparseable.
 *
 * @param projectDir - Absolute project root path
 * @returns Parsed config or null
 */
export function loadForgeCraftConfig(projectDir: string): ForgeCraftConfig | null {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return null;
  try {
    return yaml.load(readFileSync(yamlPath, "utf-8")) as ForgeCraftConfig;
  } catch {
    return null;
  }
}

// ── Stub Detection ────────────────────────────────────────────────────

/**
 * Return true when a file contains unfilled template markers.
 *
 * @param content - File content to inspect
 * @returns Whether the content contains unfilled template markers
 */
export function isStub(content: string): boolean {
  return /<!--\s*(FILL|TODO|UNFILLED)|(\[DESCRIBE|\[YOUR |fill in here)/i.test(content);
}

// ── Step 1-3 Fallback Helpers ─────────────────────────────────────────

/**
 * Scan docs/ for a markdown file >500 chars with at least 2 functional-spec structural sections.
 *
 * @param projectDir - Absolute project root
 * @returns Relative path to matching file, or null if none found
 */
export function findFunctionalSpecFallback(projectDir: string): string | null {
  const docsDir = join(projectDir, "docs");
  if (!existsSync(docsDir)) return null;
  try {
    const files = readdirSync(docsDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const relPath = `docs/${file}`;
      if ((FUNCTIONAL_SPEC_PATHS as readonly string[]).includes(relPath)) continue;
      try {
        const content = readFileSync(join(docsDir, file), "utf-8");
        if (content.length <= 500) continue;
        const lower = content.toLowerCase();
        const matchCount = FUNCTIONAL_SPEC_STRUCTURAL_SECTIONS.filter((s) => lower.includes(s)).length;
        if (matchCount >= 2) return relPath;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return null;
}

/**
 * Scan src/ for unsafe YAML/JSON deserialization cast patterns.
 *
 * @param projectDir - Absolute project root
 * @returns Whether unsafe cast patterns were detected
 */
export function detectUnsafeDeserializationCast(projectDir: string): boolean {
  const srcDir = join(projectDir, "src");
  if (!existsSync(srcDir)) return false;
  try {
    const files = readdirSync(srcDir).filter((f) => /\.(ts|js|py)$/.test(f));
    for (const file of files) {
      try {
        const content = readFileSync(join(srcDir, file), "utf-8");
        if (/yaml\.load\((?![^)]*,\s*[A-Za-z])/i.test(content)) return true;
        if (/(?:JSON\.parse|yaml\.load)\([^)]+\)\s+as\s+\w/i.test(content)) return true;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return false;
}

// ── Step Checkers 1-3 ────────────────────────────────────────────────

/**
 * Step 1: Functional specification must exist before architecture is derived.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
export function checkFunctionalSpec(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What problem does this project solve?",
    "Who are the primary users?",
    "What does a successful outcome look like for them?",
  ] as const;

  const found = FUNCTIONAL_SPEC_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (!found) {
    const fallback = findFunctionalSpecFallback(projectDir);
    if (fallback) {
      return {
        step: 1, name: "Functional Specification", status: "WARN",
        detail: `Functional spec found at ${fallback}. Consider renaming to docs/PRD.md for standard compliance.`,
        action: `Rename ${fallback} to docs/PRD.md or docs/TechSpec.md for standard tooling compatibility.`,
        questions: [],
      };
    }
    return {
      step: 1, name: "Functional Specification", status: "FAIL",
      detail: "No functional specification found. The cascade has no axiom set.",
      action: "Create docs/PRD.md or docs/TechSpec.md: what the system does, for whom, and what constitutes success.",
      questions: STEP_QUESTIONS,
    };
  }
  const content = readFileSync(join(projectDir, found), "utf-8");
  if (isStub(content)) {
    return {
      step: 1, name: "Functional Specification", status: "STUB",
      detail: `Found ${found} but it contains unfilled template markers. Fill in the spec before continuing.`,
      action: `Open ${found} and answer the questions below to complete it.`,
      questions: STEP_QUESTIONS,
    };
  }
  return { step: 1, name: "Functional Specification", status: "PASS", detail: `Found: ${found}`, questions: [] };
}

/**
 * Step 2: Architecture + C4 diagrams.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
export function checkDiagrams(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What are the main services or components?",
    "What external systems does this project depend on or expose?",
    "What initiates the primary user flow?",
  ] as const;

  const diagramsDir = join(projectDir, "docs/diagrams");
  if (!existsSync(diagramsDir)) {
    return {
      step: 2, name: "Architecture Diagrams", status: "FAIL",
      detail: "docs/diagrams/ does not exist.",
      action: "Create docs/diagrams/ and add a Mermaid C4 context diagram (docs/diagrams/c4-context.md).",
      questions: STEP_QUESTIONS,
    };
  }
  const files = readdirSync(diagramsDir).filter((f) => /\.(md|mermaid|puml|svg|png)$/i.test(f));
  if (files.length === 0) {
    return {
      step: 2, name: "Architecture Diagrams", status: "WARN",
      detail: "docs/diagrams/ exists but contains no diagram files.",
      action: "Add docs/diagrams/c4-context.md with a Mermaid C4 context or container diagram.",
      questions: STEP_QUESTIONS,
    };
  }
  const stubFile = files.find((f) => {
    try { return isStub(readFileSync(join(diagramsDir, f), "utf-8")); } catch { return false; }
  });
  if (stubFile) {
    return {
      step: 2, name: "Architecture Diagrams", status: "STUB",
      detail: `docs/diagrams/${stubFile} contains unfilled template markers. Fill in the diagram before continuing.`,
      action: `Open docs/diagrams/${stubFile} and answer the questions below to complete it.`,
      questions: STEP_QUESTIONS,
    };
  }
  return {
    step: 2, name: "Architecture Diagrams", status: "PASS",
    detail: `${files.length} diagram file(s) in docs/diagrams/ (${files.join(", ")})`,
    questions: [],
  };
}

/**
 * Step 3: Architectural constitution — the operative grammar.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
export function checkConstitution(projectDir: string): CascadeStep {
  const foundPath = CONSTITUTION_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (!foundPath) {
    return {
      step: 3, name: "Architectural Constitution", status: "FAIL",
      detail: "No AI assistant instruction file found (CLAUDE.md, AGENTS.md, etc.).",
      action: "Run `setup_project` or `forgecraft scaffold` to generate CLAUDE.md.",
      questions: [],
    };
  }
  const lines = readFileSync(join(projectDir, foundPath), "utf-8").split("\n").length;
  if (lines > CONSTITUTION_LINE_LIMIT) {
    return {
      step: 3, name: "Architectural Constitution", status: "WARN",
      detail: `${foundPath} found (${lines} lines) — exceeds the ${CONSTITUTION_LINE_LIMIT}-line threshold.`,
      action: "Run `refresh_project` with tier: core to compress. An oversized constitution dilutes AI attention on every turn.",
      questions: [],
    };
  }
  return {
    step: 3, name: "Architectural Constitution", status: "PASS",
    detail: `${foundPath} (${lines} lines) — within the ${CONSTITUTION_LINE_LIMIT}-line threshold`,
    questions: [],
  };
}
