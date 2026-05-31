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
  readonly sampleOutcomeWritten: boolean;
  readonly toolSampleSplit?: "tool_and_sample" | "tool_only" | "content_only";
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
  readonly adrsExtracted?: number;
  readonly ucCount?: number;
  readonly specPath?: string;
  readonly operationClassificationWritten?: boolean;
  readonly subDocStubsWritten?: string[];
  readonly agentsWritten?: string[];
  /** FC QG remote gates relevant to active tags — used to generate tailoring checklist. */
  readonly remoteGates?: readonly {
    id: string;
    title: string;
    gsProperty: string;
  }[];
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
  if (prdWritten)
    text += `  docs/PRD.md (from spec — focuses on the core tool)\n`;
  if (useCasesWritten) text += `  docs/use-cases.md (from spec)\n`;
  if (params.sampleOutcomeWritten)
    text += `  docs/sample-outcome.md (first real deliverable of the core tool)\n`;
  if (indexMdWritten) text += `  .claude/index.md (CNT routing root)\n`;
  if (coreMdWritten)
    text += `  .claude/core.md (CNT always-loaded invariants)\n`;
  if (adrIndexWritten)
    text += `  .claude/adr/index.md (ADR navigation index)\n`;
  if (gatesIndexWritten)
    text += `  .claude/gates/index.md (active quality gates)\n`;

  const scaffoldFiles = extractScaffoldFiles(params.scaffoldText);
  for (const f of scaffoldFiles) text += `  ${f}\n`;

  if (params.operationClassificationWritten)
    text += `  docs/operation-classification.md (Tier 0–3 gate reference)\n`;
  if (params.subDocStubsWritten && params.subDocStubsWritten.length > 0) {
    for (const f of params.subDocStubsWritten)
      text += `  ${f} (stub — populate from spec)\n`;
  }
  if (params.agentsWritten && params.agentsWritten.length > 0) {
    for (const f of params.agentsWritten)
      text += `  .claude/agents/${f} (sub-agent)\n`;
  }

  if (!prdWritten && !yamlWritten && scaffoldFiles.length === 0)
    text += `  (all artifacts already existed — nothing overwritten)\n`;

  if (params.adrsExtracted && params.adrsExtracted > 0) {
    text += `  docs/adrs/active/ (${params.adrsExtracted} ADRs extracted from spec)\n`;
  }

  if (params.mcpServerNames.length > 0) {
    text += `\n### MCP Tools Configured\n`;
    for (const name of params.mcpServerNames) text += `  ${name}\n`;
  }

  if (params.gitInitStatus) text += `\n### Git\n  ${params.gitInitStatus}\n`;

  if (params.toolSampleSplit === "tool_and_sample") {
    text += `\n### 🔀 Tool vs. Sample Output — Split Applied\n`;
    text += `  The PRD covers the **core generative tool**.\n`;
    text += `  \`docs/sample-outcome.md\` holds the specific creative work from the spec.\n`;
    text += `  Fill in that file, then use it as the first acceptance test:\n`;
    text += `  the tool is done when it can produce that specific outcome.\n`;
  }

  // FC QG remote gates available for this tag set
  if (params.remoteGates && params.remoteGates.length > 0) {
    text += `\n### Quality Gates Available (FC QG — ${params.remoteGates.length} gates for active tags)\n`;
    const byProperty: Record<string, string[]> = {};
    for (const g of params.remoteGates) {
      (byProperty[g.gsProperty] ??= []).push(`${g.id}: ${g.title}`);
    }
    for (const [prop, ids] of Object.entries(byProperty)) {
      text += `  [${prop}] ${ids.join(", ")}\n`;
    }
    text += `  Run \`analyze_harness\` after setup to compare installed vs available.\n`;
  }

  if (params.isBrownfield) {
    text += `\n### Next step — call this now:\n`;
    text += `\`\`\`\naction: "check_cascade"\nproject_dir: "${params.projectDir ?? ""}"\n\`\`\`\n`;
    text += `Do not ask the user — run check_cascade immediately. When it passes, run audit_project to surface any existing violations in this brownfield codebase before writing new code.`;
  } else {
    text += `\n### Greenfield artifact sequence — run in order:\n\n`;
    if (params.ucCount && params.ucCount > 0) {
      text += `**L1 artifacts (just created):**\n`;
    } else {
      text += `**L1 artifacts (created — populate docs/ files from spec):**\n`;
    }
    text += `  ✅ forgecraft.yaml + CLAUDE.md + .claude/ + hooks\n`;
    text += `  ✅ docs/PRD.md\n`;
    if (params.ucCount && params.ucCount > 0) {
      text += `  ✅ docs/use-cases.md (${params.ucCount} spec-derived use cases)\n`;
    } else {
      text += `  ⚠ docs/use-cases.md (generic stubs — fill in real UCs from spec)\n`;
    }
    if (params.adrsExtracted && params.adrsExtracted > 0) {
      text += `  ✅ docs/adrs/active/ (${params.adrsExtracted} ADRs from spec)\n`;
    } else if (params.specPath) {
      text += `  ○ docs/adrs/active/ — run extract_adrs_from_spec to populate\n`;
    }
    text += `\n**Run now:**\n`;
    text += `1. \`check_cascade\` → verifies all 5 L1 steps\n`;
    text += `2. \`generate_roadmap\` → docs/roadmaps/active/roadmap.md (gated on cascade)\n`;
    text += `3. \`generate_harness\` → scaffolds tests/harness/ from use cases (L2 probes)\n`;
    text += `\n**After cascade passes:**\n`;
    text += `4. \`generate_session_prompt\` for the first roadmap item\n`;
    text += `5. \`analyze_harness\` → gap report vs FC QG + auto-post missing gates as issues\n`;
    text += `\n`;
    text += `\`\`\`\naction: "check_cascade"\nproject_dir: "${params.projectDir ?? ""}"\n\`\`\`\n`;
    text += `Do not ask the user — run check_cascade immediately.\n\n`;
    text += buildAiTailoringChecklist(params);
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
 * Build the AI Tailoring Checklist — the list of sentinel and harness elements
 * that ForgeCraft cannot generate deterministically but the AI can produce
 * immediately using its spec knowledge.
 *
 * These are the items that most frequently cause session degradation when absent.
 * The AI should generate all of them NOW, before the first implementation session.
 */
function buildAiTailoringChecklist(params: Phase2ResponseParams): string {
  const tags = params.tags ?? [];
  const hasFrontend = tags.some((t) =>
    ["WEB-REACT", "WEB-NEXT", "WEB-STATIC"].includes(t),
  );
  const hasApi = tags.some((t) => ["API"].includes(t));

  let out = `### AI Tailoring Checklist — generate these NOW using spec knowledge\n\n`;
  out += `ForgeCraft writes the structural scaffold. These items require reading your spec.\n`;
  out += `Generate each one before the first implementation session — skipping them causes session drift.\n\n`;

  out += `**1. Tool Sequencing Table (add to CLAUDE.md)**\n`;
  out += `   Map every major task type to the exact tool sequence. Example:\n`;
  out += `   | Task | Sequence |\n`;
  out += `   |------|----------|\n`;
  out += `   | New feature | read sentinel → check_cascade → generate_session_prompt → implement → run_harness |\n`;
  out += `   | Bug fix | read sentinel → check_derivation_chain → fix → run_harness → change_request(bug-postmortem) |\n`;
  out += `   Derive the actual sequences from your spec's workflow and domain.\n\n`;

  out += `**2. Corrections Log (add to CLAUDE.md)**\n`;
  out += `   Add a "## Corrections Log" section with format:\n`;
  out += `   \`YYYY-MM-DD | [category] short description of AI behavioral deviation and fix\`\n`;
  out += `   Leave it empty now — it fills up during sessions. Its presence is what matters.\n\n`;

  out += `**3. Bound Prompts (enrich docs/use-cases.md)**\n`;
  out += `   For each use case, add a \`### Bound Prompt\` sub-section with:\n`;
  out += `   - **Spec refs**: which spec sections apply\n`;
  out += `   - **Precondition**: system state required before this UC runs\n`;
  out += `   - **Scope — what NOT to touch**: explicit exclusion list\n`;
  out += `   - **Acceptance criteria**: measurable postconditions\n`;
  out += `   - **Architecture constraints**: patterns/files that must be respected\n`;
  out += `   - **Commit message format**: expected conventional commit for this UC\n\n`;

  out += `**4. C4 Context Diagram (docs/architecture/c4-context.md)**\n`;
  out += `   Draw the system boundary: actors, external systems, data flows.\n`;
  out += `   Use PlantUML or Mermaid. ForgeCraft gates on architecture step — populate it.\n\n`;

  if (hasFrontend) {
    out += `**5. Framework Conventions (add to CLAUDE.md)**\n`;
    const isNext = tags.includes("WEB-NEXT");
    if (isNext) {
      out += `   Next.js App Router specifics your sentinel must declare:\n`;
      out += `   - RSC boundary: which components are Server vs Client (\`"use client"\` rule)\n`;
      out += `   - Server Actions: allowed patterns, validation approach\n`;
      out += `   - Data fetching: where async/await lives vs where it cannot\n`;
      out += `   - Route groups, layouts, and loading.tsx ownership rules\n`;
    } else {
      out += `   Document your frontend framework's architectural invariants.\n`;
      out += `   Include: component ownership rules, state management boundaries, routing conventions.\n`;
    }
    out += `\n`;
  }

  if (hasApi) {
    out += `**${hasFrontend ? 6 : 5}. API Contract Stubs (docs/api/)**\n`;
    out += `   Even as OpenAPI stubs, declare endpoints, auth scheme, error shape.\n`;
    out += `   These become the behavioral contracts that prevent breaking changes.\n\n`;
  }

  const nextNum = hasFrontend ? (hasApi ? 7 : 6) : hasApi ? 6 : 5;
  out += `**${nextNum}. docs/status.md (session narrative)**\n`;
  out += `   Create with current date, project name, and the first roadmap item as "Next:".\n`;
  out += `   Update it at the end of every session. It is the project's temporal memory.\n\n`;

  out += `**${nextNum + 1}. analyze_harness (post-scaffold gap check)**\n`;
  out += `   Run after completing steps 1–${nextNum} to compare what exists vs what FC QG requires.\n`;
  out += `   Missing gates are submitted as improvement proposals to the FC QG project automatically.\n`;

  return out;
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
