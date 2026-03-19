/**
 * set_cascade_requirement tool handler.
 *
 * Allows the AI assistant or user to revise a cascade decision for a specific step.
 * Updates forgecraft.yaml under cascade.steps. This is how the brain (AI) updates
 * the map (tool enforcement).
 */

import { z } from "zod";
import { join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import type { ForgeCraftConfig, CascadeDecision, CascadeStepName } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

const CASCADE_STEP_NAMES = [
  "functional_spec",
  "architecture_diagrams",
  "constitution",
  "adrs",
  "behavioral_contracts",
] as const;

export const setCascadeRequirementSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root containing forgecraft.yaml."),
  step: z
    .enum(CASCADE_STEP_NAMES as unknown as [string, ...string[]])
    .describe(
      "Which cascade step to configure: functional_spec | architecture_diagrams | " +
      "constitution | adrs | behavioral_contracts.",
    ),
  required: z
    .boolean()
    .describe(
      "Whether this step must pass before implementation begins. " +
      "true = required (blocks progress). false = optional (shown as ○ SKIP).",
    ),
  rationale: z
    .string()
    .min(10)
    .describe(
      "Why was this decision made? Explain the reasoning so future reviewers " +
      "understand the intent without re-deriving it.",
    ),
  decided_by: z
    .enum(["assistant", "user"])
    .optional()
    .describe("Who made this decision. Defaults to 'assistant'."),
});

export type SetCascadeRequirementInput = z.infer<typeof setCascadeRequirementSchema>;

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Update or create a cascade decision in forgecraft.yaml.
 *
 * @param args - Validated input matching `setCascadeRequirementSchema`
 * @returns MCP-style content array with confirmation message
 */
export async function setCascadeRequirementHandler(
  args: SetCascadeRequirementInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = resolve(args.project_dir);
  const yamlPath = join(projectDir, "forgecraft.yaml");

  const config = loadOrCreateConfig(yamlPath, projectDir);
  const updatedDecision = buildDecision(args);
  const updatedSteps = upsertDecision(config.cascade?.steps ?? [], updatedDecision);

  const updatedConfig: Record<string, unknown> = {
    ...(config as unknown as Record<string, unknown>),
    cascade: { steps: updatedSteps },
  };

  writeFileSync(yamlPath, yaml.dump(updatedConfig, { lineWidth: 120 }), "utf-8");

  const statusLabel = args.required ? "REQUIRED" : "OPTIONAL";
  const icon = args.required ? "✓" : "○";
  const text =
    `${icon} Updated cascade decision for \`${args.step}\`: **${statusLabel}**\n` +
    `Rationale: ${args.rationale}\n` +
    `Decided by: ${args.decided_by ?? "assistant"} on ${updatedDecision.decidedAt}\n\n` +
    `Run \`check_cascade\` to see the updated gate status.`;

  return { content: [{ type: "text", text }] };
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Load forgecraft.yaml if it exists, otherwise return an empty config object.
 *
 * @param yamlPath - Absolute path to forgecraft.yaml
 * @param projectDir - Project root (used in error context)
 * @returns Parsed config or empty object
 */
function loadOrCreateConfig(yamlPath: string, projectDir: string): ForgeCraftConfig {
  if (!existsSync(yamlPath)) {
    return { projectName: projectDir.split(/[\\/]/).pop() } as ForgeCraftConfig;
  }
  try {
    return (yaml.load(readFileSync(yamlPath, "utf-8")) as ForgeCraftConfig) ?? {};
  } catch {
    return {};
  }
}

/**
 * Build a new CascadeDecision from handler input.
 *
 * @param args - Validated handler input
 * @returns New CascadeDecision with today's date
 */
function buildDecision(args: SetCascadeRequirementInput): CascadeDecision {
  return {
    step: args.step as CascadeStepName,
    required: args.required,
    rationale: args.rationale,
    decidedAt: new Date().toISOString().slice(0, 10),
    decidedBy: (args.decided_by ?? "assistant") as "assistant" | "user",
  };
}

/**
 * Insert or replace a decision for the given step.
 *
 * @param existing - Current steps array from forgecraft.yaml
 * @param decision - The new decision to upsert
 * @returns Updated steps array
 */
function upsertDecision(
  existing: readonly CascadeDecision[],
  decision: CascadeDecision,
): CascadeDecision[] {
  const withoutStep = existing.filter((d) => d.step !== decision.step);
  return [...withoutStep, decision];
}
