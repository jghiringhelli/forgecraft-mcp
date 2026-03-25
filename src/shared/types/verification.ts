/**
 * Verification strategy types: uncertainty levels, phases, steps, and acceptance state.
 */

import type { Tag } from "./project.js";

/**
 * Uncertainty level for a domain — how well-defined the expected output is
 * from specification alone. Determines which verification techniques close the gap.
 *
 * - deterministic: formal spec exists (schema, Hurl suite, type contracts) → automated loop
 * - behavioral: UI/navigation behavior → Playwright paths + screenshot + vision assertion
 * - stochastic: balance, statistical, simulation outputs → Monte Carlo + convergence bounds
 * - heuristic: hyperparameter search, optimization → warm runs + pruning + plateau detection
 * - generative: art, content, animation → MCP tool output + diff-based human approval
 */
export type UncertaintyLevel =
  | "deterministic"
  | "behavioral"
  | "stochastic"
  | "heuristic"
  | "generative";

/** A single executable verification step within a phase. */
export interface VerificationStep {
  /** Unique identifier for this step. */
  readonly id: string;
  /** What the step does in one line. */
  readonly instruction: string;
  /** What artifact, output, or assertion constitutes a pass. */
  readonly contract: string;
  /** Tools or commands to use (MCP tool names, CLI commands, test frameworks). */
  readonly tools: string[];
  /** Expected output format or schema that the next step can consume. */
  readonly expected_output: string;
  /** Hard pass/fail criterion. If this is not met, the phase does not advance. */
  readonly pass_criterion: string;
  /** Whether human review is required before advancing to the next step. */
  readonly requires_human_review?: boolean;
}

/** A phase within a verification strategy. */
export interface VerificationPhase {
  /** Phase identifier (e.g., contract-definition, execution, evidence). */
  readonly id: string;
  /** Human-readable phase title. */
  readonly title: string;
  /**
   * Why this phase exists in this domain.
   * Maps to a specific uncertainty dimension being closed.
   */
  readonly rationale: string;
  /** Ordered steps to execute within this phase. */
  readonly steps: VerificationStep[];
}

/** Full verification strategy for a tag. On-demand — not emitted into instruction files. */
export interface VerificationStrategy {
  /** Tag this strategy applies to. */
  readonly tag: Tag;
  /** section discriminator for YAML loading. */
  readonly section: "verification";
  /** Human-readable title. */
  readonly title: string;
  /**
   * Description of what type of uncertainty this domain has and
   * what the strategy closes.
   */
  readonly description: string;
  /** One or more uncertainty levels this strategy addresses. */
  readonly uncertainty_levels: UncertaintyLevel[];
  /**
   * Specification completeness score S ∈ [0.0, 1.0] achievable after running
   * this strategy for this domain. Used to estimate I(S) ≈ 1/S.
   */
  readonly completeness_ceiling: number;
  /** Ordered verification phases. */
  readonly phases: VerificationPhase[];
}

// ── Verification Acceptance State ───────────────────────────────────

/**
 * Acceptance status for a single verification step within a project.
 * - pending: not yet executed or reviewed
 * - pass: automated criterion met (or human approved for requires_human_review steps)
 * - fail: criterion not met — blocks S advancement for this phase
 * - skipped: explicitly excluded from this project (with required justification)
 */
export type VerificationStepStatus = "pending" | "pass" | "fail" | "skipped";

/** Persisted record of one step's acceptance decision for a specific project. */
export interface VerificationStepRecord {
  /** Tag the strategy belongs to (e.g., "API", "GAME"). */
  readonly strategyTag: Tag;
  /** Phase ID within that strategy (e.g., "contract-definition"). */
  readonly phaseId: string;
  /** Step ID within that phase (e.g., "write-hurl-spec"). */
  readonly stepId: string;
  /** Acceptance status. */
  readonly status: VerificationStepStatus;
  /** ISO 8601 timestamp of the last status change. */
  readonly recordedAt: string;
  /**
   * Free-form notes: tool output excerpt, vision assertion result,
   * human approval comment, or skip justification.
   */
  readonly notes?: string;
  /** Identifier of who recorded this (e.g., "claude-sonnet-4-5", "human"). */
  readonly recordedBy?: string;
}

/**
 * Per-tag summary of realized specification completeness based on
 * accepted steps vs total steps in the strategy.
 * S_realized = (passing steps) / (total non-skipped steps)
 */
export interface VerificationTagSummary {
  readonly tag: Tag;
  /** Number of steps with status=pass. */
  readonly passedSteps: number;
  /** Number of steps with status=fail. */
  readonly failedSteps: number;
  /** Number of steps with status=pending. */
  readonly pendingSteps: number;
  /** Number of steps with status=skipped. */
  readonly skippedSteps: number;
  /** Total steps in the strategy (all phases). */
  readonly totalSteps: number;
  /**
   * Realized S value: passedSteps / (totalSteps - skippedSteps).
   * S = 0.0 if all steps are pending or failed.
   * S = 1.0 if all non-skipped steps are passing.
   */
  readonly s_realized: number;
  /**
   * Maximum achievable S given the strategy's completeness_ceiling.
   * s_realized is always ≤ completeness_ceiling.
   */
  readonly completeness_ceiling: number;
  /** Whether any step with requires_human_review is still pending. */
  readonly awaitingHumanReview: boolean;
}

/**
 * Project-level verification state file.
 * Stored at {projectDir}/.forgecraft/verification-state.json.
 * Created on first `record_verification` call; updated on every subsequent call.
 * Community-extensible: any tag with a verification.yaml can contribute records.
 */
export interface VerificationStateFile {
  /** Schema version for forward compatibility. */
  readonly version: "1";
  /** Project root path (absolute). Used for context, not for path resolution. */
  readonly projectDir: string;
  /** Active project tags at the time of last update. */
  readonly tags: Tag[];
  /** Primary language of the project. */
  readonly language: string;
  /** ISO 8601 timestamp of file creation. */
  readonly createdAt: string;
  /** ISO 8601 timestamp of last update. */
  readonly updatedAt: string;
  /** All step records, one per (strategyTag, phaseId, stepId) combination. */
  readonly steps: VerificationStepRecord[];
  /**
   * Per-tag summary computed from steps at read time.
   * Stored as a cache — always recomputed from steps when writing.
   */
  readonly summary: VerificationTagSummary[];
  /**
   * Aggregate realized S across all active tags:
   * weighted mean of per-tag s_realized, weight = completeness_ceiling.
   */
  readonly aggregate_s: number;
}
