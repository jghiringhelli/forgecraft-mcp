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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

// ── Schema ───────────────────────────────────────────────────────────

export const checkCascadeSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root to verify."),
});

export type CheckCascadeInput = z.infer<typeof checkCascadeSchema>;

// ── Domain Types ─────────────────────────────────────────────────────

export interface CascadeStep {
  readonly step: number;
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "WARN" | "STUB";
  readonly detail: string;
  readonly action?: string;
  readonly questions: readonly string[];
}

// ── Constants ────────────────────────────────────────────────────────

const CONSTITUTION_PATHS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursor/rules",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  ".clinerules",
] as const;

const FUNCTIONAL_SPEC_PATHS = [
  "docs/PRD.md",
  "docs/TechSpec.md",
  "docs/tech-spec.md",
  "docs/functional-spec.md",
  "docs/spec.md",
] as const;

const ADR_DIRS = ["docs/adrs", "docs/adr"] as const;
const USE_CASE_PATHS = ["docs/use-cases.md", "docs/UseCases.md", "docs/use-cases"] as const;
const CONSTITUTION_LINE_LIMIT = 300;

// ── Stub Detection ────────────────────────────────────────────────────

/**
 * Return true when a file contains unfilled template markers.
 * STUB means the file exists but has not been populated by the user.
 *
 * @param content - File content to inspect
 * @returns Whether the content contains unfilled template markers
 */
function isStub(content: string): boolean {
  return /<!--\s*(FILL|TODO|UNFILLED)|(\[DESCRIBE|\[YOUR |fill in here)/i.test(content);
}

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Run all five GS cascade checks on the given project directory.
 * Shared between checkCascadeHandler and generateSessionPromptHandler.
 *
 * @param projectDir - Absolute project root path
 * @returns Array of five cascade step results
 */
export function runCascadeChecks(projectDir: string): CascadeStep[] {
  return [
    checkFunctionalSpec(projectDir),
    checkDiagrams(projectDir),
    checkConstitution(projectDir),
    checkAdrs(projectDir),
    checkBehavioralContracts(projectDir),
  ];
}

/**
 * Run the GS cascade check on the given project directory.
 *
 * @param args - Validated input matching `checkCascadeSchema`
 * @returns MCP-style content array with a formatted derivability report
 */
export async function checkCascadeHandler(
  args: CheckCascadeInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = resolve(args.project_dir);

  const steps = runCascadeChecks(projectDir);

  const passingCount = steps.filter((s) => s.status === "PASS").length;
  const failingCount = steps.filter((s) => s.status === "FAIL" || s.status === "STUB").length;

  return {
    content: [{ type: "text", text: formatReport(steps, passingCount, failingCount) }],
  };
}

// ── Exported Helpers ─────────────────────────────────────────────────

/**
 * Returns true only when all cascade steps are PASS or WARN.
 * WARN is advisory and not blocking. FAIL and STUB block progress.
 *
 * @param steps - All cascade step results
 * @returns Whether the cascade is complete enough to proceed
 */
export function isCascadeComplete(steps: readonly CascadeStep[]): boolean {
  return steps.every((s) => s.status === "PASS" || s.status === "WARN");
}

/**
 * Produce a guided remediation message for the first failing or stub step.
 * Addresses one step at a time to avoid overwhelming the user.
 *
 * @param steps - All cascade step results
 * @returns Markdown-formatted remediation guidance
 */
export function buildGuidedRemediation(steps: readonly CascadeStep[]): string {
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
    for (const q of firstFailing.questions) {
      text += `- ${q}\n`;
    }
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
 * @param step - Cascade step number (1–5)
 * @returns Relative artifact path
 */
function getArtifactPath(step: number): string {
  switch (step) {
    case 1: return "docs/PRD.md";
    case 2: return "docs/diagrams/c4-context.md";
    case 3: return "CLAUDE.md";
    case 4: return "docs/adrs/ADR-0001.md";
    case 5: return "docs/use-cases.md";
    default: return "docs/";
  }
}

// ── Step Checkers ────────────────────────────────────────────────────

/**
 * Step 1: Functional specification must exist before architecture is derived.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
function checkFunctionalSpec(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What problem does this project solve?",
    "Who are the primary users?",
    "What does a successful outcome look like for them?",
  ] as const;

  const found = FUNCTIONAL_SPEC_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (!found) {
    return {
      step: 1,
      name: "Functional Specification",
      status: "FAIL",
      detail: "No functional specification found. The cascade has no axiom set.",
      action:
        "Create docs/PRD.md or docs/TechSpec.md: what the system does, for whom, and what constitutes success.",
      questions: STEP_QUESTIONS,
    };
  }
  const content = readFileSync(join(projectDir, found), "utf-8");
  if (isStub(content)) {
    return {
      step: 1,
      name: "Functional Specification",
      status: "STUB",
      detail: `Found ${found} but it contains unfilled template markers. Fill in the spec before continuing.`,
      action: `Open ${found} and answer the questions below to complete it.`,
      questions: STEP_QUESTIONS,
    };
  }
  return {
    step: 1,
    name: "Functional Specification",
    status: "PASS",
    detail: `Found: ${found}`,
    questions: [],
  };
}

/**
 * Step 2: Architecture + C4 diagrams. The diagram is the architecture at a
 * level of abstraction both the team and AI can read unambiguously.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
function checkDiagrams(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What are the main services or components?",
    "What external systems does this project depend on or expose?",
    "What initiates the primary user flow?",
  ] as const;

  const diagramsDir = join(projectDir, "docs/diagrams");
  if (!existsSync(diagramsDir)) {
    return {
      step: 2,
      name: "Architecture Diagrams",
      status: "FAIL",
      detail: "docs/diagrams/ does not exist.",
      action:
        "Create docs/diagrams/ and add a Mermaid C4 context diagram (docs/diagrams/c4-context.md).",
      questions: STEP_QUESTIONS,
    };
  }
  const files = readdirSync(diagramsDir).filter((f) =>
    /\.(md|mermaid|puml|svg|png)$/i.test(f),
  );
  if (files.length === 0) {
    return {
      step: 2,
      name: "Architecture Diagrams",
      status: "WARN",
      detail: "docs/diagrams/ exists but contains no diagram files.",
      action: "Add docs/diagrams/c4-context.md with a Mermaid C4 context or container diagram.",
      questions: STEP_QUESTIONS,
    };
  }
  const stubFile = files.find((f) => {
    try {
      const content = readFileSync(join(diagramsDir, f), "utf-8");
      return isStub(content);
    } catch {
      return false;
    }
  });
  if (stubFile) {
    return {
      step: 2,
      name: "Architecture Diagrams",
      status: "STUB",
      detail: `docs/diagrams/${stubFile} contains unfilled template markers. Fill in the diagram before continuing.`,
      action: `Open docs/diagrams/${stubFile} and answer the questions below to complete it.`,
      questions: STEP_QUESTIONS,
    };
  }
  return {
    step: 2,
    name: "Architecture Diagrams",
    status: "PASS",
    detail: `${files.length} diagram file(s) in docs/diagrams/ (${files.join(", ")})`,
    questions: [],
  };
}

/**
 * Step 3: Architectural constitution — the operative grammar. Must exist
 * and be within the 300-line attention threshold.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
function checkConstitution(projectDir: string): CascadeStep {
  const foundPath = CONSTITUTION_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (!foundPath) {
    return {
      step: 3,
      name: "Architectural Constitution",
      status: "FAIL",
      detail: "No AI assistant instruction file found (CLAUDE.md, AGENTS.md, etc.).",
      action: "Run `setup_project` or `forgecraft scaffold` to generate CLAUDE.md.",
      questions: [],
    };
  }
  const lines = readFileSync(join(projectDir, foundPath), "utf-8").split("\n").length;
  if (lines > CONSTITUTION_LINE_LIMIT) {
    return {
      step: 3,
      name: "Architectural Constitution",
      status: "WARN",
      detail: `${foundPath} found (${lines} lines) — exceeds the ${CONSTITUTION_LINE_LIMIT}-line threshold.`,
      action:
        "Run `refresh_project` with tier: core to compress. An oversized constitution dilutes AI attention on every turn.",
      questions: [],
    };
  }
  return {
    step: 3,
    name: "Architectural Constitution",
    status: "PASS",
    detail: `${foundPath} (${lines} lines) — within the ${CONSTITUTION_LINE_LIMIT}-line threshold`,
    questions: [],
  };
}

/**
 * Step 4: ADRs — at least one non-obvious architectural decision recorded.
 * Without ADRs the AI will "improve" intentional choices that appear suboptimal.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
function checkAdrs(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What is the most important architectural decision made so far?",
    "What alternatives did you consider and why did you reject them?",
  ] as const;

  for (const dir of ADR_DIRS) {
    const fullDir = join(projectDir, dir);
    if (existsSync(fullDir) && statSync(fullDir).isDirectory()) {
      const adrs = readdirSync(fullDir).filter((f) => f.endsWith(".md"));
      if (adrs.length > 0) {
        return {
          step: 4,
          name: "Architecture Decision Records",
          status: "PASS",
          detail: `${adrs.length} ADR(s) in ${dir}/ (${adrs.slice(0, 3).join(", ")}${adrs.length > 3 ? ", …" : ""})`,
          questions: [],
        };
      }
    }
  }
  return {
    step: 4,
    name: "Architecture Decision Records",
    status: "FAIL",
    detail: "No ADRs found in docs/adrs/ or docs/adr/.",
    action:
      "Write at least one ADR recording the primary architectural decision. " +
      "An unrecorded decision is a grammar gap — the AI will treat it as a defect to correct.",
    questions: STEP_QUESTIONS,
  };
}

/**
 * Step 5: Use cases or behavioral contracts. These seed the triple derivation:
 * implementation contract, acceptance test, and user documentation.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
function checkBehavioralContracts(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What are the top 3 actions a user must be able to perform?",
    "What is the precondition and success outcome for each action?",
  ] as const;

  const foundUseCase = USE_CASE_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (foundUseCase) {
    const content = readFileSync(join(projectDir, foundUseCase), "utf-8");
    if (isStub(content)) {
      return {
        step: 5,
        name: "Use Cases / Behavioral Contracts",
        status: "STUB",
        detail: `Found ${foundUseCase} but it contains unfilled template markers. Fill in the use cases before continuing.`,
        action: `Open ${foundUseCase} and answer the questions below to complete it.`,
        questions: STEP_QUESTIONS,
      };
    }
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "PASS",
      detail: `Use case document found: ${foundUseCase}`,
      questions: [],
    };
  }

  const statusPath = join(projectDir, "Status.md");
  const hasNextSteps =
    existsSync(statusPath) &&
    readFileSync(statusPath, "utf-8").toLowerCase().includes("next step");

  if (hasNextSteps) {
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "WARN",
      detail: "No use-cases.md found. Status.md has next-steps content — partial coverage only.",
      action:
        "Create docs/use-cases.md. Each use case (UC-NNN format) seeds: implementation contract, acceptance test, user documentation.",
      questions: STEP_QUESTIONS,
    };
  }
  return {
    step: 5,
    name: "Use Cases / Behavioral Contracts",
    status: "FAIL",
    detail: "No use cases and no Status.md with next-steps content.",
    action:
      "Create docs/use-cases.md with at least one UC in UC-NNN format. " +
      "See the `use-case-triple-derivation` template block for the format.",
    questions: STEP_QUESTIONS,
  };
}

// ── Report Formatter ─────────────────────────────────────────────────

/**
 * Format the cascade check results as a readable Markdown report.
 *
 * @param steps - All five cascade step results
 * @param passingCount - Number of PASS steps
 * @param failingCount - Number of FAIL + STUB steps (WARNs do not count as failures)
 * @returns Formatted report string
 */
function formatReport(
  steps: readonly CascadeStep[],
  passingCount: number,
  failingCount: number,
): string {
  const cascadeComplete = failingCount === 0;
  const statusLabel = cascadeComplete
    ? passingCount === 5 ? "COMPLETE" : "COMPLETE (with warnings)"
    : "BLOCKED";
  const headerIcon = cascadeComplete ? "✅" : "❌";

  let text = `# GS Initialization Cascade Check\n\n`;
  text += `**Status:** ${headerIcon} ${statusLabel}   (${passingCount}/5 steps passing)\n\n`;
  text += `## Steps\n\n`;

  for (const step of steps) {
    const icon =
      step.status === "PASS" ? "✅" :
      step.status === "WARN" ? "⚠️ " :
      step.status === "STUB" ? "⚠ STUB" :
      "❌";
    text += `${icon} **Step ${step.step}: ${step.name}**\n`;
    text += `   ${step.detail}\n`;
    if (step.action) {
      text += `   > **Action:** ${step.action}\n`;
    }
    text += "\n";
  }

  if (!cascadeComplete) {
    text += `## Why This Is Blocking\n\n`;
    text += `The initialization cascade is the derivability gate (§4.3, §6.2 of the white paper).\n`;
    text += `A stateless agent given an incomplete artifact set fills missing context arbitrarily —\n`;
    text += `producing locally valid, architecturally incoherent output at generation speed.\n\n`;
    text += `Complete the failing steps before the first implementation session begins.\n`;
  } else {
    text += `## Cascade Complete\n\n`;
    text += `A stateless agent given these artifacts can derive any valid implementation state\n`;
    text += `without further human direction. The derivability criterion (§4.3) is satisfied.\n\n`;
    text += `**Suggested next step:** Use \`generate_session_prompt\` to produce a bound prompt\n`;
    text += `(specification references + scope + acceptance criteria) for each roadmap item.\n`;
  }

  const nextSteps = steps.filter((s) => s.action).map((s) => s.action!);
  text += `\n---\n`;
  text += `\`files_created\`: []\n`;
  text += `\`next_steps\`: ${JSON.stringify(nextSteps, null, 2)}\n`;
  return text;
}
