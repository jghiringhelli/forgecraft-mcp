/**
 * Unified forgecraft tool router.
 *
 * Consolidates 15 individual MCP tools into a single tool with an `action`
 * discriminator. This dramatically reduces token overhead since MCP sends
 * every tool schema with every request (~70% reduction from 16→2 tools).
 *
 * All business logic lives in the original handler files — this module
 * is a thin dispatch layer that maps unified params to handler-specific args.
 */

import { z } from "zod";
import {
  ALL_TAGS,
  CONTENT_TIERS,
  ALL_OUTPUT_TARGETS,
} from "../shared/types.js";
import type { Tag } from "../shared/types.js";

// ── Handler imports ─────────────────────────────────────────────────
import {
  listTagsHandler,
  listHooksHandler,
  listSkillsHandler,
} from "./list.js";
import { classifyProjectHandler } from "./classify.js";
import { scaffoldProjectHandler } from "./scaffold.js";
import { generateInstructionsHandler } from "./generate-claude-md.js";
import { auditProjectHandler } from "./audit.js";
import { addHookHandler } from "./add-hook.js";
import { addModuleHandler } from "./add-module.js";
import { configureMcpHandler } from "./configure-mcp.js";
import { getNfrTemplateHandler } from "./get-nfr.js";
import {
  getDesignReferenceHandler,
  getGuidanceHandler,
} from "./get-reference.js";
import { getPlaybookHandler } from "./get-playbook.js";
import { convertExistingHandler } from "./convert.js";
import { reviewProjectHandler } from "./review.js";
import { refreshProjectHandler } from "./refresh-project.js";
import { verifyHandler } from "./verify.js";
import { adviceHandler } from "./advice.js";
import { metricsHandler } from "./metrics.js";
import { checkCascadeHandler } from "./check-cascade.js";
import { generateSessionPromptHandler } from "./generate-session-prompt.js";
import { getVerificationStrategyHandler } from "./get-verification-strategy.js";
import {
  recordVerificationHandler,
  getVerificationStatusHandler,
} from "./verification-state.js";
import { generateAdrHandler } from "./generate-adr.js";

// ── Constants ───────────────────────────────────────────────────────

const ACTIONS = [
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
] as const;

type Action = (typeof ACTIONS)[number];

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
      "Operation to perform: refresh (re-sync project), scaffold (generate structure), " +
        "generate (instruction files only), audit (check standards), review (code review checklist), " +
        "list (discover tags/hooks/skills), classify (suggest tags), add_hook, add_module, " +
        "configure_mcp, get_reference (design patterns/NFR/playbook), convert (migration plan), " +
        "verify (run tests + score all seven §4.3 GS properties 0–14 + report layer violations), " +
        "advice (quality cycle checklist + tool stack + example configs for your tags), " +
        "metrics (external code quality report: LOC, coverage, layer violations, dead code, complexity, mutation), " +
        "check_cascade (derivability gate: verify all 5 GS init cascade steps are complete before implementation begins), " +
        "generate_session_prompt (produce a bound, self-contained session prompt for a single roadmap item), " +
        "get_verification_strategy (uncertainty-aware verification plan: contracts + execution technique per domain — API=Hurl, WEB-REACT=Playwright+vision, GAME=headless sim+Aseprite, FINTECH=statistical sim, ML=warm runs+pruning), " +
        "record_verification (upsert acceptance decision for one verification step, returns updated S_realized), " +
        "verification_status (full per-project acceptance report: S per tag, blocking items, aggregate S), " +
        "generate_adr (emit a structured Architecture Decision Record file into docs/adrs/ with auto-sequenced number).",
    ),
  project_dir: z
    .string()
    .optional()
    .describe(
      "Absolute path to the project root. Required for: refresh, scaffold, generate, audit, add_hook, add_module, configure_mcp, convert, verify, metrics, record_verification, verification_status, generate_adr. Optional for: classify, advice, get_verification_strategy.",
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
});

type ForgecraftArgs = z.infer<typeof forgecraftSchema>;
type ToolResult = { content: Array<{ type: "text"; text: string }> };

// ── Handler ─────────────────────────────────────────────────────────

/**
 * Unified handler that dispatches to the appropriate tool handler
 * based on the `action` parameter.
 *
 * @param args - Validated unified tool input
 * @returns MCP tool response from the delegated handler
 */
export async function forgecraftHandler(
  args: ForgecraftArgs,
): Promise<ToolResult> {
  const action = args.action as Action;

  switch (action) {
    case "list":
      return dispatchList(args);

    case "get_reference":
      return dispatchGetReference(args);

    case "classify":
      return classifyProjectHandler({
        project_dir: args.project_dir,
        description: args.description,
      });

    case "refresh":
      return refreshProjectHandler({
        project_dir: requireParam(args.project_dir, "project_dir", "refresh"),
        apply: args.apply ?? false,
        tier: args.tier,
        add_tags: args.add_tags,
        remove_tags: args.remove_tags,
        output_targets: args.output_targets,
        sentinel: args.sentinel ?? true,
      });

    case "scaffold":
      return scaffoldProjectHandler({
        tags: requireParam(args.tags, "tags", "scaffold"),
        project_dir: requireParam(args.project_dir, "project_dir", "scaffold"),
        project_name: args.project_name ?? "My Project",
        language: args.language ?? "typescript",
        dry_run: args.dry_run ?? false,
        force: args.force ?? false,
        sentinel: args.sentinel ?? true,
        output_targets: args.output_targets ?? ["claude"],
      });

    case "generate":
      return generateInstructionsHandler({
        tags: requireParam(args.tags, "tags", "generate"),
        project_dir: args.project_dir,
        project_name: args.project_name ?? "My Project",
        output_targets: args.output_targets ?? ["claude"],
        merge_with_existing: args.merge ?? true,
        compact: args.compact ?? false,
        release_phase: args.release_phase ?? "development",
      });

    case "audit":
      return auditProjectHandler({
        tags: requireParam(args.tags, "tags", "audit"),
        project_dir: requireParam(args.project_dir, "project_dir", "audit"),
        include_anti_patterns: args.include_anti_patterns ?? true,
      });

    case "review":
      return reviewProjectHandler({
        tags: requireParam(args.tags, "tags", "review"),
        scope: args.scope ?? "comprehensive",
      });

    case "add_hook":
      return addHookHandler({
        hook: requireParam(args.name, "name", "add_hook"),
        project_dir: requireParam(args.project_dir, "project_dir", "add_hook"),
        tag: args.tag,
      });

    case "add_module":
      return addModuleHandler({
        module_name: requireParam(args.name, "name", "add_module"),
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "add_module",
        ),
        tags: args.tags ?? ["UNIVERSAL"],
        language: args.language ?? "typescript",
      });

    case "configure_mcp":
      return configureMcpHandler({
        tags: requireParam(args.tags, "tags", "configure_mcp"),
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "configure_mcp",
        ),
        custom_servers: args.custom_servers,
        auto_approve_tools: args.auto_approve_tools ?? true,
        include_remote: args.include_remote ?? false,
        remote_registry_url: args.remote_registry_url,
        max_servers: args.max_servers,
      });

    case "convert":
      return convertExistingHandler({
        tags: requireParam(args.tags, "tags", "convert"),
        project_dir: requireParam(args.project_dir, "project_dir", "convert"),
        scan_depth: args.scan_depth ?? "quick",
      });

    case "verify":
      return verifyHandler({
        project_dir: requireParam(args.project_dir, "project_dir", "verify"),
        test_command: args.test_command,
        timeout_ms: args.timeout_ms ?? 120_000,
        pass_threshold: args.pass_threshold ?? 11,
      });

    case "advice":
      return adviceHandler({
        project_dir: args.project_dir,
        tags: args.tags as string[] | undefined,
      });

    case "metrics":
      return metricsHandler({
        project_dir: requireParam(args.project_dir, "project_dir", "metrics"),
        include_mutation: args.include_mutation ?? false,
        coverage_dir: args.coverage_dir,
      });

    case "check_cascade":
      return checkCascadeHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "check_cascade",
        ),
      });

    case "generate_session_prompt":
      return generateSessionPromptHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "generate_session_prompt",
        ),
        item_description: requireParam(
          args.item_description,
          "item_description",
          "generate_session_prompt",
        ),
        acceptance_criteria: args.acceptance_criteria,
        scope_note: args.scope_note,
        session_type: args.session_type ?? "feature",
      });

    case "get_verification_strategy":
      return getVerificationStrategyHandler({
        tags: requireParam(args.tags, "tags", "get_verification_strategy"),
        phase: args.name,
        uncertainty_level: args.uncertainty_level as
          | "deterministic"
          | "behavioral"
          | "stochastic"
          | "heuristic"
          | "generative"
          | undefined,
        project_dir: args.project_dir,
      });

    case "record_verification":
      return recordVerificationHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "record_verification",
        ),
        tags: requireParam(args.tags, "tags", "record_verification") as Tag[],
        language: args.language,
        strategy_tag: requireParam(
          args.strategy_tag,
          "strategy_tag",
          "record_verification",
        ) as Tag,
        phase_id: requireParam(
          args.phase_id,
          "phase_id",
          "record_verification",
        ),
        step_id: requireParam(args.step_id, "step_id", "record_verification"),
        status: requireParam(
          args.step_status,
          "step_status",
          "record_verification",
        ) as "pass" | "fail" | "skipped",
        notes: args.notes,
        recorded_by: args.recorded_by,
      });

    case "verification_status":
      return getVerificationStatusHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "verification_status",
        ),
        tags: args.tags as Tag[] | undefined,
        show_pending_only: args.show_pending_only ?? false,
      });

    case "generate_adr":
      return generateAdrHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "generate_adr",
        ),
        title: requireParam(args.adr_title, "adr_title", "generate_adr"),
        context: args.adr_context,
        decision: args.adr_decision,
        alternatives: args.adr_alternatives,
        consequences: args.adr_consequences,
      });

    default:
      return errorResult(
        `Unknown action: ${String(action satisfies never)}. Valid actions: ${ACTIONS.join(", ")}`,
      );
  }
}

// ── Dispatch Helpers ────────────────────────────────────────────────

/**
 * Dispatch the `list` action based on the `resource` sub-parameter.
 */
async function dispatchList(args: ForgecraftArgs): Promise<ToolResult> {
  const resource = args.resource ?? "tags";

  switch (resource) {
    case "tags":
      return listTagsHandler();
    case "hooks":
      return listHooksHandler({ tags: args.tags });
    case "skills":
      return listSkillsHandler({ tags: args.tags });
    default:
      return errorResult(
        `Invalid resource '${resource}' for list action. Use: tags, hooks, or skills.`,
      );
  }
}

/**
 * Dispatch the `get_reference` action based on the `resource` sub-parameter.
 */
async function dispatchGetReference(args: ForgecraftArgs): Promise<ToolResult> {
  const resource = args.resource ?? "design_patterns";

  switch (resource) {
    case "nfr": {
      const tags = requireParam(args.tags, "tags", "get_reference[nfr]");
      return getNfrTemplateHandler({ tags });
    }
    case "design_patterns": {
      const tags = requireParam(
        args.tags,
        "tags",
        "get_reference[design_patterns]",
      );
      return getDesignReferenceHandler({ tags });
    }
    case "playbook": {
      const tags = requireParam(args.tags, "tags", "get_reference[playbook]");
      return getPlaybookHandler({ tags, phase: args.name });
    }
    case "guidance":
      return getGuidanceHandler();
    default:
      return errorResult(
        `Invalid resource '${resource}' for get_reference action. Use: nfr, design_patterns, playbook, or guidance.`,
      );
  }
}

// ── Utilities ───────────────────────────────────────────────────────

/**
 * Require a parameter that is mandatory for a given action.
 * Throws with a clear error if missing.
 *
 * @param value - The parameter value (may be undefined)
 * @param paramName - Parameter name for the error message
 * @param action - Action name for context
 * @returns The non-undefined value
 */
function requireParam<T>(
  value: T | undefined,
  paramName: string,
  action: string,
): T {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new Error(
      `Missing required parameter '${paramName}' for action '${action}'.`,
    );
  }
  return value;
}

/**
 * Build an error result in MCP tool response format.
 *
 * @param message - Error description
 * @returns MCP tool response with error text
 */
function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}
