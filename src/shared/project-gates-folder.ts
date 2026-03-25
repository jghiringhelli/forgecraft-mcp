/**
 * Folder-based gate API: per-file storage under .forgecraft/gates/.
 * Also includes getContributableGates which queries folder structure.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import type { ProjectGate } from "./types.js";
import {
  normalizeGate,
  readProjectGates,
  FLAT_FILE,
  PROJECT_ACTIVE,
  PROJECT_PROMOTED,
  PROJECT_RETIRED,
  REGISTRY_BASE,
} from "./project-gates-helpers.js";

/**
 * Returns all gates marked as generalizable: true with non-empty evidence.
 * Reads from the legacy flat file AND the active folder for full coverage.
 * Gates already in promoted/ are excluded.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function getContributableGates(
  projectRoot: string,
): readonly ProjectGate[] {
  const fromFlatFile = readProjectGates(projectRoot).filter(
    (g) => g.generalizable === true,
  );

  const promotedFolderPath = join(projectRoot, PROJECT_PROMOTED);
  const promotedIds = new Set<string>();
  if (existsSync(promotedFolderPath)) {
    for (const file of readdirSync(promotedFolderPath)) {
      if (file.endsWith(".yaml")) {
        promotedIds.add(file.replace(/\.yaml$/, ""));
      }
    }
  }

  const activeFolderPath = join(projectRoot, PROJECT_ACTIVE);
  const fromActiveFolder: ProjectGate[] = [];
  if (existsSync(activeFolderPath)) {
    for (const file of readdirSync(activeFolderPath)) {
      if (!file.endsWith(".yaml")) continue;
      const gate = readGateFile(join(activeFolderPath, file));
      if (gate?.generalizable === true && !promotedIds.has(gate.id)) {
        fromActiveFolder.push(gate);
      }
    }
  }

  const flatFileIds = new Set(fromFlatFile.map((g) => g.id));
  return [
    ...fromFlatFile,
    ...fromActiveFolder.filter((g) => !flatFileIds.has(g.id)),
  ];
}

/**
 * Validates a gate before adding it.
 * Returns a list of validation errors, or empty array if valid.
 *
 * @param gate - The gate to validate.
 */

// ── Folder-based API ──────────────────────────────────────────────────────

/**
 * Ensures all gate directories exist under .forgecraft/gates/.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function ensureGateDirs(projectRoot: string): void {
  mkdirSync(join(projectRoot, PROJECT_ACTIVE), { recursive: true });
  mkdirSync(join(projectRoot, PROJECT_PROMOTED), { recursive: true });
  mkdirSync(join(projectRoot, PROJECT_RETIRED), { recursive: true });
  mkdirSync(join(projectRoot, REGISTRY_BASE), { recursive: true });
}

/**
 * Reads a single gate YAML file from disk.
 * Returns null if the file is missing or malformed.
 *
 * @param filePath - Absolute path to the .yaml gate file.
 */
function readGateFile(filePath: string): ProjectGate | null {
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
function readGatesFromDir(dirPath: string): ProjectGate[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readGateFile(join(dirPath, f)))
    .filter((g): g is ProjectGate => g !== null);
}

/**
 * Returns all gates from .forgecraft/gates/project/active/.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function getActiveProjectGates(projectRoot: string): ProjectGate[] {
  return readGatesFromDir(join(projectRoot, PROJECT_ACTIVE));
}

/**
 * Returns all gates from .forgecraft/gates/project/promoted/.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function getPromotedProjectGates(projectRoot: string): ProjectGate[] {
  return readGatesFromDir(join(projectRoot, PROJECT_PROMOTED));
}

/**
 * Returns all gates from .forgecraft/gates/registry/ (all tag subdirectories).
 *
 * @param projectRoot - Absolute path to project root.
 */
export function getRegistryGates(projectRoot: string): ProjectGate[] {
  const registryPath = join(projectRoot, REGISTRY_BASE);
  if (!existsSync(registryPath)) return [];
  const gates: ProjectGate[] = [];
  for (const entry of readdirSync(registryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      gates.push(...readGatesFromDir(join(registryPath, entry.name)));
    }
  }
  return gates;
}

/**
 * Returns all gates applicable to this project: active project gates + registry gates.
 * Also migrates the legacy flat file to active/ on first call if it exists.
 *
 * @param projectRoot - Absolute path to project root.
 */
export function getAllApplicableGates(projectRoot: string): ProjectGate[] {
  migrateFlatFileIfNeeded(projectRoot);
  const active = getActiveProjectGates(projectRoot);
  const activeIds = new Set(active.map((g) => g.id));
  const registry = getRegistryGates(projectRoot).filter(
    (g) => !activeIds.has(g.id),
  );
  return [...active, ...registry];
}

/**
 * Writes a gate to .forgecraft/gates/project/active/{gate.id}.yaml.
 * Creates the directory if it does not exist.
 *
 * @param projectRoot - Absolute path to project root.
 * @param gate - The gate to write.
 */
export function writeProjectGate(projectRoot: string, gate: ProjectGate): void {
  const dir = join(projectRoot, PROJECT_ACTIVE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${gate.id}.yaml`), yamlDump(gate), "utf-8");
}

/**
 * Moves a gate from active/ to promoted/.
 * Throws if the gate file does not exist in active/.
 *
 * @param projectRoot - Absolute path to project root.
 * @param gateId - The gate ID to promote.
 */
export function promoteGate(projectRoot: string, gateId: string): void {
  const activePath = join(projectRoot, PROJECT_ACTIVE, `${gateId}.yaml`);
  const promotedDir = join(projectRoot, PROJECT_PROMOTED);
  const promotedPath = join(promotedDir, `${gateId}.yaml`);
  if (!existsSync(activePath)) {
    throw new Error(`Gate '${gateId}' not found in active/`);
  }
  mkdirSync(promotedDir, { recursive: true });
  renameSync(activePath, promotedPath);
}

/**
 * Moves a gate from active/ to retired/ with deprecatedBy set.
 * Throws if the gate file does not exist in active/.
 *
 * @param projectRoot - Absolute path to project root.
 * @param gateId - The gate ID to retire.
 * @param deprecatedBy - ID of the gate that supersedes this one.
 */
export function retireGate(
  projectRoot: string,
  gateId: string,
  deprecatedBy: string,
): void {
  const activePath = join(projectRoot, PROJECT_ACTIVE, `${gateId}.yaml`);
  if (!existsSync(activePath)) {
    throw new Error(`Gate '${gateId}' not found in active/`);
  }
  const gate = readGateFile(activePath);
  if (!gate) throw new Error(`Failed to read gate '${gateId}'`);

  const retiredDir = join(projectRoot, PROJECT_RETIRED);
  mkdirSync(retiredDir, { recursive: true });

  const retired: ProjectGate = { ...gate, status: "deprecated", deprecatedBy };
  writeFileSync(join(retiredDir, `${gateId}.yaml`), yamlDump(retired), "utf-8");
  unlinkSync(activePath);
}

// ── Migration ─────────────────────────────────────────────────────────────

/**
 * Migrates .forgecraft/project-gates.yaml to per-file active/ structure if it exists
 * and active/ does not yet have any gates.
 * The flat file is left in place for backward compat.
 *
 * @param projectRoot - Absolute path to project root.
 */
function migrateFlatFileIfNeeded(projectRoot: string): void {
  const flatFilePath = join(projectRoot, FLAT_FILE);
  if (!existsSync(flatFilePath)) return;

  const activeDir = join(projectRoot, PROJECT_ACTIVE);
  if (
    existsSync(activeDir) &&
    readdirSync(activeDir).some((f) => f.endsWith(".yaml"))
  ) {
    return;
  }

  const gates = readProjectGates(projectRoot);
  if (gates.length === 0) return;

  ensureGateDirs(projectRoot);
  for (const gate of gates) {
    const dest = join(activeDir, `${gate.id}.yaml`);
    if (!existsSync(dest)) {
      writeFileSync(dest, yamlDump(gate), "utf-8");
    }
  }
}
