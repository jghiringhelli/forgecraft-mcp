/**
 * cascade-defaults: Derive default cascade decisions from project tags.
 * The AI may revise these decisions at any time via set_cascade_requirement.
 *
 * Rules:
 *   - Apply MOST RESTRICTIVE when multiple tags apply: if any tag requires a step, it is required.
 *   - Rationale strings explain WHY for the resolved tag combination.
 *   - If no recognized tags are present, all steps default to required (fail-safe).
 */

import type { CascadeDecision, CascadeStepName } from "../shared/types.js";

// ── Tag defaults table ──────────────────────────────────────────────────

type StepRequirement = "required" | "optional";
type StepDefaults = Record<CascadeStepName, StepRequirement>;

/** Per-tag defaults for each cascade step. */
const TAG_STEP_DEFAULTS: Readonly<Record<string, StepDefaults>> = {
  CLI: {
    functional_spec: "required",
    architecture_diagrams: "optional",
    constitution: "required",
    adrs: "optional",
    behavioral_contracts: "optional",
  },
  LIBRARY: {
    functional_spec: "required",
    architecture_diagrams: "required",
    constitution: "required",
    adrs: "required",
    behavioral_contracts: "required",
  },
  API: {
    functional_spec: "required",
    architecture_diagrams: "required",
    constitution: "required",
    adrs: "required",
    behavioral_contracts: "required",
  },
};

/** Fallback used when no recognized tags are present. */
const UNIVERSAL_DEFAULTS: StepDefaults = {
  functional_spec: "required",
  architecture_diagrams: "required",
  constitution: "required",
  adrs: "optional",
  behavioral_contracts: "optional",
};

const ALL_STEP_NAMES: readonly CascadeStepName[] = [
  "functional_spec",
  "architecture_diagrams",
  "constitution",
  "adrs",
  "behavioral_contracts",
];

// ── Rationale generators ────────────────────────────────────────────────

/**
 * Return the artifact file name associated with a cascade step.
 *
 * @param step - Cascade step name
 * @returns Canonical relative artifact path
 */
function artifactFor(step: CascadeStepName): string {
  const map: Record<CascadeStepName, string> = {
    functional_spec: "docs/PRD.md",
    architecture_diagrams: "docs/diagrams/c4-context.md",
    constitution: "CLAUDE.md",
    adrs: "docs/adrs/",
    behavioral_contracts: "docs/use-cases.md",
  };
  return map[step];
}

/**
 * Build a rationale string for a step given the resolved requirement,
 * the recognized tags that drove the decision, and the project name.
 *
 * @param step - Cascade step name
 * @param required - Whether the step was resolved as required
 * @param specificTags - Specific tags present (CLI/LIBRARY/API)
 * @param hasUniversal - Whether UNIVERSAL tag is present
 * @param projectName - Human-readable project name used to personalise the rationale
 * @returns Human-readable rationale string
 */
function buildRationale(
  step: CascadeStepName,
  required: boolean,
  specificTags: readonly string[],
  hasUniversal: boolean,
  projectName: string,
): string {
  const recognizedTags = specificTags;
  const tagLabel = recognizedTags.length > 0
    ? recognizedTags.join("+")
    : hasUniversal ? "UNIVERSAL" : "project";
  const artifact = artifactFor(step);

  if (step === "functional_spec") {
    return required
      ? `All projects require a functional specification (${artifact}); it is the axiom set from which all other artifacts are derived.`
      : `Functional specification is required for all projects — this case should not occur.`;
  }

  if (step === "constitution") {
    return required
      ? `All projects require an architectural constitution (${artifact}); it is the operative grammar that constrains every AI coding session.`
      : `Architectural constitution is required for all projects — this case should not occur.`;
  }

  if (step === "architecture_diagrams") {
    if (required) {
      const reasons: Record<string, string> = {
        API: `API projects expose public contracts; C4 diagram (${artifact}) is the spec for integration partners and AI assistants navigating the service boundary.`,
        LIBRARY: `Library consumers need a clear architecture overview (${artifact}) to understand integration points and module boundaries.`,
      };
      for (const tag of recognizedTags) {
        if (reasons[tag]) return reasons[tag];
      }
      // UNIVERSAL fallback or no recognized tags — include projectName for personalisation
      return `Default: system context diagram (${artifact}) helps orient AI assistants and integration partners for ${projectName}. Override to optional for simple single-binary tools.`;
    }
    return `Single-binary CLI; no external integration surface requiring a system context diagram (${artifact}). Diagrams can be added later if the surface grows.`;
  }

  if (step === "adrs") {
    if (required) {
      const reasons: Record<string, string> = {
        API: `API design decisions (versioning, auth strategy, pagination contract) must be recorded in ${artifact} before implementation to prevent AI assistants from "improving" intentional choices.`,
        LIBRARY: `Library design decisions (API surface, versioning strategy, compatibility guarantees) must be recorded in ${artifact} for consumer clarity.`,
      };
      for (const tag of recognizedTags) {
        if (reasons[tag]) return reasons[tag];
      }
      return `${tagLabel} project: ADRs in ${artifact} required to document non-obvious decisions before implementation begins.`;
    }
    return `${tagLabel}: architectural decisions are usually self-evident from the code structure. ADRs in ${artifact} are recommended but not required. Add them as complexity grows.`;
  }

  if (step === "behavioral_contracts") {
    if (required) {
      const reasons: Record<string, string> = {
        API: `API behavioral contracts (${artifact}) define the integration surface for consumers — required before any endpoint is implemented.`,
        LIBRARY: `Library consumers depend on stable behavioral contracts (${artifact}); these are the triple-derivation seed: implementation contract, acceptance test, and user documentation.`,
      };
      for (const tag of recognizedTags) {
        if (reasons[tag]) return reasons[tag];
      }
      return `${tagLabel} project: behavioral contracts in ${artifact} required to seed implementation, acceptance tests, and documentation.`;
    }
    return `${tagLabel}: behavioral contracts in ${artifact} are recommended for complex logic but not required for a ${tagLabel.toLowerCase()} project. Add them when the command surface grows.`;
  }

  // Unreachable, but satisfies exhaustive-check requirement
  return required
    ? `${step} required for ${tagLabel} project.`
    : `${step} optional for ${tagLabel} project.`;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Derive default cascade decisions from project tags using the tag defaults table.
 *
 * Rules:
 *   - Most restrictive wins: if any recognized tag marks a step "required", it is required.
 *   - If UNIVERSAL is present but no specific tags (CLI/LIBRARY/API), UNIVERSAL_DEFAULTS apply.
 *   - If no recognized tags at all (not even UNIVERSAL), all steps default to required (fail-safe).
 *   - functional_spec and constitution are always required regardless of tags.
 *
 * @param tags - Project classification tags from forgecraft.yaml
 * @param projectName - Human-readable project name included in rationale strings
 * @returns Array of five cascade decisions, one per step
 */
export function deriveDefaultCascadeDecisions(
  tags: readonly string[],
  projectName: string,
): CascadeDecision[] {
  const specificTags = tags.filter((t) => TAG_STEP_DEFAULTS[t] !== undefined);
  const hasUniversal = tags.includes("UNIVERSAL");
  const decidedAt = new Date().toISOString().slice(0, 10);

  return ALL_STEP_NAMES.map((step) => {
    const required = resolveRequirement(step, specificTags, hasUniversal);
    const rationale = buildRationale(step, required, specificTags, hasUniversal, projectName);

    return {
      step,
      required,
      rationale: rationale.replace(/\s+/g, " ").trim(),
      decidedAt,
      decidedBy: "scaffold" as const,
    };
  });
}

/**
 * Resolve whether a step is required given the recognized tags.
 *
 * Rules (in order):
 *   1. functional_spec and constitution are always required.
 *   2. If no recognized specific tags and no UNIVERSAL → fail-safe: all required.
 *   3. If only UNIVERSAL → UNIVERSAL_DEFAULTS.
 *   4. If specific tags present → most restrictive: required if ANY requires it.
 *
 * @param step - Cascade step name
 * @param specificTags - Tags with explicit defaults (CLI, LIBRARY, API)
 * @param hasUniversal - Whether UNIVERSAL tag is present
 * @returns Whether the step is required
 */
function resolveRequirement(
  step: CascadeStepName,
  specificTags: readonly string[],
  hasUniversal: boolean,
): boolean {
  // Always required
  if (step === "functional_spec" || step === "constitution") return true;

  if (specificTags.length === 0) {
    // No specific tags — check for UNIVERSAL
    if (!hasUniversal) return true; // fail-safe: no recognized tags at all → all required
    return UNIVERSAL_DEFAULTS[step] === "required"; // UNIVERSAL_DEFAULTS
  }

  // Most restrictive: required if ANY specific tag requires it
  for (const tag of specificTags) {
    const defaults = TAG_STEP_DEFAULTS[tag];
    if (defaults && defaults[step] === "required") return true;
  }
  return false;
}
