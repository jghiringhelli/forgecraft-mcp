/**
 * generate_session_prompt tool handler.
 *
 * Produces a bound, self-contained session prompt for a single roadmap item.
 * Reads the project artifact set (constitution, Status.md, ADRs) and embeds
 * the relevant references, scope, acceptance criteria, and TDD gate into one
 * ready-to-paste prompt. (GS White Paper §6.3)
 */

import { z } from "zod";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  runCascadeChecks,
  isCascadeComplete,
  buildGuidedRemediation,
  loadCascadeDecisions,
} from "./check-cascade.js";
import { findNextRoadmapItem } from "./close-cycle.js";
import type { ToolResult, ToolAmbiguity } from "../shared/types.js";
import { detectSpecRoadmapDrift } from "../shared/drift-detector.js";
import {
  buildPrompt,
  discoverArtifacts,
  readStatusSummary,
  buildDefaultCriteria,
  buildRoadmapItemAmbiguity,
} from "./session-prompt-builders.js";

export type { ArtifactContext, PromptBuildInput, McpServerYamlEntry, McpServersYaml } from "./session-prompt-builders.js";
export {
  buildPrompt,
  loadMcpServerDescriptions,
  buildMcpToolsSection,
  FORGECRAFT_PRIMARY_USE,
  discoverArtifacts,
  readStatusSummary,
  buildDefaultCriteria,
} from "./session-prompt-builders.js";
export {
  isPlaceholderTestScript,
  deriveTestCommand,
  isServerConfigured,
  buildContextLoadBlock,
  buildTddGateSection,
  buildContextRetrievalSection,
  buildExecutionLoopSection,
} from "./session-prompt-sections.js";

// ── Schema ───────────────────────────────────────────────────────────
export const generateSessionPromptSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  item_description: z
    .string()
    .min(10)
    .optional()
    .describe(
      "What this session should build or fix. One sentence, precision over brevity: " +
        "actor, behavior, and postcondition. Example: 'Add a paginated GET /users endpoint " +
        "that returns UserResponse DTOs sorted by creation date.' " +
        "If omitted and docs/roadmap.md exists, the next pending roadmap item is auto-selected.",
    ),
  roadmap_item_id: z
    .string()
    .optional()
    .describe(
      "Optional roadmap item ID to generate the prompt for (e.g. 'RM-001'). " +
        "When provided, reads the item from docs/roadmap.md. " +
        "Takes precedence over auto-selection but not over item_description.",
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
      "Explicit out-of-scope statement — what this session should NOT touch.",
    ),
  session_type: z
    .enum(["feature", "fix", "refactor", "test", "docs", "chore"])
    .default("feature")
    .describe("Conventional commit type for the session output. Default: feature."),
});

export type GenerateSessionPromptInput = z.infer<typeof generateSessionPromptSchema>;

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate a bound session prompt for a single roadmap item.
 *
 * Resolution order:
 * 1. item_description provided → use as-is
 * 2. roadmap_item_id provided → look up in docs/roadmap.md
 * 3. Neither + roadmap exists → auto-select next pending item
 * 4. Neither + no roadmap → return error
 *
 * @param args - Validated input matching generateSessionPromptSchema
 * @returns MCP-style content array with the prompt text, plus optional ambiguities
 */
export async function generateSessionPromptHandler(
  args: GenerateSessionPromptInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);

  const decisions = loadCascadeDecisions(projectDir);
  const cascadeSteps = runCascadeChecks(projectDir, decisions);
  if (!isCascadeComplete(cascadeSteps)) {
    const guidance = buildGuidedRemediation(cascadeSteps);
    return {
      content: [{
        type: "text",
        text: `## Session Prompt Blocked — Cascade Incomplete\n\n` +
          `A session prompt cannot be generated until the derivation cascade is complete.\n` +
          `The cascade ensures each implementation session is fully derivable from the spec,\n` +
          `eliminating context guessing and specification drift.\n\n` + guidance,
      }],
    };
  }

  const driftResult = detectSpecRoadmapDrift(projectDir);

  let resolvedDescription = args.item_description;
  let resolvedItemId: string | undefined;

  if (!resolvedDescription) {
    const roadmapItem = args.roadmap_item_id
      ? findRoadmapItemById(projectDir, args.roadmap_item_id)
      : findNextRoadmapItem(projectDir);

    if (!roadmapItem) {
      const hint = args.roadmap_item_id
        ? `Roadmap item '${args.roadmap_item_id}' not found in docs/roadmap.md.`
        : existsSync(join(projectDir, "docs", "roadmap.md"))
          ? "docs/roadmap.md has no pending items — all roadmap items are complete."
          : "No docs/roadmap.md found. Run generate_roadmap first, or provide item_description.";
      return {
        content: [{
          type: "text",
          text: `## Session Prompt Blocked — No Item to Generate\n\n${hint}\n\n` +
            `Provide \`item_description\` explicitly or run \`generate_roadmap\` to create a roadmap.`,
        }],
      };
    }

    resolvedDescription = roadmapItem.title;
    resolvedItemId = roadmapItem.id;
    markRoadmapItemInProgress(projectDir, roadmapItem.id);
  }

  const artifacts = discoverArtifacts(projectDir);
  const statusSummary = readStatusSummary(projectDir);
  const criteria = args.acceptance_criteria ?? buildDefaultCriteria(resolvedDescription);

  const prompt = buildPrompt({
    projectDir,
    itemDescription: resolvedDescription,
    sessionType: args.session_type,
    scopeNote: args.scope_note,
    acceptanceCriteria: criteria,
    artifacts,
    statusSummary,
  });

  if (resolvedItemId) writeSessionPromptFile(projectDir, resolvedItemId, prompt);

  const ambiguities = buildRoadmapItemAmbiguity(resolvedDescription);
  const header = resolvedItemId
    ? `## Session Prompt — ${resolvedItemId}: ${resolvedDescription}\n> Persisted to docs/session-prompts/${resolvedItemId}.md\n\n`
    : "";
  const driftBanner = driftResult.driftDetected ? `> ${driftResult.message}\n\n` : "";

  return {
    content: [{ type: "text", text: driftBanner + header + prompt }],
    ...(ambiguities ? { ambiguities: [ambiguities] } : {}),
  };
}

// ── Roadmap helpers ──────────────────────────────────────────────────

/**
 * Find a specific roadmap item by ID from docs/roadmap.md.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID, e.g. "RM-001"
 * @returns Item id and title, or null if not found
 */
function findRoadmapItemById(
  projectDir: string,
  itemId: string,
): { readonly id: string; readonly title: string } | null {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return null;
  const content = readFileSync(roadmapPath, "utf-8");
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`\\|\\s*(${escapedId})\\s*\\|\\s*([^|]+)\\s*\\|`));
  if (!match) return null;
  return { id: match[1]!.trim(), title: match[2]!.trim() };
}

/**
 * Mark a roadmap item as in-progress in docs/roadmap.md.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID to mark
 */
function markRoadmapItemInProgress(projectDir: string, itemId: string): void {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return;
  const content = readFileSync(roadmapPath, "utf-8");
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const updated = content.replace(
    new RegExp(`(\\|\\s*${escapedId}\\s*\\|[^|]+\\|)\\s*pending\\s*(\\|)`),
    "$1 in-progress $2",
  );
  if (updated !== content) writeFileSync(roadmapPath, updated, "utf-8");
}

/**
 * Write the bound session prompt to docs/session-prompts/<id>.md.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID, used as filename
 * @param promptContent - Full prompt text to persist
 */
function writeSessionPromptFile(projectDir: string, itemId: string, promptContent: string): void {
  const dir = join(projectDir, "docs", "session-prompts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${itemId}.md`), promptContent, "utf-8");
}

// For ToolAmbiguity type usage in buildRoadmapItemAmbiguity (re-exported from builders)
export type { ToolAmbiguity };
