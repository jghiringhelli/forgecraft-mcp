/**
 * Registry gate sync for refresh_project.
 *
 * Pulls gates matching the project's tags from the remote quality-gates registry,
 * writes them to .forgecraft/gates/registry/{tag}/{id}.yaml, and retires any
 * active project gates that are superseded by a registry gate.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dump as yamlDump } from "js-yaml";
import {
  fetchRemoteGates,
  filterGatesByTags,
  type RemoteGate,
} from "../registry/remote-gates.js";
import { getActiveProjectGates, retireGate } from "../shared/project-gates.js";
import type { ProjectGate } from "../shared/types.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/registry-refresh");

const REGISTRY_DIR = ".forgecraft/gates/registry";

/** Summary of a registry gate sync operation. */
export interface RefreshResult {
  readonly gatesAdded: number;
  readonly gatesUpdated: number;
  readonly projectGatesRetired: number;
  readonly retiredGateIds: readonly string[];
  readonly lastUpdated: string;
}

/**
 * Pulls registry gates matching the project's tags and retires superseded active gates.
 *
 * Falls back to a zero-count result on network failure — never throws.
 *
 * @param projectDir - Absolute path to project root.
 * @param projectTags - Project tags from forgecraft.yaml.
 * @param registryUrl - URL to the registry index.json (falls back to default in remote-gates).
 * @returns Summary of gates added, updated, and retired.
 */
export async function pullRegistryGates(
  projectDir: string,
  projectTags: readonly string[],
  registryUrl?: string,
): Promise<RefreshResult> {
  const lastUpdated = new Date().toISOString();

  const index = await fetchRemoteGates(projectDir, registryUrl);

  // fetchRemoteGates returns gateCount: 0 on network failure — propagate gracefully
  if (index.gateCount === 0 && index.gates.length === 0) {
    logger.warn("Registry returned empty index — skipping gate sync");
    return {
      gatesAdded: 0,
      gatesUpdated: 0,
      projectGatesRetired: 0,
      retiredGateIds: [],
      lastUpdated,
    };
  }

  const normalizedTags = projectTags.map((t) => t.toUpperCase());
  const matchingGates = filterGatesByTags(index, normalizedTags);

  const { added, updated } = writeGatesToDisk(projectDir, matchingGates);

  const baseRegistryDir = join(projectDir, REGISTRY_DIR);
  mkdirSync(baseRegistryDir, { recursive: true });
  writeFileSync(join(baseRegistryDir, "last-updated"), lastUpdated, "utf-8");

  const { retired: projectGatesRetired, retiredGateIds } =
    retireSupersededGates(projectDir, matchingGates);

  logger.info("Registry sync complete", {
    added,
    updated,
    retired: projectGatesRetired,
  });

  return {
    gatesAdded: added,
    gatesUpdated: updated,
    projectGatesRetired,
    retiredGateIds,
    lastUpdated,
  };
}

/**
 * Formats a RefreshResult as human-readable Markdown text.
 *
 * @param result - The result returned by pullRegistryGates.
 * @returns Formatted summary string.
 */
export function formatRefreshResult(result: RefreshResult): string {
  const lines: string[] = [
    "## Registry Refresh Complete",
    "",
    `Registry gates: +${result.gatesAdded} added, ${result.gatesUpdated} updated`,
    `Project gates retired (superseded by registry): ${result.projectGatesRetired}`,
  ];

  for (const id of result.retiredGateIds) {
    lines.push(`  - ${id}`);
  }

  lines.push("", `Last updated: ${result.lastUpdated}`);
  return lines.join("\n");
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Writes each matching registry gate to .forgecraft/gates/registry/{primaryTag}/{id}.yaml.
 *
 * @param projectDir - Absolute path to project root.
 * @param gates - Gates to write.
 * @returns Counts of new and updated files.
 */
function writeGatesToDisk(
  projectDir: string,
  gates: readonly RemoteGate[],
): { added: number; updated: number } {
  let added = 0;
  let updated = 0;

  for (const gate of gates) {
    const primaryTag = (gate.tags?.[0] ?? "universal").toLowerCase();
    const tagDir = join(projectDir, REGISTRY_DIR, primaryTag);
    mkdirSync(tagDir, { recursive: true });

    const filePath = join(tagDir, `${gate.id}.yaml`);
    const existed = existsSync(filePath);
    writeFileSync(filePath, yamlDump(gate), "utf-8");

    if (existed) {
      updated++;
    } else {
      added++;
    }
  }

  return { added, updated };
}

/**
 * Moves active project gates to retired/ when superseded by a registry gate.
 *
 * @param projectDir - Absolute path to project root.
 * @param registryGates - Registry gates to compare against.
 * @returns Count and IDs of retired gates.
 */
function retireSupersededGates(
  projectDir: string,
  registryGates: readonly RemoteGate[],
): { retired: number; retiredGateIds: string[] } {
  const activeGates = getActiveProjectGates(projectDir);
  const retiredGateIds: string[] = [];

  for (const activeGate of activeGates) {
    const superseding = registryGates.find((rg) =>
      isSupersededBy(activeGate, rg),
    );
    if (!superseding) continue;

    try {
      retireGate(projectDir, activeGate.id, superseding.id);
      retiredGateIds.push(activeGate.id);
      logger.info("Active gate retired — superseded by registry gate", {
        activeGateId: activeGate.id,
        registryGateId: superseding.id,
      });
    } catch (error) {
      logger.warn("Failed to retire gate", { gateId: activeGate.id, error });
    }
  }

  return { retired: retiredGateIds.length, retiredGateIds };
}

/**
 * Returns true when the active project gate is superseded by the given registry gate.
 *
 * Match criteria: same domain (vs category), same phase, identical first 50 chars of
 * normalized check text.
 *
 * @param activeGate - An active project gate.
 * @param registryGate - A candidate registry gate.
 */
function isSupersededBy(
  activeGate: ProjectGate,
  registryGate: RemoteGate,
): boolean {
  const activeDomain = (activeGate.domain ?? "").toLowerCase();
  const registryDomain = registryGate.category.toLowerCase();
  if (activeDomain !== registryDomain) return false;

  const activePhase = (activeGate.phase ?? "").toLowerCase();
  const registryPhase = registryGate.phase.toLowerCase();
  if (activePhase !== registryPhase) return false;

  const activeCheck = normalizeCheckText(activeGate.check ?? "");
  const registryCheck = normalizeCheckText(registryGate.check);
  return activeCheck.length > 0 && activeCheck === registryCheck;
}

/**
 * Normalizes check text for comparison: lowercase, collapse whitespace, first 50 chars.
 */
function normalizeCheckText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 50);
}
