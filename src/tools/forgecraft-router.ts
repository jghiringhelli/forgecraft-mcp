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
import { ALL_TAGS, CONTENT_TIERS, ALL_OUTPUT_TARGETS } from "../shared/types.js";

// ── Handler imports ─────────────────────────────────────────────────
import { listTagsHandler, listHooksHandler, listSkillsHandler } from "./list.js";
import { classifyProjectHandler } from "./classify.js";
import { scaffoldProjectHandler } from "./scaffold.js";
import { generateInstructionsHandler } from "./generate-claude-md.js";
import { auditProjectHandler } from "./audit.js";
import { addHookHandler } from "./add-hook.js";
import { addModuleHandler } from "./add-module.js";
import { configureMcpHandler } from "./configure-mcp.js";
import { getNfrTemplateHandler } from "./get-nfr.js";
import { getDesignReferenceHandler } from "./get-reference.js";
import { getPlaybookHandler } from "./get-playbook.js";
import { convertExistingHandler } from "./convert.js";
import { reviewProjectHandler } from "./review.js";
import { refreshProjectHandler } from "./refresh-project.js";
import { verifyHandler } from "./verify.js";
import { adviceHandler } from "./advice.js";

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
] as const;

type Action = (typeof ACTIONS)[number];

const LIST_RESOURCES = ["tags", "hooks", "skills"] as const;
const REFERENCE_RESOURCES = ["nfr", "design_patterns", "playbook"] as const;

// ── Schema ──────────────────────────────────────────────────────────

export const forgecraftSchema = z.object({
  action: z
    .enum(ACTIONS as unknown as [string, ...string[]])
    .describe(
      "Operation to perform: refresh (re-sync project), scaffold (generate structure), " +
      "generate (instruction files only), audit (check standards), review (code review checklist), " +
      "list (discover tags/hooks/skills), classify (suggest tags), add_hook, add_module, " +
      "configure_mcp, get_reference (design patterns/NFR/playbook), convert (migration plan), " +
      "verify (run tests + score §4.3 GS properties + report layer violations), " +
      "advice (quality cycle checklist + tool stack + example configs for your tags).",
    ),
  project_dir: z
    .string()
    .optional()
    .describe("Absolute path to the project root. Required for: refresh, scaffold, generate, audit, add_hook, add_module, configure_mcp, convert, verify. Optional for: classify, advice."),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Project classification tags. Used by: scaffold, generate, audit, review, add_module, configure_mcp, get_reference, convert, list (as filter)."),
  project_name: z
    .string()
    .optional()
    .describe("Human-readable project name. Used by: scaffold, generate."),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .optional()
    .describe("AI assistant targets (claude, cursor, copilot, windsurf, cline, aider). Used by: scaffold, generate, refresh."),
  tier: z
    .enum(CONTENT_TIERS as unknown as [string, ...string[]])
    .optional()
    .describe("Content depth: core, recommended, optional. Used by: refresh."),
  resource: z
    .enum([...LIST_RESOURCES, ...REFERENCE_RESOURCES] as unknown as [string, ...string[]])
    .optional()
    .describe("Sub-resource for list (tags|hooks|skills) and get_reference (nfr|design_patterns)."),
  name: z
    .string()
    .optional()
    .describe("Item name. Used by: add_hook (hook name), add_module (module name)."),
  language: z
    .enum(["typescript", "python"])
    .optional()
    .describe("Programming language. Used by: scaffold, add_module. Default: typescript."),
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
  apply: z
    .boolean()
    .optional()
    .describe("Apply changes (vs preview). Used by: refresh. Default: false."),
  merge: z
    .boolean()
    .optional()
    .describe("Merge with existing instruction files. Used by: generate. Default: true."),
  compact: z
    .boolean()
    .optional()
    .describe("Strip explanatory tail clauses and deduplicate bullet lines (~20-40% smaller output). Used by: generate, scaffold, refresh."),
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
    .describe("Auto-approve MCP tool calls. Used by: configure_mcp. Default: true."),
  include_remote: z
    .boolean()
    .optional()
    .describe("Query remote MCP registry. Used by: configure_mcp. Default: false."),
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
    .max(12)
    .optional()
    .describe("Minimum §4.3 GS score (0–12) required for overall pass. Used by: verify. Default: 10."),
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
export async function forgecraftHandler(args: ForgecraftArgs): Promise<ToolResult> {
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
      });

    case "scaffold":
      return scaffoldProjectHandler({
        tags: requireParam(args.tags, "tags", "scaffold"),
        project_dir: requireParam(args.project_dir, "project_dir", "scaffold"),
        project_name: args.project_name ?? "My Project",
        language: args.language ?? "typescript",
        dry_run: args.dry_run ?? false,
        force: args.force ?? false,
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
        project_dir: requireParam(args.project_dir, "project_dir", "add_module"),
        tags: args.tags ?? ["UNIVERSAL"],
        language: args.language ?? "typescript",
      });

    case "configure_mcp":
      return configureMcpHandler({
        tags: requireParam(args.tags, "tags", "configure_mcp"),
        project_dir: requireParam(args.project_dir, "project_dir", "configure_mcp"),
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
        pass_threshold: args.pass_threshold ?? 10,
      });

    case "advice":
      return adviceHandler({
        project_dir: args.project_dir,
        tags: args.tags as string[] | undefined,
      });

    default:
      return errorResult(`Unknown action: ${String(action satisfies never)}. Valid actions: ${ACTIONS.join(", ")}`);
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
  const tags = requireParam(args.tags, "tags", "get_reference");

  switch (resource) {
    case "nfr":
      return getNfrTemplateHandler({ tags });
    case "design_patterns":
      return getDesignReferenceHandler({ tags });
    case "playbook":
      return getPlaybookHandler({ tags, phase: args.name });
    default:
      return errorResult(
        `Invalid resource '${resource}' for get_reference action. Use: nfr, design_patterns, or playbook.`,
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
function requireParam<T>(value: T | undefined, paramName: string, action: string): T {
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
