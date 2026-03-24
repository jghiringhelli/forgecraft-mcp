/**
 * record_verification + get_verification_status tool handlers.
 *
 * Persists per-project acceptance decisions into
 * {projectDir}/.forgecraft/verification-state.json and reports progress.
 *
 * S_tag = passedSteps / (totalSteps - skippedSteps)
 * S_aggregate = weighted mean of S_tag, weight = completeness_ceiling
 */

import { z } from "zod";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import type {
  Tag,
  VerificationStepRecord,
  VerificationStepStatus,
  VerificationTagSummary,
} from "../shared/types.js";
import {
  recordVerificationSchema,
  getVerificationStatusSchema,
  loadVerificationState,
  saveVerificationState,
  stateFilePath,
} from "./verification-state-core.js";

export { recordVerificationSchema, getVerificationStatusSchema, loadVerificationState };

// ── Handler: record_verification ────────────────────────────────────

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

  lines.push("", "## Updated Progress", "");

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
    lines.push("", "## Blocking Items");
    for (const b of blocking) {
      if (b.failedSteps > 0) {
        lines.push(`- **[${b.tag}]** ${b.failedSteps} step(s) FAILED — fix before advancing`);
      }
      if (b.awaitingHumanReview) {
        lines.push(`- **[${b.tag}]** has steps awaiting human review`);
      }
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Handler: get_verification_status ────────────────────────────────

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
    case "pass":    return "✓";
    case "fail":    return "✗";
    case "skipped": return "⊘";
    default:        return "○";
  }
}

function renderTagSummaryLine(s: VerificationTagSummary): string {
  const bar = progressBar(s.s_realized, s.completeness_ceiling);
  return `- **[${s.tag}]** S=${s.s_realized.toFixed(2)} / ${s.completeness_ceiling.toFixed(2)}  ${bar}  (${s.passedSteps}✓ ${s.failedSteps}✗ ${s.pendingSteps}○ ${s.skippedSteps}⊘)`;
}

function progressBar(realized: number, ceiling: number, width: number = 10): string {
  const ceilingChars = Math.round(ceiling * width);
  const passedChars = Math.round(realized * width);
  const bar =
    "█".repeat(passedChars) +
    "░".repeat(ceilingChars - passedChars) +
    " ".repeat(width - ceilingChars);
  return `[${bar}]`;
}
