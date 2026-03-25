/**
 * Internal helpers for project-gates.ts.
 * Exports pure utilities and low-level I/O used by the public gate API.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";
import type {
  ProjectGate,
  ProjectGatesFile,
  ToolRequirement,
} from "./types.js";

// ── Path constants ────────────────────────────────────────────────────────

export const FLAT_FILE = ".forgecraft/project-gates.yaml";
export const GATES_BASE = ".forgecraft/gates";
export const PROJECT_ACTIVE = `${GATES_BASE}/project/active`;
export const PROJECT_PROMOTED = `${GATES_BASE}/project/promoted`;
export const PROJECT_RETIRED = `${GATES_BASE}/project/retired`;
export const REGISTRY_BASE = `${GATES_BASE}/registry`;

export const EMPTY_GATES_FILE: ProjectGatesFile = {
  version: "1",
  gates: [],
};

// ── Normalization ─────────────────────────────────────────────────────────

/**
 * Normalizes a raw YAML object into a fully-typed ProjectGate.
 * Handles backward compat: maps old `category` field to `domain`,
 * and fills in defaults for newly required fields.
 *
 * @param raw - Raw parsed YAML object.
 * @returns Normalized ProjectGate.
 */
export function normalizeGate(raw: Record<string, unknown>): ProjectGate {
  const gate = { ...raw } as Record<string, unknown>;
  if (!gate.domain && gate.category) {
    gate.domain = gate.category;
  }
  if (!gate.status) gate.status = "ready";
  if (!gate.source) gate.source = "project";
  if (!gate.os) gate.os = "cross-platform";
  if (!gate.implementation) {
    gate.implementation = gate.tools ? "tooled" : "logic";
  }
  if (!gate.addedAt) gate.addedAt = new Date().toISOString();
  return gate as unknown as ProjectGate;
}

// ── Low-level file I/O ────────────────────────────────────────────────────

/**
 * Reads a single gate YAML file from disk.
 * Returns null if the file is missing or malformed.
 *
 * @param filePath - Absolute path to the .yaml gate file.
 */
export function readGateFile(filePath: string): ProjectGate | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = yamlLoad(raw) as Record<string, unknown>;
    if (!parsed?.id) return null;
    return normalizeGate(parsed);
  } catch {
    return null;
  }
}

/**
 * Reads all gate YAML files from a directory.
 *
 * @param dirPath - Absolute path to the directory.
 */
export function readGatesFromDir(dirPath: string): ProjectGate[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readGateFile(join(dirPath, f)))
    .filter((g): g is ProjectGate => g !== null);
}

// ── Flat-file read ────────────────────────────────────────────────────────

/**
 * Reads all project-specific quality gates from the legacy flat file.
 * Returns empty list if file does not exist.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function readProjectGates(projectRoot: string): readonly ProjectGate[] {
  const filePath = join(projectRoot, FLAT_FILE);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = yamlLoad(raw) as ProjectGatesFile;
    const gates = parsed?.gates ?? [];
    return gates.map((g) =>
      normalizeGate(g as unknown as Record<string, unknown>),
    );
  } catch {
    return [];
  }
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Validates a gate before adding it.
 * Returns a list of validation errors, or empty array if valid.
 *
 * @param gate - The gate to validate.
 */
export function validateGate(gate: Partial<ProjectGate>): string[] {
  const errors: string[] = [];
  if (!gate.id?.trim()) errors.push("id is required");
  if (!gate.title?.trim()) errors.push("title is required");
  if (!gate.description?.trim()) errors.push("description is required");
  if (!gate.check?.trim()) errors.push("check is required");
  if (!gate.passCriterion?.trim()) errors.push("passCriterion is required");
  if (!gate.gsProperty?.trim()) errors.push("gsProperty is required");
  if (!gate.phase) errors.push("phase is required");
  if (gate.generalizable && !gate.evidence?.trim()) {
    errors.push(
      "evidence is required when generalizable: true — describe the bug this would have caught",
    );
  }
  return errors;
}

// ── Tool resolution ───────────────────────────────────────────────────────

/**
 * Resolve the active tool list for a gate given the project's primary language.
 * If toolVariants contains a matching language entry, returns that tool (wrapped in array).
 * Falls back to gate.tools if no variant matches.
 *
 * @param gate - The quality gate
 * @param language - Primary language (lowercase, e.g. "typescript")
 * @returns Array of ToolRequirements to use for this gate in this project
 */
export function resolveToolsForLanguage(
  gate: ProjectGate,
  language: string,
): readonly ToolRequirement[] {
  const normalizedLanguage = language.toLowerCase();

  if (gate.toolVariants) {
    for (const variant of gate.toolVariants) {
      if (
        variant.languages.some((l) => l.toLowerCase() === normalizedLanguage)
      ) {
        return [variant.tool];
      }
    }
  }

  return gate.tools ?? [];
}
