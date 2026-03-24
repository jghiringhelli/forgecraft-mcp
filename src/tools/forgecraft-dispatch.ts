/**
 * Dispatch logic for the unified forgecraft tool router.
 *
 * Maps the action discriminator to the appropriate handler invocation.
 */

import type { Tag, ToolResult } from "../shared/types.js";
import { loadUserOverrides } from "../registry/loader.js";

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
import { getDesignReferenceHandler, getGuidanceHandler } from "./get-reference.js";
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
import { recordVerificationHandler, getVerificationStatusHandler } from "./verification-state.js";
import { generateAdrHandler } from "./generate-adr.js";
import { contributeGates } from "./contribute-gate.js";
import { generateDiagramHandler } from "./generate-diagram.js";
import { setCascadeRequirementHandler } from "./set-cascade-requirement.js";
import { setupProjectHandler } from "./setup-project.js";
import { closeCycleHandler } from "./close-cycle.js";
import { generateRoadmapHandler } from "./generate-roadmap.js";
import { cntAddNodeHandler } from "./cnt-add-node.js";
import { startHardeningHandler } from "./start-hardening.js";
import { ACTIONS } from "./forgecraft-schema.js";
import type { ForgecraftArgs, Action } from "./forgecraft-schema.js";


export async function dispatchForgecraft(args: ForgecraftArgs): Promise<ToolResult> {
  const action = args.action as Action;

  switch (action) {
    case "setup_project":
      return setupProjectHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "setup_project",
        ),
        spec_path: args.spec_path,
        spec_text: args.spec_text,
        mvp: args.mvp,
        scope_complete: args.scope_complete,
        has_consumers: args.has_consumers,
        project_type_override: args.project_type_override,
      });

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

    case "audit": {
      const resolvedTags =
        args.tags && args.tags.length > 0
          ? args.tags
          : args.project_dir
            ? (loadUserOverrides(args.project_dir)?.tags ?? undefined)
            : undefined;
      return auditProjectHandler({
        tags: requireParam(resolvedTags, "tags", "audit"),
        project_dir: requireParam(args.project_dir, "project_dir", "audit"),
        include_anti_patterns: args.include_anti_patterns ?? true,
      });
    }

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

    case "contribute_gate": {
      const result = await contributeGates({
        projectRoot: requireParam(
          args.project_dir,
          "project_dir",
          "contribute_gate",
        ),
        dryRun: args.dry_run ?? false,
      });
      const lines = [
        `Contribution complete.`,
        `  Submitted: ${result.submitted.length}`,
        `  Skipped:   ${result.skipped.length}`,
        ...(result.pendingFile
          ? [`  Pending queue: ${result.pendingFile}`]
          : []),
        ...result.skipped.map((s) => `  ↷ ${s.gateId}: ${s.reason}`),
        ...result.submitted.map((s) =>
          s.issueUrl
            ? `  ✓ ${s.gateId} → ${s.issueUrl}`
            : `  ⏳ ${s.gateId} queued`,
        ),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    case "generate_diagram":
      return generateDiagramHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "generate_diagram",
        ),
      });

    case "set_cascade_requirement":
      return setCascadeRequirementHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "set_cascade_requirement",
        ),
        step: requireParam(
          args.cascade_step,
          "cascade_step",
          "set_cascade_requirement",
        ),
        required: requireParam(
          args.cascade_required,
          "cascade_required",
          "set_cascade_requirement",
        ),
        rationale: requireParam(
          args.cascade_rationale,
          "cascade_rationale",
          "set_cascade_requirement",
        ),
        decided_by: args.cascade_decided_by,
      });

    case "close_cycle":
      return closeCycleHandler(args);

    case "generate_roadmap":
      return generateRoadmapHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "generate_roadmap",
        ),
      });

    case "cnt_add_node":
      return cntAddNodeHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "cnt_add_node",
        ),
        domain: requireParam(args.cnt_domain, "cnt_domain", "cnt_add_node"),
        concern: requireParam(args.cnt_concern, "cnt_concern", "cnt_add_node"),
        content: args.cnt_content,
      });

    case "start_hardening":
      return startHardeningHandler(args);

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
 */
export function requireParam<T>(
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
 */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

