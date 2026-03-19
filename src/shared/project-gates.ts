import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import type { ProjectGate, ProjectGatesFile } from "./types.js";

const PROJECT_GATES_FILE = ".forgecraft/project-gates.yaml";

const EMPTY_GATES_FILE: ProjectGatesFile = {
  version: "1",
  gates: [],
};

/**
 * Reads all project-specific quality gates.
 * Returns empty list if file does not exist.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function readProjectGates(projectRoot: string): readonly ProjectGate[] {
  const filePath = join(projectRoot, PROJECT_GATES_FILE);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = yamlLoad(raw) as ProjectGatesFile;
    return parsed?.gates ?? [];
  } catch {
    return [];
  }
}

/**
 * Adds a new project-specific gate.
 * Creates the file if it does not exist.
 * Throws if a gate with the same id already exists.
 *
 * @param projectRoot - Absolute path to project root.
 * @param gate - The gate to add (addedAt is generated).
 * @returns The created gate with addedAt timestamp.
 */
export function addProjectGate(
  projectRoot: string,
  gate: Omit<ProjectGate, "addedAt">,
): ProjectGate {
  const filePath = join(projectRoot, PROJECT_GATES_FILE);
  let existing: ProjectGatesFile = EMPTY_GATES_FILE;
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8");
    existing = (yamlLoad(raw) as ProjectGatesFile) ?? EMPTY_GATES_FILE;
  }

  if (existing.gates.some((g) => g.id === gate.id)) {
    throw new Error(
      `Gate with id '${gate.id}' already exists in ${PROJECT_GATES_FILE}`,
    );
  }

  const newGate: ProjectGate = { ...gate, addedAt: new Date().toISOString() };
  const updated: ProjectGatesFile = {
    ...existing,
    gates: [...existing.gates, newGate],
  };

  writeFileSync(filePath, yamlDump(updated), "utf-8");
  return newGate;
}

/**
 * Returns all gates marked as generalizable: true.
 * These are candidates for community contribution.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function getContributableGates(
  projectRoot: string,
): readonly ProjectGate[] {
  return readProjectGates(projectRoot).filter((g) => g.generalizable === true);
}

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
