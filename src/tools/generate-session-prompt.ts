/**
 * generate_session_prompt tool handler.
 *
 * Produces a bound, self-contained session prompt for a single roadmap item.
 * Reads the project's artifact set (constitution, Status.md, ADRs) and embeds
 * the relevant references, scope, acceptance criteria, and TDD gate into one
 * ready-to-paste prompt.
 *
 * A roadmap item without a bound prompt is a task title — it forces the
 * practitioner to reconstruct context at execution time, reintroducing the
 * memory cost GS is designed to eliminate. A bound prompt is an independent
 * execution unit. (GS White Paper §6.3)
 */

import { z } from "zod";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// ── Schema ───────────────────────────────────────────────────────────

export const generateSessionPromptSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root."),
  item_description: z
    .string()
    .min(10)
    .describe(
      "What this session should build or fix. One sentence, precision over brevity: " +
      "actor, behavior, and postcondition. Example: 'Add a paginated GET /users endpoint " +
      "that returns UserResponse DTOs sorted by creation date.'",
    ),
  acceptance_criteria: z
    .array(z.string())
    .optional()
    .describe(
      "Checkable acceptance criteria for this item. Each criterion should be " +
      "independently verifiable. If omitted, the tool generates a placeholder list.",
    ),
  scope_note: z
    .string()
    .optional()
    .describe(
      "Explicit out-of-scope statement — what this session should NOT touch. " +
      "Prevents scope creep at execution time.",
    ),
  session_type: z
    .enum(["feature", "fix", "refactor", "test", "docs", "chore"])
    .default("feature")
    .describe("Conventional commit type for the session output. Default: feature."),
});

export type GenerateSessionPromptInput = z.infer<typeof generateSessionPromptSchema>;

// ── Constants ────────────────────────────────────────────────────────

const CONSTITUTION_PATHS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".cursor/rules",
  ".windsurfrules",
  ".clinerules",
] as const;

const ADR_DIRS = ["docs/adrs", "docs/adr"] as const;

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate a bound session prompt for a single roadmap item.
 *
 * @param args - Validated input matching `generateSessionPromptSchema`
 * @returns MCP-style content array with the prompt text
 */
export async function generateSessionPromptHandler(
  args: GenerateSessionPromptInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = resolve(args.project_dir);

  const artifacts = discoverArtifacts(projectDir);
  const statusSummary = readStatusSummary(projectDir);
  const criteria = args.acceptance_criteria ?? buildDefaultCriteria(args.item_description);

  const prompt = buildPrompt({
    itemDescription: args.item_description,
    sessionType: args.session_type,
    scopeNote: args.scope_note,
    acceptanceCriteria: criteria,
    artifacts,
    statusSummary,
  });

  return { content: [{ type: "text", text: prompt }] };
}

// ── Artifact Discovery ───────────────────────────────────────────────

interface ArtifactContext {
  readonly constitutionPath: string | null;
  readonly statusExists: boolean;
  readonly adrCount: number;
  readonly adrDir: string | null;
  readonly diagramsExist: boolean;
  readonly useCasesExist: boolean;
}

/**
 * Discover which GS artifact files exist in the project directory.
 *
 * @param projectDir - Absolute project root
 * @returns Artifact context for prompt generation
 */
function discoverArtifacts(projectDir: string): ArtifactContext {
  const constitutionPath =
    CONSTITUTION_PATHS.find((p) => existsSync(join(projectDir, p))) ?? null;

  const statusExists = existsSync(join(projectDir, "Status.md"));

  let adrCount = 0;
  let adrDir: string | null = null;
  for (const dir of ADR_DIRS) {
    const fullDir = join(projectDir, dir);
    if (existsSync(fullDir)) {
      const adrs = readdirSync(fullDir).filter((f) => f.endsWith(".md"));
      if (adrs.length > adrCount) {
        adrCount = adrs.length;
        adrDir = dir;
      }
    }
  }

  const diagramsDir = join(projectDir, "docs/diagrams");
  const diagramsExist =
    existsSync(diagramsDir) &&
    readdirSync(diagramsDir).some((f) => /\.(md|mermaid|puml)$/i.test(f));

  const useCasesExist =
    existsSync(join(projectDir, "docs/use-cases.md")) ||
    existsSync(join(projectDir, "docs/UseCases.md"));

  return { constitutionPath, statusExists, adrCount, adrDir, diagramsExist, useCasesExist };
}

/**
 * Extract the last meaningful section of Status.md for context.
 * Returns the last 800 chars or the full file if shorter.
 *
 * @param projectDir - Absolute project root
 * @returns Status summary string or empty string
 */
function readStatusSummary(projectDir: string): string {
  const statusPath = join(projectDir, "Status.md");
  if (!existsSync(statusPath)) return "";
  const content = readFileSync(statusPath, "utf-8");
  return content.length > 800 ? `…(truncated)…\n${content.slice(-800)}` : content;
}

/**
 * Build a default acceptance criteria list from the item description.
 * Used when the caller does not supply explicit criteria.
 *
 * @param itemDescription - The item description provided by the caller
 * @returns Default criteria list with placeholders
 */
function buildDefaultCriteria(itemDescription: string): string[] {
  return [
    `All tests for the feature pass: ${itemDescription.slice(0, 60).trim()}…`,
    "No existing tests regressed (full suite green)",
    "Coverage thresholds maintained (80% lines min)",
    "No layer boundary violations introduced",
    "Status.md updated with the completed change",
  ];
}

// ── Prompt Builder ───────────────────────────────────────────────────

interface PromptBuildInput {
  readonly itemDescription: string;
  readonly sessionType: string;
  readonly scopeNote: string | undefined;
  readonly acceptanceCriteria: readonly string[];
  readonly artifacts: ArtifactContext;
  readonly statusSummary: string;
}

/**
 * Assemble the bound session prompt from all collected inputs.
 *
 * @param input - All prompt-building inputs
 * @returns Complete, ready-to-paste session prompt
 */
function buildPrompt(input: PromptBuildInput): string {
  const { itemDescription, sessionType, scopeNote, acceptanceCriteria, artifacts, statusSummary } =
    input;

  const contextLoadBlock = buildContextLoadBlock(artifacts);
  const scopeBlock = scopeNote
    ? `\n## Out of Scope\nDo NOT touch: ${scopeNote}\n`
    : "";

  const criteriaLines = acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n");
  const conventionalType = sessionType === "fix" ? "fix" : sessionType;

  let prompt = `# Session Prompt — Bound\n\n`;
  prompt += `> Generated by ForgeCraft \`generate_session_prompt\`. Load context, then issue this prompt.\n\n`;
  prompt += `---\n\n`;

  prompt += `## Context Load Order\n\n`;
  prompt += `Load these artifacts **before** issuing the implementation prompt:\n\n`;
  prompt += contextLoadBlock;
  prompt += `\n`;

  if (statusSummary) {
    prompt += `## Current State (from Status.md)\n\n`;
    prompt += `\`\`\`\n${statusSummary}\n\`\`\`\n\n`;
  }

  prompt += `---\n\n`;
  prompt += `## Implementation Prompt\n\n`;
  prompt += `*(Paste everything below this line to the AI assistant)*\n\n`;
  prompt += `---\n\n`;

  prompt += `### Task\n\n`;
  prompt += `${itemDescription}\n\n`;

  if (scopeBlock) prompt += scopeBlock + "\n";

  prompt += `### TDD Gate\n\n`;
  prompt += `Follow strict RED → GREEN → REFACTOR.\n`;
  prompt += `1. **RED**: Write the failing test first. Run it. Paste the failure output before writing any implementation.\n`;
  prompt += `2. **GREEN**: Write minimum implementation to pass. Do not proceed until tests pass.\n`;
  prompt += `3. **REFACTOR**: Clean structure while keeping all tests green.\n\n`;
  prompt += `Commit sequence required:\n`;
  prompt += `\`\`\`\ntest(scope): [RED] <describe what the test asserts>\n${conventionalType}(scope): <implement to satisfy the test>\nrefactor(scope): <clean without behavior change>  ← only if needed\n\`\`\`\n\n`;

  prompt += `### Acceptance Criteria\n\n`;
  prompt += `All must be satisfied before the session is considered complete:\n\n`;
  prompt += criteriaLines + "\n\n";

  prompt += `### Session Close\n\n`;
  prompt += `Before ending this session:\n`;
  prompt += `1. Run the full test suite — paste the summary output\n`;
  prompt += `2. Update Status.md: what was completed, current state, next steps\n`;
  prompt += `3. If a non-obvious architectural decision was made: write an ADR in ${artifacts.adrDir ?? "docs/adrs/"}\n\n`;

  prompt += `---\n`;
  prompt += `\`files_created\`: []\n`;
  prompt += `\`next_steps\`: ["Run check_cascade to verify cascade is still complete after this session"]\n`;

  return prompt;
}

/**
 * Build the context load block based on which artifacts are present.
 *
 * @param artifacts - Discovered artifact context
 * @returns Formatted context load instructions
 */
function buildContextLoadBlock(artifacts: ArtifactContext): string {
  const lines: string[] = [];

  if (artifacts.constitutionPath) {
    lines.push(`1. \`${artifacts.constitutionPath}\` — the operative grammar (read first, governs all output)`);
  } else {
    lines.push(`1. ⚠️  No constitution found — run \`setup_project\` before this session`);
  }

  if (artifacts.statusExists) {
    lines.push(`2. \`Status.md\` — current implementation state and last-known next steps`);
  } else {
    lines.push(`2. ⚠️  Status.md missing — create it to maintain session continuity`);
  }

  if (artifacts.adrDir && artifacts.adrCount > 0) {
    lines.push(`3. \`${artifacts.adrDir}/\` — ${artifacts.adrCount} ADR(s) recording intentional decisions`);
  } else {
    lines.push(`3. ⚠️  No ADRs found — the AI may treat intentional choices as defects to fix`);
  }

  if (artifacts.diagramsExist) {
    lines.push(`4. \`docs/diagrams/\` — architecture diagrams (C4 context and/or container)`);
  }

  if (artifacts.useCasesExist) {
    lines.push(`5. \`docs/use-cases.md\` — behavioral contracts (implementation + test + doc seed)`);
  }

  return lines.join("\n") + "\n";
}
