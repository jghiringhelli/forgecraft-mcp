/**
 * setup-phase2: Phase 2 response and cascade decision builders.
 */

import type { CascadeDecision } from "../shared/types.js";
import { deriveDefaultCascadeDecisions } from "./cascade-defaults.js";

// ── Cascade Decision Derivation ───────────────────────────────────────

/** Canonical artifact path for each cascade step (for display). */
const STEP_ARTIFACT_DISPLAY: Record<string, string> = {
  functional_spec: "PRD.md",
  architecture_diagrams: "c4-context.md",
  constitution: "CLAUDE.md",
  adrs: "docs/adrs/",
  behavioral_contracts: "use-cases.md",
};

/**
 * Derive cascade decisions, applying phase-2 overrides on top of tag defaults.
 *
 * @param tags - Inferred project tags
 * @param projectName - Project name for rationale strings
 * @param mvp - True if MVP stage
 * @param scopeComplete - True if scope is finalized
 * @param hasConsumers - True if existing users or consumers
 * @returns Array of five cascade decisions
 */
export function deriveCascadeDecisions(
  tags: readonly string[],
  projectName: string,
  mvp: boolean,
  scopeComplete: boolean,
  hasConsumers: boolean,
): CascadeDecision[] {
  const base = deriveDefaultCascadeDecisions(tags, projectName);
  const decidedAt = new Date().toISOString().slice(0, 10);

  return base.map((decision) => {
    let required = decision.required;
    let rationale = decision.rationale;

    if (decision.step === "architecture_diagrams" && mvp && required) {
      required = false;
      rationale = `MVP stage: architecture diagram deferred — revisit at production phase.`;
    }
    if (decision.step === "adrs" && (mvp || !scopeComplete) && required) {
      const reason = !scopeComplete ? "scope still evolving" : "MVP stage";
      required = false;
      rationale = `ADRs are optional (${reason}): decisions are not yet stable. Add them when scope solidifies.`;
    }
    if (decision.step === "behavioral_contracts" && hasConsumers) {
      required = true;
      rationale = `Existing consumers detected: behavioral contracts (docs/use-cases.md) are required for breaking-change detection.`;
    }

    return {
      ...decision,
      required,
      rationale,
      decidedAt,
      decidedBy: "scaffold" as const,
    };
  });
}

// ── Phase 2 Response Builder ──────────────────────────────────────────

export interface Phase2ResponseParams {
  readonly decisions: CascadeDecision[];
  readonly tags: string[];
  readonly mvp: boolean;
  readonly scopeComplete: boolean;
  readonly hasConsumers: boolean;
  readonly prdWritten: boolean;
  readonly useCasesWritten: boolean;
  readonly yamlWritten: boolean;
  readonly scaffoldText: string;
  readonly sensitiveData?: boolean;
  readonly mcpServerNames: string[];
  readonly projectDir: string;
  readonly indexMdWritten: boolean;
  readonly coreMdWritten: boolean;
  readonly adrIndexWritten: boolean;
  readonly gatesIndexWritten: boolean;
  readonly gitInitStatus?: string;
  readonly isBrownfield?: boolean;
}

/**
 * Build the phase 2 completion response.
 *
 * @param params - Response parameters
 * @returns Formatted markdown completion message
 */
export function buildPhase2Response(params: Phase2ResponseParams): string {
  const {
    decisions,
    tags,
    mvp,
    scopeComplete,
    hasConsumers,
    prdWritten,
    useCasesWritten,
    yamlWritten,
    indexMdWritten,
    coreMdWritten,
    adrIndexWritten,
    gatesIndexWritten,
  } = params;
  const stageLabel = mvp ? "MVP" : "Production";
  const tagLabel =
    tags.filter((t) => t !== "UNIVERSAL").join(", ") || "UNIVERSAL";

  let text = `## Project Setup Complete\n\n`;
  text += `### Cascade decisions (based on ${stageLabel} + tags [${tagLabel}]):\n`;

  for (const d of decisions) {
    const icon = d.required ? "✓" : "○";
    const label = d.required ? "required" : "optional";
    const note = buildDecisionNote(d, mvp, scopeComplete, hasConsumers);
    text += `  ${icon} ${d.step} — ${label}${note}\n`;
  }

  if (params.sensitiveData) {
    text += `\n⚠ Sensitive data detected: This project handles sensitive data.\n`;
    text += `  forgecraft.yaml has been set to sensitiveData: true.\n`;
    text += `  Review: compliance gates have been added to required steps.\n`;
  }

  text += `\n### Artifacts created:\n`;
  if (yamlWritten) text += `  forgecraft.yaml (with cascade decisions)\n`;
  if (prdWritten) text += `  docs/PRD.md (from spec)\n`;
  if (useCasesWritten) text += `  docs/use-cases.md (from spec)\n`;
  if (indexMdWritten) text += `  .claude/index.md (CNT routing root)\n`;
  if (coreMdWritten)
    text += `  .claude/core.md (CNT always-loaded invariants)\n`;
  if (adrIndexWritten)
    text += `  .claude/adr/index.md (ADR navigation index)\n`;
  if (gatesIndexWritten)
    text += `  .claude/gates/index.md (active quality gates)\n`;

  const scaffoldFiles = extractScaffoldFiles(params.scaffoldText);
  for (const f of scaffoldFiles) text += `  ${f}\n`;

  if (!prdWritten && !yamlWritten && scaffoldFiles.length === 0)
    text += `  (all artifacts already existed — nothing overwritten)\n`;

  if (params.mcpServerNames.length > 0) {
    text += `\n### MCP Tools Configured\n`;
    for (const name of params.mcpServerNames) text += `  ${name}\n`;
  }

  if (params.gitInitStatus) text += `\n### Git\n  ${params.gitInitStatus}\n`;

  text += `\n### Next step — call this now:\n`;
  text += `\`\`\`\naction: "check_cascade"\nproject_dir: "${params.projectDir ?? ""}"\n\`\`\`\n`;
  if (params.isBrownfield) {
    text += `Do not ask the user — run check_cascade immediately. When it passes, run audit_project to surface any existing violations in this brownfield codebase before writing new code.`;
  } else {
    text += `Do not ask the user — run check_cascade immediately. If it passes, run generate_session_prompt for the first roadmap item.`;
  }
  return text;
}

/**
 * Build a parenthetical note explaining a cascade decision override.
 */
export function buildDecisionNote(
  decision: CascadeDecision,
  mvp: boolean,
  scopeComplete: boolean,
  hasConsumers: boolean,
): string {
  if (decision.step === "architecture_diagrams" && !decision.required && mvp)
    return " (MVP stage, revisit at production)";
  if (decision.step === "adrs" && !decision.required)
    return scopeComplete ? " (MVP stage)" : " (scope still evolving)";
  if (
    decision.step === "behavioral_contracts" &&
    decision.required &&
    hasConsumers
  )
    return " (existing consumers detected)";
  return "";
}

/**
 * Render the Cascade Decisions section for scaffold output.
 */
export function renderCascadeDecisionsSection(
  decisions: readonly CascadeDecision[],
): string {
  let text = `\n\n## Cascade Decisions (Step 0)\n\n`;
  text += `The following spec artifacts have been assessed for this project:\n\n`;
  for (const decision of decisions) {
    const icon = decision.required ? "✓" : "○";
    const artifact = STEP_ARTIFACT_DISPLAY[decision.step] ?? decision.step;
    const label = decision.required
      ? `required (${artifact})`
      : `optional — ${decision.rationale.split(".")[0]}`;
    text += `  ${icon} ${decision.step} — ${label}\n`;
  }
  text += `\nReview these decisions. To revise: use \`set_cascade_requirement\` or edit\n`;
  text += `forgecraft.yaml under \`cascade.steps\`. These decisions determine which\n`;
  text += `artifacts are gated before implementation can begin.\n`;
  return text;
}

/**
 * Extract file paths listed in a scaffold response text.
 */
function extractScaffoldFiles(scaffoldText: string): string[] {
  const matches = scaffoldText.match(
    /^\s{2}([^\n]+\.(md|yaml|json|ts|js|sh))/gm,
  );
  if (!matches) return [];
  return matches
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .slice(0, 12);
}
