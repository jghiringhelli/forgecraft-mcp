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

interface CascadeStep {
  readonly step: number;
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "WARN";
  readonly detail: string;
  readonly action?: string;
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

// ── Handler ──────────────────────────────────────────────────────────

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

  const steps: CascadeStep[] = [
    checkFunctionalSpec(projectDir),
    checkDiagrams(projectDir),
    checkConstitution(projectDir),
    checkAdrs(projectDir),
    checkBehavioralContracts(projectDir),
  ];

  const passingCount = steps.filter((s) => s.status === "PASS").length;
  const failingCount = steps.filter((s) => s.status === "FAIL").length;

  return {
    content: [{ type: "text", text: formatReport(steps, passingCount, failingCount) }],
  };
}

// ── Step Checkers ────────────────────────────────────────────────────

/**
 * Step 1: Functional specification must exist before architecture is derived.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
function checkFunctionalSpec(projectDir: string): CascadeStep {
  const found = FUNCTIONAL_SPEC_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (found) {
    return { step: 1, name: "Functional Specification", status: "PASS", detail: `Found: ${found}` };
  }
  return {
    step: 1,
    name: "Functional Specification",
    status: "FAIL",
    detail: "No functional specification found. The cascade has no axiom set.",
    action:
      "Create docs/PRD.md or docs/TechSpec.md: what the system does, for whom, and what constitutes success.",
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
  const diagramsDir = join(projectDir, "docs/diagrams");
  if (!existsSync(diagramsDir)) {
    return {
      step: 2,
      name: "Architecture Diagrams",
      status: "FAIL",
      detail: "docs/diagrams/ does not exist.",
      action:
        "Create docs/diagrams/ and add a Mermaid C4 context diagram (docs/diagrams/c4-context.md).",
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
    };
  }
  return {
    step: 2,
    name: "Architecture Diagrams",
    status: "PASS",
    detail: `${files.length} diagram file(s) in docs/diagrams/ (${files.join(", ")})`,
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
    };
  }
  return {
    step: 3,
    name: "Architectural Constitution",
    status: "PASS",
    detail: `${foundPath} (${lines} lines) — within the ${CONSTITUTION_LINE_LIMIT}-line threshold`,
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
  const foundUseCase = USE_CASE_PATHS.find((p) => existsSync(join(projectDir, p)));
  if (foundUseCase) {
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "PASS",
      detail: `Use case document found: ${foundUseCase}`,
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
  };
}

// ── Report Formatter ─────────────────────────────────────────────────

/**
 * Format the cascade check results as a readable Markdown report.
 *
 * @param steps - All five cascade step results
 * @param passingCount - Number of PASS steps
 * @param failingCount - Number of FAIL steps (WARNs do not count as failures)
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
    const icon = step.status === "PASS" ? "✅" : step.status === "WARN" ? "⚠️ " : "❌";
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
