/**
 * Verification state schemas, I/O, and summary computation.
 *
 * Core state management for the record_verification tool:
 * loading, saving, and computing per-tag and aggregate S values.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_TAGS } from "../shared/types.js";
import type {
  VerificationStepRecord,
  VerificationStepStatus,
  VerificationStateFile,
  VerificationTagSummary,
  VerificationStrategy,
} from "../shared/types.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/verification-state");
const STATE_DIR = ".forgecraft";
const STATE_FILE = "verification-state.json";

// ── Schemas ──────────────────────────────────────────────────────────

export const recordVerificationSchema = z.object({
  project_dir: z
    .string()
    .describe(
      "Absolute path to the project root. State is stored at {project_dir}/.forgecraft/verification-state.json.",
    ),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .describe(
      "Active project tags. Used to initialize state and compute summaries.",
    ),
  language: z
    .string()
    .optional()
    .describe(
      "Primary project language (e.g., 'typescript', 'python'). Stored for context.",
    ),
  strategy_tag: z
    .enum(ALL_TAGS as unknown as [string, ...string[]])
    .describe(
      "The tag whose verification strategy this step belongs to (e.g., 'API', 'GAME').",
    ),
  phase_id: z
    .string()
    .describe(
      "Phase ID within the strategy (e.g., 'contract-definition', 'execution').",
    ),
  step_id: z
    .string()
    .describe(
      "Step ID within the phase (e.g., 'write-hurl-spec', 'run-monte-carlo').",
    ),
  status: z
    .enum(["pass", "fail", "skipped"] as const)
    .describe(
      "Acceptance decision: 'pass' = criterion met or human approved; " +
        "'fail' = criterion not met (blocks S advancement); " +
        "'skipped' = explicitly excluded with notes justifying why.",
    ),
  notes: z
    .string()
    .optional()
    .describe(
      "Evidence or justification. For 'pass': paste the tool output, assertion result, or approval note. " +
        "For 'fail': paste the specific failure. For 'skipped': justify why this step does not apply.",
    ),
  recorded_by: z
    .string()
    .optional()
    .describe(
      "Who recorded this decision (e.g., 'claude-sonnet-4-5', 'human', CI job name). Defaults to 'unknown'.",
    ),
});

export const getVerificationStatusSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe(
      "Filter to specific tags. Omit to show all tags in the state file.",
    ),
  show_pending_only: z
    .boolean()
    .optional()
    .describe(
      "If true, only show steps with status=pending or status=fail. Default: false (show all).",
    ),
});

// ── Core State I/O ───────────────────────────────────────────────────

/** Resolve the path to the state file for a project. */
export function stateFilePath(projectDir: string): string {
  return join(projectDir, STATE_DIR, STATE_FILE);
}

/**
 * Load the verification state file for a project.
 * Returns null if the file does not exist yet.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Parsed state file or null
 */
export function loadVerificationState(
  projectDir: string,
): VerificationStateFile | null {
  const path = stateFilePath(projectDir);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as VerificationStateFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to parse verification-state.json", {
      path,
      error: message,
    });
    return null;
  }
}

/**
 * Write the verification state file, computing summaries from current steps.
 *
 * @param projectDir - Absolute path to the project root
 * @param state - Full state to persist (summary will be recomputed)
 * @param strategies - All loaded verification strategies for summary computation
 */
export function saveVerificationState(
  projectDir: string,
  state: Omit<VerificationStateFile, "summary" | "aggregate_s">,
  strategies: VerificationStrategy[],
): VerificationStateFile {
  const summary = computeSummaries(state.steps, strategies);
  const aggregate_s = computeAggregateS(summary);

  const full: VerificationStateFile = {
    ...state,
    summary,
    aggregate_s,
    updatedAt: new Date().toISOString(),
  };

  const dir = join(projectDir, STATE_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(stateFilePath(projectDir), JSON.stringify(full, null, 2), "utf-8");
  logger.info("Verification state saved", {
    projectDir,
    aggregate_s,
    tags: state.tags,
  });
  return full;
}

// ── Summary Computation ──────────────────────────────────────────────

/**
 * Compute per-tag summaries from the full step record list.
 * For tags with no loaded strategy, returns a zero-state summary.
 *
 * @param steps - All recorded step decisions
 * @param strategies - Loaded verification strategies for step counts
 * @returns Per-tag summary array
 */
export function computeSummaries(
  steps: VerificationStepRecord[],
  strategies: VerificationStrategy[],
): VerificationTagSummary[] {
  return strategies.map((strategy) => {
    const tag = strategy.tag;
    const allStepIds = strategy.phases.flatMap((p) =>
      p.steps.map((s) => ({
        phaseId: p.id,
        stepId: s.id,
        requiresHumanReview: s.requires_human_review,
      })),
    );
    const totalSteps = allStepIds.length;

    const tagRecords = steps.filter((r) => r.strategyTag === tag);
    const recordMap = new Map(
      tagRecords.map((r) => [`${r.phaseId}:${r.stepId}`, r]),
    );

    let passedSteps = 0;
    let failedSteps = 0;
    let skippedSteps = 0;
    let awaitingHumanReview = false;

    for (const { phaseId, stepId, requiresHumanReview } of allStepIds) {
      const record = recordMap.get(`${phaseId}:${stepId}`);
      const status: VerificationStepStatus = record?.status ?? "pending";

      switch (status) {
        case "pass":
          passedSteps++;
          break;
        case "fail":
          failedSteps++;
          break;
        case "skipped":
          skippedSteps++;
          break;
        default:
          if (requiresHumanReview) awaitingHumanReview = true;
          break;
      }
    }

    const pendingSteps = totalSteps - passedSteps - failedSteps - skippedSteps;
    const denominator = totalSteps - skippedSteps;
    const s_realized = denominator === 0 ? 1.0 : passedSteps / denominator;

    return {
      tag,
      passedSteps,
      failedSteps,
      pendingSteps,
      skippedSteps,
      totalSteps,
      s_realized: Math.round(s_realized * 100) / 100,
      completeness_ceiling: strategy.completeness_ceiling,
      awaitingHumanReview,
    };
  });
}

/**
 * Compute aggregate S across all tags.
 * Weighted mean: weight = completeness_ceiling.
 *
 * @param summaries - Per-tag summaries
 * @returns Aggregate S ∈ [0.0, 1.0]
 */
export function computeAggregateS(summaries: VerificationTagSummary[]): number {
  if (summaries.length === 0) return 0;
  const totalWeight = summaries.reduce((acc, s) => acc + s.completeness_ceiling, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = summaries.reduce(
    (acc, s) => acc + s.s_realized * s.completeness_ceiling,
    0,
  );
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
