/**
 * record_verification tool handler + verification state read/write utilities.
 *
 * Persists per-project acceptance decisions for each verification step into
 * {projectDir}/.forgecraft/verification-state.json.
 *
 * The state file answers: "For this project's tag/stack combination,
 * which verification contracts have been accepted, by whom, and when?"
 *
 * From those records, the realized specification completeness S is computed:
 *   S_tag = passedSteps / (totalSteps - skippedSteps)
 *   S_aggregate = weighted mean of S_tag, weight = completeness_ceiling
 *
 * This S feeds directly into I(S) ≈ 1/S — the number of additional verification
 * iterations expected before full convergence. At S = 0.95, one more pass is
 * expected. At S = 0.40, 2.5 passes are expected.
 */
// @ts-nocheck


import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_TAGS } from "../shared/types.js";
import type {
  Tag,
  VerificationStepRecord,
  VerificationStepStatus,
  VerificationStateFile,
  VerificationTagSummary,
  VerificationStrategy,
} from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/verification-state");
const STATE_DIR = ".forgecraft";
const STATE_FILE = "verification-state.json";

// ── Schema ───────────────────────────────────────────────────────────

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
function stateFilePath(projectDir: string): string {
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
function saveVerificationState(
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

  writeFileSync(
    stateFilePath(projectDir),
    JSON.stringify(full, null, 2),
    "utf-8",
  );
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
function computeSummaries(
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
 * Weighted mean: weight = completeness_ceiling (higher-ceiling strategies contribute more).
 *
 * @param summaries - Per-tag summaries
 * @returns Aggregate S ∈ [0.0, 1.0]
 */
function computeAggregateS(summaries: VerificationTagSummary[]): number {
  if (summaries.length === 0) return 0;
  const totalWeight = summaries.reduce(
    (acc, s) => acc + s.completeness_ceiling,
    0,
  );
  if (totalWeight === 0) return 0;
  const weightedSum = summaries.reduce(
    (acc, s) => acc + s.s_realized * s.completeness_ceiling,
    0,
  );
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ── Handlers ─────────────────────────────────────────────────────────

/**
 * Record a single verification step acceptance decision.
 * Creates the state file if it does not exist. Updates existing records in-place.
 *
 * @param args - Validated tool input
 * @returns Updated state summary
 */
export async function recordVerificationHandler(
  args: z.infer<typeof recordVerificationSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags = args.tags as Tag[];
  const strategyTag = args.strategy_tag as Tag;

  const templateSets = await loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  const existing = loadVerificationState(args.project_dir);
  const now = new Date().toISOString();

  const newRecord: VerificationStepRecord = {
    strategyTag,
    phaseId: args.phase_id,
    stepId: args.step_id,
    status: args.status,
    recordedAt: now,
    notes: args.notes,
    recordedBy: args.recorded_by ?? "unknown",
  };

  // Upsert: replace existing record for same (strategyTag, phaseId, stepId)
  const existingSteps = existing?.steps ?? [];
  const isSameStep = (r: VerificationStepRecord) =>
    r.strategyTag === strategyTag &&
    r.phaseId === args.phase_id &&
    r.stepId === args.step_id;
  const updatedSteps: VerificationStepRecord[] = [
    ...existingSteps.filter((r) => !isSameStep(r)),
    newRecord,
  ];

  const state = saveVerificationState(
    args.project_dir,
    {
      version: "1",
      projectDir: args.project_dir,
      tags,
      language: args.language ?? existing?.language ?? "unknown",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      steps: updatedSteps,
    },
    composed.verificationStrategies,
  );

  const tagSummary = state.summary.find((s) => s.tag === strategyTag);
  const lines: string[] = [
    `# Verification Step Recorded`,
    "",
    `**Step:** \`${strategyTag} / ${args.phase_id} / ${args.step_id}\``,
    `**Status:** ${statusIcon(args.status)} ${args.status.toUpperCase()}`,
    `**Recorded at:** ${now}`,
    `**Recorded by:** ${newRecord.recordedBy}`,
  ];

  if (args.notes) {
    lines.push(
      "",
      `**Notes:** ${args.notes.slice(0, 300)}${args.notes.length > 300 ? "…" : ""}`,
    );
  }

  lines.push("");
  lines.push("## Updated Progress");
  lines.push("");

  if (tagSummary) {
    lines.push(renderTagSummaryLine(tagSummary));
  }

  lines.push("");
  lines.push(`**Aggregate S:** ${state.aggregate_s.toFixed(2)}`);
  lines.push(
    `**Expected additional iterations:** ~${(1 / Math.max(state.aggregate_s, 0.05)).toFixed(1)}`,
  );

  const blocking = state.summary.filter(
    (s) => s.failedSteps > 0 || s.awaitingHumanReview,
  );
  if (blocking.length > 0) {
    lines.push("");
    lines.push("## Blocking Items");
    for (const b of blocking) {
      if (b.failedSteps > 0) {
        lines.push(
          `- **[${b.tag}]** ${b.failedSteps} step(s) FAILED — fix before advancing`,
        );
      }
      if (b.awaitingHumanReview) {
        lines.push(`- **[${b.tag}]** has steps awaiting human review`);
      }
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Return the current verification status for a project.
 * Shows per-tag progress, realized S values, and blocking items.
 *
 * @param args - Validated tool input
 * @returns Formatted status report
 */
export async function getVerificationStatusHandler(
  args: z.infer<typeof getVerificationStatusSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const state = loadVerificationState(args.project_dir);

  if (!state) {
    return {
      content: [
        {
          type: "text",
          text: [
            "# Verification State: Not Initialized",
            "",
            "No verification-state.json found at this project.",
            "Run `record_verification` to record the first step acceptance.",
            "",
            `Expected path: ${stateFilePath(args.project_dir)}`,
          ].join("\n"),
        },
      ],
    };
  }

  const filterTags = args.tags ? new Set(args.tags as Tag[]) : null;
  const summaries = filterTags
    ? state.summary.filter((s) => filterTags.has(s.tag))
    : state.summary;

  const lines: string[] = [
    "# Verification Status",
    "",
    `**Project:** ${state.projectDir}`,
    `**Tags:** ${state.tags.map((t) => `[${t}]`).join(" ")}`,
    `**Last updated:** ${state.updatedAt}`,
    "",
    "## Specification Completeness",
    "",
    "| Tag | S (realized) | Ceiling | Passed | Failed | Pending | Blocked |",
    "|-----|-------------|---------|--------|--------|---------|---------|",
  ];

  for (const s of summaries) {
    const blocked =
      s.failedSteps > 0 ? "✗ FAIL" : s.awaitingHumanReview ? "⏸ REVIEW" : "—";
    lines.push(
      `| [${s.tag}] | ${s.s_realized.toFixed(2)} | ${s.completeness_ceiling.toFixed(2)} | ${s.passedSteps} | ${s.failedSteps} | ${s.pendingSteps} | ${blocked} |`,
    );
  }

  lines.push("");
  lines.push(`**Aggregate S:** ${state.aggregate_s.toFixed(2)}`);
  lines.push(
    `**Expected additional iterations:** ~${(1 / Math.max(state.aggregate_s, 0.05)).toFixed(1)}`,
  );

  // Step detail
  if (args.show_pending_only) {
    const blocking = state.steps.filter((r) =>
      r.status === "fail" || r.status === "pending" ? true : false,
    );
    if (blocking.length > 0) {
      lines.push("", "## Pending / Failed Steps");
      for (const r of blocking) {
        lines.push(
          `- ${statusIcon(r.status)} **[${r.strategyTag}]** ${r.phaseId} / ${r.stepId}${r.notes ? ` — ${r.notes.slice(0, 120)}` : ""}`,
        );
      }
    }
  } else {
    lines.push("", "## Step Records");
    const byTag = new Map<string, VerificationStepRecord[]>();
    for (const r of state.steps) {
      const key = r.strategyTag as string;
      const arr = byTag.get(key) ?? [];
      arr.push(r);
      byTag.set(key, arr);
    }
    for (const [tag, records] of byTag.entries()) {
      if (filterTags && !filterTags.has(tag as Tag)) continue;
      lines.push("", `### [${tag}]`);
      for (const r of records) {
        lines.push(
          `- ${statusIcon(r.status)} \`${r.phaseId}/${r.stepId}\` — ${r.recordedBy ?? "unknown"} @ ${r.recordedAt.slice(0, 19)}${r.notes ? `\n  > ${r.notes.slice(0, 160)}` : ""}`,
        );
      }
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Rendering helpers ────────────────────────────────────────────────

function statusIcon(status: VerificationStepStatus | "pending"): string {
  switch (status) {
    case "pass":
      return "✓";
    case "fail":
      return "✗";
    case "skipped":
      return "⊘";
    default:
      return "○";
  }
}

function renderTagSummaryLine(s: VerificationTagSummary): string {
  const bar = progressBar(s.s_realized, s.completeness_ceiling);
  return `- **[${s.tag}]** S=${s.s_realized.toFixed(2)} / ${s.completeness_ceiling.toFixed(2)}  ${bar}  (${s.passedSteps}✓ ${s.failedSteps}✗ ${s.pendingSteps}○ ${s.skippedSteps}⊘)`;
}

function progressBar(
  realized: number,
  ceiling: number,
  width: number = 10,
): string {
  const ceilingChars = Math.round(ceiling * width);
  const passedChars = Math.round(realized * width);
  const bar =
    "█".repeat(passedChars) +
    "░".repeat(ceilingChars - passedChars) +
    " ".repeat(width - ceilingChars);
  return `[${bar}]`;
}
