/**
 * Shared config readers for forgecraft.yaml.
 * Provides typed accessors for optional config blocks.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { ExperimentConfig } from "./types.js";

/**
 * Reads the `experiment` block from forgecraft.yaml, if present and valid.
 * Returns undefined when the file is absent, the block is missing, or
 * the required `id` field is empty.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Parsed ExperimentConfig, or undefined if not configured
 */
export function readExperimentConfig(
  projectDir: string,
): ExperimentConfig | undefined {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return undefined;

  let raw: unknown;
  try {
    raw = yaml.load(readFileSync(yamlPath, "utf-8"));
  } catch {
    return undefined;
  }

  if (!raw || typeof raw !== "object") return undefined;

  const config = raw as Record<string, unknown>;
  const experiment = config["experiment"];
  if (!experiment || typeof experiment !== "object") return undefined;

  const exp = experiment as Record<string, unknown>;
  const id = exp["id"];
  if (typeof id !== "string" || id.trim() === "") return undefined;

  const type = exp["type"];
  const group = exp["group"];

  return {
    id: id.trim(),
    type: isValidExperimentType(type) ? type : "greenfield",
    group: isValidExperimentGroup(group) ? group : "gs",
  };
}

function isValidExperimentType(
  value: unknown,
): value is ExperimentConfig["type"] {
  return (
    value === "greenfield" ||
    value === "brownfield" ||
    value === "takeover" ||
    value === "migration"
  );
}

function isValidExperimentGroup(
  value: unknown,
): value is ExperimentConfig["group"] {
  return value === "gs" || value === "control";
}
