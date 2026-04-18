/**
 * Extended action-specific parameters for the forgecraft schema.
 * Merged into forgecraftSchema via z.object().merge().
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";

/**
 * Action-specific parameters used by: generate_session_prompt, record_verification,
 * generate_adr, set_cascade_requirement, setup_project, cnt_add_node, start_hardening.
 */
export const forgecraftExtendedParams = z.object({
  item_description: z
    .string()
    .optional()
    .describe(
      "Roadmap item description for this session. Used by: generate_session_prompt. Should include actor, behavior, and postcondition.",
    ),
  acceptance_criteria: z
    .array(z.string())
    .optional()
    .describe(
      "Checkable acceptance criteria. Used by: generate_session_prompt. If omitted, defaults are generated.",
    ),
  scope_note: z
    .string()
    .optional()
    .describe(
      "Explicit out-of-scope statement — what this session must NOT touch. Used by: generate_session_prompt.",
    ),
  session_type: z
    .enum(["feature", "fix", "refactor", "test", "docs", "chore"])
    .optional()
    .describe(
      "Conventional commit type for session output. Used by: generate_session_prompt. Default: feature.",
    ),
  uncertainty_level: z
    .enum([
      "deterministic",
      "behavioral",
      "stochastic",
      "heuristic",
      "generative",
    ])
    .optional()
    .describe(
      "Filter verification strategies by uncertainty level. Used by: get_verification_strategy.",
    ),
  step_id: z
    .string()
    .optional()
    .describe(
      "Verification step ID to record an acceptance decision for (e.g., 'write-hurl-spec'). Used by: record_verification.",
    ),
  phase_id: z
    .string()
    .optional()
    .describe(
      "Verification phase ID containing the step (e.g., 'contract-definition'). Used by: record_verification.",
    ),
  strategy_tag: z
    .enum(ALL_TAGS as unknown as [string, ...string[]])
    .optional()
    .describe(
      "Tag whose verification strategy the step belongs to (e.g., 'API', 'GAME'). Used by: record_verification.",
    ),
  step_status: z
    .enum(["pass", "fail", "skipped"] as const)
    .optional()
    .describe(
      "Acceptance decision for the verification step: pass | fail | skipped. Used by: record_verification.",
    ),
  recorded_by: z
    .string()
    .optional()
    .describe(
      "Who recorded this decision (e.g., 'claude-sonnet-4-5', 'human', CI name). Used by: record_verification. Defaults to 'unknown'.",
    ),
  show_pending_only: z
    .boolean()
    .optional()
    .describe(
      "Show only pending/failed steps. Used by: verification_status. Default: false.",
    ),
  notes: z
    .string()
    .optional()
    .describe(
      "Evidence or justification for a verification decision. Used by: record_verification.",
    ),
  adr_title: z
    .string()
    .optional()
    .describe(
      "Short imperative title of the architectural decision (e.g. 'Use PostgreSQL for primary storage'). Used by: generate_adr.",
    ),
  adr_context: z
    .string()
    .optional()
    .describe(
      "The situation that forced this decision — constraints, requirements, forces at play. Used by: generate_adr.",
    ),
  adr_decision: z
    .string()
    .optional()
    .describe(
      "What was decided and why this option was chosen over alternatives. Used by: generate_adr.",
    ),
  adr_alternatives: z
    .array(z.string())
    .optional()
    .describe(
      "List of alternatives considered and why each was rejected. Used by: generate_adr.",
    ),
  adr_consequences: z
    .string()
    .optional()
    .describe(
      "Positive and negative consequences of the decision — what becomes easier, harder, or constrained. Used by: generate_adr.",
    ),
  cascade_step: z
    .enum([
      "functional_spec",
      "architecture_diagrams",
      "constitution",
      "adrs",
      "behavioral_contracts",
    ] as const)
    .optional()
    .describe(
      "Which cascade step to configure. Used by: set_cascade_requirement.",
    ),
  cascade_required: z
    .boolean()
    .optional()
    .describe(
      "Whether the cascade step must pass before implementation begins. Used by: set_cascade_requirement.",
    ),
  cascade_rationale: z
    .string()
    .optional()
    .describe(
      "Why was this cascade decision made? Required for: set_cascade_requirement.",
    ),
  cascade_decided_by: z
    .enum(["assistant", "user"])
    .optional()
    .describe(
      "Who made this cascade decision. Used by: set_cascade_requirement. Defaults to 'assistant'.",
    ),
  spec_path: z
    .string()
    .optional()
    .describe(
      "Path to an existing spec file (markdown, txt, OpenAPI). Used by: setup_project (phase 1).",
    ),
  spec_text: z
    .string()
    .optional()
    .describe(
      "Paste spec text directly (markdown prose, OpenAPI description, etc.). Used by: setup_project (phase 1).",
    ),
  mvp: z
    .boolean()
    .optional()
    .describe(
      "Phase 2 answer: true = MVP stage (minimal ceremony, expect changes), false = production (full quality gates). Used by: setup_project (phase 2 — provide together with scope_complete and has_consumers).",
    ),
  scope_complete: z
    .boolean()
    .optional()
    .describe(
      "Phase 2 answer: true = scope is finalized (proceed with full cascade), false = scope still evolving (lighter cascade). Used by: setup_project (phase 2).",
    ),
  has_consumers: z
    .boolean()
    .optional()
    .describe(
      "Phase 2 answer: true = existing users or downstream consumers (behavioral contracts required), false = no consumers yet. Used by: setup_project (phase 2).",
    ),
  use_codeseeker: z
    .boolean()
    .optional()
    .describe(
      "Phase 2 answer: whether to add CodeSeeker for semantic code search. " +
        "Presented as Q4 in Phase 1. Defaults to true when omitted. " +
        "Set false if you already have an equivalent semantic search tool. Used by: setup_project (phase 2).",
    ),
  use_playwright: z
    .boolean()
    .optional()
    .describe(
      "Phase 2 answer: whether to add Playwright MCP for browser automation and E2E/API testing. " +
        "Only asked in Phase 1 for WEB-REACT, WEB-STATIC, or API projects. Defaults to true when omitted. " +
        "Set false if you already have an equivalent browser testing tool. Used by: setup_project (phase 2).",
    ),
  tool_sample_split: z
    .enum(["tool_and_sample", "tool_only", "content_only"])
    .optional()
    .describe(
      "Phase 2 answer: how to handle a spec that conflates a generative tool with a specific " +
        "named creative output (e.g. an AI ghostwriter spec that also describes a specific novel). " +
        "tool_and_sample — build the core tool; write docs/sample-outcome.md with the creative work " +
        "as the first acceptance test. tool_only — named content is illustrative, ignore it. " +
        "content_only — the goal is the creative work itself; tool is an implementation detail. " +
        "Only relevant when Phase 1 reports a tool_vs_sample_output ambiguity. Used by: setup_project (phase 2).",
    ),
  project_type_override: z
    .string()
    .optional()
    .describe(
      "Phase 2: override the inferred project type when ambiguities were reported in phase 1. " +
        'Examples: "docs", "cli", "api", "library", "cli+library", "cli+api". ' +
        "Provide this when the AI detected conflicting signals and you want to specify the correct interpretation. " +
        "Used by: setup_project (phase 2).",
    ),
  cnt_domain: z
    .string()
    .optional()
    .describe(
      "Domain prefix for a CNT leaf node. Lowercase kebab-case. E.g. 'tools', 'shared'. Used by: cnt_add_node.",
    ),
  cnt_concern: z
    .string()
    .optional()
    .describe(
      "Concern name within a CNT domain. Lowercase kebab-case. E.g. 'routing', 'auth'. Used by: cnt_add_node.",
    ),
  cnt_content: z
    .string()
    .optional()
    .describe(
      "Markdown content for a CNT leaf node (≤30 lines). If omitted, a placeholder is generated. Used by: cnt_add_node.",
    ),
  deployment_url: z
    .string()
    .optional()
    .describe(
      "Override deployment URL for smoke test. Used by: start_hardening. Default: read from forgecraft.yaml or 'http://localhost:3000'.",
    ),
  skip_load_test: z
    .boolean()
    .optional()
    .describe(
      "Skip load test phase (HARDEN-003). Used by: start_hardening. Default: true (skip when no load gates defined).",
    ),
  harness_uc_ids: z
    .array(z.string())
    .optional()
    .describe(
      "UC ids to target (e.g. ['UC-001', 'UC-003']). Used by: generate_harness, run_harness.",
    ),
  harness_timeout_ms: z
    .number()
    .optional()
    .describe(
      "Timeout per probe in milliseconds. Used by: run_harness. Default: 30000.",
    ),
  env_probe_force: z
    .boolean()
    .optional()
    .describe(
      "Overwrite existing env probe files. Used by: generate_env_probe. Default: false.",
    ),
  env_probe_timeout_ms: z
    .number()
    .optional()
    .describe(
      "Timeout per env probe in milliseconds. Used by: run_env_probe. Default: 30000.",
    ),
  slo_probe_force: z
    .boolean()
    .optional()
    .describe(
      "Overwrite existing slo probe files. Used by: generate_slo_probe. Default: false.",
    ),
  slo_probe_timeout_ms: z
    .number()
    .optional()
    .describe(
      "Timeout per slo probe in milliseconds. Used by: run_slo_probe. Default: 30000.",
    ),
});
