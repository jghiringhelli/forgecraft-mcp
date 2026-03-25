/**
 * Project-specific quality gates: read, write, validate, and migrate.
 *
 * Public API for all gate operations. Implementation split into:
 *   - project-gates-helpers.ts: constants, normalisation, flat-file read, validation
 *   - project-gates-folder.ts: folder-based API (active/promoted/retired/registry)
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import type { ProjectGate, ProjectGatesFile } from "./types.js";
import { FLAT_FILE, EMPTY_GATES_FILE } from "./project-gates-helpers.js";

export * from "./project-gates-helpers.js";
export * from "./project-gates-folder.js";

// ── Flat-file write ───────────────────────────────────────────────────────

/**
 * Adds a new project-specific gate to the legacy flat file.
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
  const filePath = join(projectRoot, FLAT_FILE);
  let existing: ProjectGatesFile = EMPTY_GATES_FILE;
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8");
    existing = (yamlLoad(raw) as ProjectGatesFile) ?? EMPTY_GATES_FILE;
  }

  if (existing.gates.some((g) => g.id === gate.id)) {
    throw new Error(`Gate with id '${gate.id}' already exists in ${FLAT_FILE}`);
  }

  const newGate: ProjectGate = { ...gate, addedAt: new Date().toISOString() };
  const updated: ProjectGatesFile = {
    ...existing,
    gates: [...existing.gates, newGate],
  };

  writeFileSync(filePath, yamlDump(updated), "utf-8");
  return newGate;
}
