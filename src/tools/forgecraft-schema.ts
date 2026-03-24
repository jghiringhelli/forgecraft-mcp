/**
 * Schema and type definitions for the unified forgecraft tool router.
 *
 * All action discriminators, parameter definitions, and the unified ForgecraftArgs type.
 */

import { z } from "zod";
import {
  ALL_TAGS,
  CONTENT_TIERS,
  ALL_OUTPUT_TARGETS,
} from "../shared/types.js";
export const ACTIONS = [
  "setup_project",
  "refresh",
  "scaffold",
  "generate",
  "audit",
  "review",
  "list",
  "classify",
  "add_hook",
  "add_module",
  "configure_mcp",
  "get_reference",
  "convert",
  "verify",
  "advice",
  "metrics",
  "check_cascade",
  "generate_session_prompt",
  "get_verification_strategy",
  "record_verification",
  "verification_status",
  "generate_adr",
  "contribute_gate",
  "generate_diagram",
  "set_cascade_requirement",
  "close_cycle",
  "generate_roadmap",
  "cnt_add_node",
  "start_hardening",
] as const;

export type Action = (typeof ACTIONS)[number];

const LIST_RESOURCES = ["tags", "hooks", "skills"] as const;
const REFERENCE_RESOURCES = [
  "nfr",
  "design_patterns",
  "playbook",
  "guidance",
] as const;

// ── Schema ──────────────────────────────────────────────────────────

export const forgecraftSchema = z.object({
  action: z
    .enum(ACTIONS as unknown as [string, ...string[]])
    .describe(
      "Operation to perform.\n\n" +
        "Available actions:\n" +
        "  setup_project       — onboard a new or existing project (two-phase: analyze then calibrate)\n" +
        "  scaffold            — generate project structure files (.claude/, hooks, docs stubs)\n" +
        "  check_cascade       — verify all 5 GS cascade steps complete before implementation begins\n" +
        "  generate_session_prompt — produce a bound session prompt for a single roadmap item (gated on cascade)\n" +
        "  generate_diagram    — generate Mermaid C4 context diagram from spec artifacts\n" +
        "  refresh             — re-sync instruction files after tag changes\n" +
        "  audit               — check project standards compliance\n" +
        "  review              — structured code review checklist\n" +
        "  set_cascade_requirement — revise a cascade step as required or optional\n" +
        "  set_release_phase   — set project release phase (development/pre-release/production)\n" +
        "  contribute_gate     — submit generalizable gates to the community registry\n" +
        "  verification_status — full per-project acceptance report\n" +
        "  add_project_gate    — add a project-specific quality gate\n" +
        "  list_quality_gates  — list all quality gates\n" +
        "  export_taxonomy     — export tag taxonomy\n" +
        "  generate_adr        — emit a structured Architecture Decision Record into docs/adrs/\n" +
        "  create_exception    — create hook false-positive exception\n" +
        "  review              — structured code review checklist\n" +
        "  list                — discover available tags/hooks/skills\n" +
        "  classify            — suggest tags for a project description\n" +
        "  add_hook            — add a quality hook\n" +
        "  add_module          — add a module scaffold\n" +
        "  configure_mcp       — configure MCP servers\n" +
        "  get_reference       — get design patterns/NFR/playbook/guidance\n" +
        "  convert             — generate migration plan\n" +
        "  verify              — run tests and score §4.3 GS properties\n" +
        "  advice              — quality cycle checklist\n" +
        "  metrics             — external code quality report\n" +
        "  get_verification_strategy — uncertainty-aware verification plan\n" +
        "  record_verification — upsert acceptance decision for a verification step\n\n" +
        "  close_cycle         — end-of-cycle gate: re-run cascade, assess gates, promote generalizable ones\n\n" +
        "  generate_roadmap    — generate a phased docs/roadmap.md from PRD.md + use-cases.md (gated on cascade)\n\n" +
        "  cnt_add_node        — add a new CNT leaf node (.claude/standards/<domain>-<concern>.md)\n\n" +
        "  start_hardening     — generate hardening session prompts (pre-release → rc → load test)\n\n" +
        "Quick usage examples:\n" +
        '  To run a cascade check:              action="check_cascade"\n' +
        '  To generate a session prompt:        action="generate_session_prompt"\n' +
        '  To onboard a new project:            action="setup_project"\n' +
        '  To scaffold an existing project:     action="scaffold"',
    ),
  project_dir: z
    .string()
    .optional()
    .describe(
      "Absolute path to the project root. Required for: setup_project, refresh, scaffold, generate, audit, add_hook, add_module, configure_mcp, convert, verify, metrics, record_verification, verification_status, generate_adr. Optional for: classify, advice, get_verification_strategy.",
    ),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe(
      "Project classification tags. Used by: scaffold, generate, audit, review, add_module, configure_mcp, get_reference (not needed for resource=guidance), convert, list (as filter).",
    ),
  project_name: z
    .string()
    .optional()
    .describe("Human-readable project name. Used by: scaffold, generate."),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .optional()
    .describe(
      "AI assistant targets (claude, cursor, copilot, windsurf, cline, aider). Used by: scaffold, generate, refresh.",
    ),
  tier: z
    .enum(CONTENT_TIERS as unknown as [string, ...string[]])
    .optional()
    .describe("Content depth: core, recommended, optional. Used by: refresh."),
  resource: z
    .enum([...LIST_RESOURCES, ...REFERENCE_RESOURCES] as unknown as [
      string,
      ...string[],
    ])
    .optional()
    .describe(
      "Sub-resource for list (tags|hooks|skills) and get_reference (nfr|design_patterns|playbook|guidance). Use 'guidance' to retrieve GS session-loop, context-loading, incremental-cascade, bound-roadmap, and diagnostic-checklist procedures on demand — 'guidance' does not require the tags parameter.",
    ),
  name: z
    .string()
    .optional()
    .describe(
      "Item name. Used by: add_hook (hook name), add_module (module name).",
    ),
  language: z
    .enum(["typescript", "python"])
    .optional()
    .describe(
      "Programming language. Used by: scaffold, add_module. Default: typescript.",
    ),
  description: z
    .string()
    .optional()
    .describe("Natural language description. Used by: classify."),
  dry_run: z
    .boolean()
    .optional()
    .describe("Preview without writing files. Used by: scaffold."),
  force: z
    .boolean()
    .optional()
    .describe("Overwrite existing files. Used by: scaffold."),
  sentinel: z
    .boolean()
    .optional()
    .describe(
      "Generate sentinel CLAUDE.md (~50 lines) + .claude/standards/ domain files instead of one large file. Default: true. Set to false for traditional monolithic CLAUDE.md. Used by: scaffold, refresh.",
    ),
  apply: z
    .boolean()
    .optional()
    .describe("Apply changes (vs preview). Used by: refresh. Default: false."),
  merge: z
    .boolean()
    .optional()
    .describe(
      "Merge with existing instruction files. Used by: generate. Default: true.",
    ),
  compact: z
    .boolean()
    .optional()
    .describe(
      "Strip explanatory tail clauses and deduplicate bullet lines (~20-40% smaller output). Used by: generate, scaffold, refresh.",
    ),
  release_phase: z
    .enum(["development", "pre-release", "release-candidate", "production"])
    .optional()
    .describe(
      "Current release cycle phase. Controls which test gates are shown as required vs. advisory. Used by: setup, generate, refresh. Default: development.",
    ),
  scope: z
    .enum(["comprehensive", "focused"])
    .optional()
    .describe("Review scope. Used by: review. Default: comprehensive."),
  scan_depth: z
    .enum(["quick", "full"])
    .optional()
    .describe("Analysis depth. Used by: convert. Default: quick."),
  tag: z
    .enum(ALL_TAGS as unknown as [string, ...string[]])
    .optional()
    .describe("Single tag filter. Used by: add_hook."),
  add_tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Tags to add during refresh."),
  remove_tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Tags to remove during refresh."),
  include_anti_patterns: z
    .boolean()
    .optional()
    .describe("Scan for anti-patterns. Used by: audit. Default: true."),
  custom_servers: z
    .record(
      z.object({
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string()).optional(),
      }),
    )
    .optional()
    .describe("Custom MCP servers. Used by: configure_mcp."),
  auto_approve_tools: z
    .boolean()
    .optional()
    .describe(
      "Auto-approve MCP tool calls. Used by: configure_mcp. Default: true.",
    ),
  include_remote: z
    .boolean()
    .optional()
    .describe(
      "Query remote MCP registry. Used by: configure_mcp. Default: false.",
    ),
  remote_registry_url: z
    .string()
    .optional()
    .describe("Remote MCP registry URL override. Used by: configure_mcp."),
  max_servers: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max MCP servers to configure. Used by: configure_mcp."),
  test_command: z
    .string()
    .optional()
    .describe("Test command override. Used by: verify. Default: npm test."),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Test suite timeout in ms. Used by: verify. Default: 120000."),
  pass_threshold: z
    .number()
    .int()
    .min(0)
    .max(14)
    .optional()
    .describe(
      "Minimum §4.3 GS score (0–14, 7 properties × 2) required for overall pass. Used by: verify. Default: 11.",
    ),
  include_mutation: z
    .boolean()
    .optional()
    .describe(
      "Run Stryker mutation testing (slow, opt-in). Used by: metrics. Default: false.",
    ),
  coverage_dir: z
    .string()
    .optional()
    .describe(
      "Path to existing coverage report directory. Used by: metrics. Defaults to coverage/ relative to project_dir.",
    ),
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
});

export type ForgecraftArgs = z.infer<typeof forgecraftSchema>;



