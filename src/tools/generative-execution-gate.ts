/**
 * Generative-execution gate (FC-1).
 *
 * `run_harness` is the objective generative execution: it runs each UC's probes
 * (Hurl contracts, Playwright UI, DB/log shell, simulation) and writes
 * .forgecraft/harness-run.json — the result of the code actually running, NOT a
 * self-report. This module turns that ephemeral, advisory result into a durable,
 * normalized, auditable, and blocking flag:
 *
 *   - `probeStatusToGenerative` — pure mapper: probe status → green|red|unrun
 *   - `consolidateGenerativeExecution` — reads harness-run.json + in-scope UCs and
 *     persists per-UC flags into verification-state.json (called from run_harness)
 *   - `loadGenerativeExecutionOverrides` — auditable file-based overrides from
 *     forgecraft.yaml (mirror of loadCascadeDecisions); empty rationale = no override
 *   - `evaluateGenerativeExecution` — PURE evaluator (no I/O, no process.exit,
 *     no console). This is the acceptance oracle reused by close_cycle and MX.
 *
 * There is deliberately NO happy-path tool that sets a UC green by hand — that
 * would reintroduce the self-report this feature exists to eliminate.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { buildLayerReport } from "./layer-status.js";
import {
  loadVerificationState,
  saveVerificationState,
} from "./verification-state-core.js";
import type {
  ForgeCraftConfig,
  GenerativeExecutionStatus,
  Tag,
  UcGenerativeExecution,
} from "../shared/types.js";

// ── Pure mapper ──────────────────────────────────────────────────────

/**
 * Map a raw harness probe status to a normalized generative-execution status.
 *
 * pass                                              → green
 * fail | error | timeout | not_implemented |        → red
 *   tool_missing
 * no_probe | (absent)                               → unrun
 *
 * @param status - Raw probe status string from harness-run.json, or undefined
 * @returns Normalized generative-execution status
 */
export function probeStatusToGenerative(
  status: string | undefined,
): GenerativeExecutionStatus {
  switch (status) {
    case "pass":
      return "green";
    case "fail":
    case "error":
    case "timeout":
    case "not_implemented":
    case "tool_missing":
      return "red";
    case "no_probe":
    case undefined:
    default:
      return "unrun";
  }
}

// ── Harness-run reader ───────────────────────────────────────────────

interface HarnessRunShape {
  readonly timestamp?: string;
  readonly results?: ReadonlyArray<{ ucId: string; status: string }>;
}

/**
 * Read .forgecraft/harness-run.json. Returns null when missing or unparseable.
 */
function readHarnessRun(projectRoot: string): HarnessRunShape | null {
  const path = join(projectRoot, ".forgecraft", "harness-run.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as HarnessRunShape;
  } catch {
    return null;
  }
}

// ── Consolidator ─────────────────────────────────────────────────────

/**
 * Read harness-run.json + in-scope UCs, map probe statuses to generative-execution
 * flags, and persist them into .forgecraft/verification-state.json.
 *
 * Called at the end of run_harness so the durable flag is a by-product of the
 * objective run — never a self-report. A UC in scope with no probe result becomes
 * `unrun`. Non-throwing: any failure leaves state untouched and returns [].
 *
 * @param projectRoot - Absolute path to the project root
 * @returns The per-UC flags that were persisted
 */
export function consolidateGenerativeExecution(
  projectRoot: string,
): UcGenerativeExecution[] {
  try {
    const run = readHarnessRun(projectRoot);
    if (!run) return [];

    const lastRunAt = run.timestamp ?? new Date().toISOString();
    const statusByUc = new Map<string, string>();
    for (const r of run.results ?? []) {
      // Keep the worst status when a UC has multiple probes: red > unrun > green.
      const existing = statusByUc.get(r.ucId.toUpperCase());
      statusByUc.set(
        r.ucId.toUpperCase(),
        existing ? worseProbeStatus(existing, r.status) : r.status,
      );
    }

    const report = buildLayerReport(projectRoot);
    const inScope = report.ucs.map((u) => u.id);

    const flags: UcGenerativeExecution[] = inScope.map((ucId) => {
      const raw = statusByUc.get(ucId.toUpperCase());
      return {
        ucId,
        status: probeStatusToGenerative(raw),
        lastRunAt,
        source: "harness-run" as const,
        ...(raw ? { evidence: `probe status: ${raw}` } : {}),
      };
    });

    persistGenerativeExecution(projectRoot, flags);
    return flags;
  } catch {
    return [];
  }
}

/**
 * Compare two raw probe statuses and return the one with greater severity for
 * generative-execution purposes (red beats unrun beats green).
 */
function worseProbeStatus(a: string, b: string): string {
  const rank = (s: string): number => {
    const g = probeStatusToGenerative(s);
    return g === "red" ? 2 : g === "unrun" ? 1 : 0;
  };
  return rank(b) > rank(a) ? b : a;
}

/**
 * Persist the generative-execution flags into verification-state.json via
 * saveVerificationState, preserving existing steps/summaries. Recomposes the
 * verification strategies from the existing state's tags so the cached summary
 * is not zeroed out.
 */
function persistGenerativeExecution(
  projectRoot: string,
  flags: UcGenerativeExecution[],
): void {
  const existing = loadVerificationState(projectRoot);
  const now = new Date().toISOString();
  const tags = (existing?.tags ?? []) as Tag[];

  const templateSets = loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  saveVerificationState(
    projectRoot,
    {
      version: "1",
      projectDir: projectRoot,
      tags,
      language: existing?.language ?? "unknown",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      steps: existing?.steps ?? [],
      generativeExecution: flags,
    },
    composed.verificationStrategies,
  );
}

// ── Override loader ──────────────────────────────────────────────────

/** A validated generative-execution override (UC + non-empty rationale). */
export interface GenerativeExecutionOverride {
  readonly uc: string;
  readonly rationale: string;
}

/**
 * Load generative-execution overrides from forgecraft.yaml.
 * Mirrors loadCascadeDecisions: file-based and auditable.
 *
 * generative_execution:
 *   overrides:
 *     - uc: UC-001
 *       rationale: "Known flaky network probe; verified manually in staging."
 *
 * An override with an empty/whitespace/missing rationale is NOT valid and is
 * silently dropped — a rationale is mandatory for the override to count.
 *
 * @param projectRoot - Absolute project root path
 * @returns Array of valid overrides (may be empty)
 */
export function loadGenerativeExecutionOverrides(
  projectRoot: string,
): GenerativeExecutionOverride[] {
  const yamlPath = join(projectRoot, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return [];
  try {
    const config = yaml.load(
      readFileSync(yamlPath, "utf-8"),
    ) as ForgeCraftConfig;
    const raw = config?.generative_execution?.overrides ?? [];
    const valid: GenerativeExecutionOverride[] = [];
    for (const o of raw) {
      if (!o || typeof o.uc !== "string") continue;
      const rationale =
        typeof o.rationale === "string" ? o.rationale.trim() : "";
      if (rationale.length === 0) continue; // empty rationale = NOT a valid override
      valid.push({ uc: o.uc.toUpperCase(), rationale });
    }
    return valid;
  } catch {
    return [];
  }
}

// ── Pure evaluator (the MX oracle) ───────────────────────────────────

/** Result of evaluating the generative-execution gate for a set of in-scope UCs. */
export interface GenerativeExecutionEvaluation {
  /** Overall normalized status across in-scope UCs. */
  readonly status: GenerativeExecutionStatus;
  /** In-scope UCs that are red (not green) and NOT overridden — these block. */
  readonly reds: string[];
  /** In-scope non-green UCs that are excused by a valid override. */
  readonly overridden: string[];
  /** True when at least one in-scope UC is red and not overridden. */
  readonly blocked: boolean;
}

/**
 * PURE evaluator: decides whether the generative-execution gate blocks.
 *
 * No file writes, no process.exit, no console output. Reads persisted flags and
 * overrides only through its arguments-derived loaders (loadVerificationState /
 * loadGenerativeExecutionOverrides are read-only). Reusable as the MX oracle.
 *
 * A UC is a blocker when it is in scope and its status is NOT green (i.e. red or
 * unrun) and it is not excused by a valid override. `unrun` blocks: no objective
 * evidence of working code is treated the same as failing evidence for acceptance.
 *
 * @param projectRoot - Absolute project root path (read-only access)
 * @param inScopeUcIds - The UC ids that must be green for this acceptance
 * @returns Evaluation with overall status, blocking reds, and overridden UCs
 */
export function evaluateGenerativeExecution(
  projectRoot: string,
  inScopeUcIds: ReadonlyArray<string>,
): GenerativeExecutionEvaluation {
  const state = loadVerificationState(projectRoot);
  const flagByUc = new Map<string, GenerativeExecutionStatus>();
  for (const f of state?.generativeExecution ?? []) {
    flagByUc.set(f.ucId.toUpperCase(), f.status);
  }

  const overrides = new Set(
    loadGenerativeExecutionOverrides(projectRoot).map((o) =>
      o.uc.toUpperCase(),
    ),
  );

  const reds: string[] = [];
  const overridden: string[] = [];

  for (const ucId of inScopeUcIds) {
    const key = ucId.toUpperCase();
    const status = flagByUc.get(key) ?? "unrun";
    if (status === "green") continue;
    if (overrides.has(key)) {
      overridden.push(ucId);
    } else {
      reds.push(ucId);
    }
  }

  const blocked = reds.length > 0;
  const status: GenerativeExecutionStatus = blocked ? "red" : "green";

  return { status, reds, overridden, blocked };
}
