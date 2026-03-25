/**
 * check_cascade tool handler.
 *
 * Verifies that the GS initialization cascade (§6.2 of the white paper) is
 * complete before implementation begins. Acts as the derivability gate: a
 * stateless agent given the artifact set should be able to derive any valid
 * implementation state without further human direction.
 *
 * Five-step cascade (§6.2):
 *   1. Functional specification  — user-facing behavior and domain model
 *   2. Architecture + C4 diagrams — layered structure and component map
 *   3. Architectural constitution — operative grammar (CLAUDE.md / equivalent)
 *   4. ADRs                       — non-obvious decisions recorded before impl
 *   5. Use cases + behavioral contracts / Status.md next steps
 */

import { z } from "zod";
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import type { CascadeDecision, ForgeCraftConfig } from "../shared/types.js";
import {
  CascadeStep as _CascadeStep,
  checkFunctionalSpec,
  checkDiagrams,
  checkConstitution,
  loadForgeCraftConfig as _loadForgeCraftConfig,
} from "./check-cascade-steps.js";
import {
  checkAdrs,
  checkBehavioralContracts,
} from "./check-cascade-contracts.js";
import {
  writeInitialSessionPromptIfAbsent,
  formatReport,
} from "./check-cascade-report.js";

export type { CascadeStep } from "./check-cascade-steps.js";
export {
  isStub,
  loadForgeCraftConfig,
  CONSTITUTION_PATHS,
  FUNCTIONAL_SPEC_PATHS,
  ADR_DIRS,
  USE_CASE_PATHS,
  CONSTITUTION_LINE_LIMIT,
  PYTHON_PACKAGE_FILES,
  checkFunctionalSpec,
  checkDiagrams,
  checkConstitution,
  detectUnsafeDeserializationCast,
  findFunctionalSpecFallback,
} from "./check-cascade-steps.js";
export {
  findBehavioralContractFallback,
  detectPlaceholderTestScript,
  checkAdrs,
  checkBehavioralContracts,
} from "./check-cascade-contracts.js";
export { writeInitialSessionPromptIfAbsent, formatReport } from "./check-cascade-report.js";

// ── Schema ───────────────────────────────────────────────────────────

export const checkCascadeSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root to verify."),
});

export type CheckCascadeInput = z.infer<typeof checkCascadeSchema>;

// ── Config Loader ─────────────────────────────────────────────────────

/**
 * Load cascade decisions from forgecraft.yaml in the project directory.
 * Returns an empty array if no config or no cascade.steps exist.
 *
 * @param projectDir - Absolute project root path
 * @returns Array of cascade decisions (may be empty)
 */
export function loadCascadeDecisions(projectDir: string): CascadeDecision[] {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return [];
  try {
    const config = yaml.load(readFileSync(yamlPath, "utf-8")) as ForgeCraftConfig;
    return (config?.cascade?.steps as CascadeDecision[] | undefined) ?? [];
  } catch {
    return [];
  }
}

// ── Core Logic ────────────────────────────────────────────────────────

/**
 * Run all five GS cascade checks on the given project directory.
 *
 * @param projectDir - Absolute project root path
 * @param decisions - Optional cascade decisions from forgecraft.yaml
 * @returns Array of five cascade step results
 */
export function runCascadeChecks(
  projectDir: string,
  decisions: readonly CascadeDecision[] = [],
): _CascadeStep[] {
  const rawSteps = [
    checkFunctionalSpec(projectDir),
    checkDiagrams(projectDir),
    checkConstitution(projectDir),
    checkAdrs(projectDir),
    checkBehavioralContracts(projectDir),
  ];

  if (decisions.length === 0) return rawSteps;
  return rawSteps.map((step) => applyDecision(step, decisions));
}

/** The cascade step name for each step number, used for decision lookup. */
export const STEP_TO_DECISION_NAME: Readonly<Record<number, string>> = {
  1: "functional_spec",
  2: "architecture_diagrams",
  3: "constitution",
  4: "adrs",
  5: "behavioral_contracts",
};

/**
 * Apply a cascade decision to a step result.
 *
 * @param step - Raw step result from the file-system check
 * @param decisions - All cascade decisions from forgecraft.yaml
 * @returns Step with SKIP applied when appropriate
 */
function applyDecision(
  step: _CascadeStep,
  decisions: readonly CascadeDecision[],
): _CascadeStep {
  const decisionName = STEP_TO_DECISION_NAME[step.step];
  const decision = decisions.find((d) => d.step === decisionName);

  if (!decision) return step;
  if (decision.required) return step;
  if (step.status === "FAIL" || step.status === "STUB" || step.status === "WARN") {
    return {
      step: step.step,
      name: step.name,
      status: "SKIP",
      detail: decision.rationale,
      questions: [],
    };
  }
  return step;
}

/**
 * Run the GS cascade check on the given project directory.
 *
 * @param args - Validated input matching checkCascadeSchema
 * @returns MCP-style content array with a formatted derivability report
 */
export async function checkCascadeHandler(
  args: CheckCascadeInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = resolve(args.project_dir);
  const decisions = loadCascadeDecisions(projectDir);
  const steps = runCascadeChecks(projectDir, decisions);

  const passingCount = steps.filter((s) => s.status === "PASS").length;
  const failingCount = steps.filter((s) => s.status === "FAIL" || s.status === "STUB").length;
  const noCascadeConfig = decisions.length === 0;

  if (failingCount === 0) {
    writeInitialSessionPromptIfAbsent(projectDir);
  }

  return {
    content: [{ type: "text", text: formatReport(steps, passingCount, failingCount, noCascadeConfig) }],
  };
}

// ── Exported Helpers ─────────────────────────────────────────────────

/**
 * Returns true only when all cascade steps are PASS, WARN, or SKIP.
 *
 * @param steps - All cascade step results
 * @returns Whether the cascade is complete enough to proceed
 */
export function isCascadeComplete(steps: readonly _CascadeStep[]): boolean {
  return steps.every((s) => s.status === "PASS" || s.status === "WARN" || s.status === "SKIP");
}

/**
 * Produce a guided remediation message for the first failing or stub step.
 *
 * @param steps - All cascade step results
 * @returns Markdown-formatted remediation guidance
 */
export function buildGuidedRemediation(steps: readonly _CascadeStep[]): string {
  const failing = steps.filter((s) => s.status === "FAIL" || s.status === "STUB");
  if (failing.length === 0) return "All cascade steps are complete.";

  const firstFailing = failing[0]!;
  const allFailingList = failing
    .map((s) => {
      const icon = s.status === "STUB" ? "⚠ STUB" : "❌ FAIL";
      return `- Step ${s.step}: **${s.name}** — ${icon}`;
    })
    .join("\n");

  let text = `### Failing Cascade Steps\n\n${allFailingList}\n\n`;
  text += `### Fix This First: Step ${firstFailing.step} — ${firstFailing.name}\n\n`;
  text += `${firstFailing.detail}\n\n`;

  if (firstFailing.questions.length > 0) {
    text += `**Answer these questions to fill the artifact:**\n\n`;
    for (const q of firstFailing.questions) text += `- ${q}\n`;
    text += `\n`;
  }

  const artifactPath = getArtifactPath(firstFailing.step);
  text += `**Artifact to create/update:** \`${artifactPath}\`\n\n`;
  text += `Answer these questions. I will create \`${artifactPath}\` from your answers and then check the cascade again.`;

  return text;
}

/**
 * Return the canonical artifact path for a given cascade step number.
 *
 * @param step - Cascade step number (1-5)
 * @returns Relative artifact path
 */
export function getArtifactPath(step: number): string {
  switch (step) {
    case 1: return "docs/PRD.md";
    case 2: return "docs/diagrams/c4-context.md";
    case 3: return "CLAUDE.md";
    case 4: return "docs/adrs/ADR-0001.md";
    case 5: return "docs/use-cases.md";
    default: return "docs/";
  }
}
