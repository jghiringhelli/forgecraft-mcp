/**
 * Config helpers and gate grouping utilities for the start_hardening tool.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { ForgeCraftConfig, ProjectGate } from "../shared/types.js";

// ── Config helpers ───────────────────────────────────────────────────

/**
 * Read project classification tags from forgecraft.yaml.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of tag strings, or empty array if none found
 */
export function readProjectTags(projectDir: string): ReadonlyArray<string> {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return [];
  try {
    const config = yamlLoad(
      readFileSync(yamlPath, "utf-8"),
    ) as ForgeCraftConfig;
    return Array.isArray(config?.tags) ? config.tags : [];
  } catch {
    return [];
  }
}

/**
 * Read project name from forgecraft.yaml or fall back to directory basename.
 *
 * @param projectDir - Absolute path to project root
 * @returns Human-readable project name
 */
export function readProjectName(projectDir: string): string {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const config = yamlLoad(
        readFileSync(yamlPath, "utf-8"),
      ) as ForgeCraftConfig;
      if (config?.projectName) return config.projectName;
    } catch {
      // Fall through
    }
  }
  return projectDir.split(/[\\/]/).pop() ?? "project";
}

/**
 * Read deployment URL from forgecraft.yaml deployment config.
 *
 * @param projectDir - Absolute path to project root
 * @returns Deployment URL or undefined
 */
export function readDeploymentUrl(projectDir: string): string | undefined {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return undefined;
  try {
    const config = yamlLoad(
      readFileSync(yamlPath, "utf-8"),
    ) as ForgeCraftConfig;
    const envs = config?.deployment?.environments;
    if (!envs) return undefined;
    const staging =
      envs["staging"] ?? envs["production"] ?? Object.values(envs)[0];
    return staging?.url;
  } catch {
    return undefined;
  }
}

/**
 * Extract use-case titles from docs/use-cases.md (UC-001, UC-002, …).
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of up to 3 use-case titles
 */
export function readUseCaseTitles(projectDir: string): ReadonlyArray<string> {
  const paths = ["docs/use-cases.md", "docs/UseCases.md"];
  for (const rel of paths) {
    const full = join(projectDir, rel);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8");
    const titles: string[] = [];
    for (const match of content.matchAll(/##\s*(UC-\d+[^#\n]*)/g)) {
      titles.push(match[1]!.trim());
      if (titles.length >= 3) break;
    }
    if (titles.length > 0) return titles;
  }
  return [];
}

// ── Gate grouping ────────────────────────────────────────────────────

/** Phase names matching the ProjectGate.phase union */
export const PRERELEASE_PHASES = new Set(["pre-release"]);
export const RC_PHASES = new Set(["rc"]);
export const LOAD_PHASES = new Set(["deployment", "continuous"]);

/**
 * Filter active project gates by phase group and return their descriptions.
 *
 * @param gates - All active project gates
 * @param phaseSet - Set of phase names to include
 * @returns Array of gate title + passCriterion strings
 */
export function filterGateDescriptions(
  gates: ReadonlyArray<ProjectGate>,
  phaseSet: ReadonlySet<string>,
): string[] {
  return gates
    .filter((g) => phaseSet.has(g.phase))
    .map((g) => `${g.title} — ${g.passCriterion}`);
}
