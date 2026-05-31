/**
 * Extended dispatch: governance, generation, and hardening actions.
 * Handles: generate_adr, contribute_gate, generate_diagram, set_cascade_requirement,
 * close_cycle, generate_roadmap, cnt_add_node, start_hardening.
 */

import type { Tag, ToolResult } from "../shared/types.js";
import type { ForgecraftArgs } from "./forgecraft-schema.js";
import type { GenerateEnvProbeInput } from "./generate-env-probe.js";
import type { RunEnvProbeInput } from "./run-env-probe.js";
import type { GenerateSloProbeInput } from "./generate-slo-probe.js";
import type { RunSloProbeInput } from "./run-slo-probe.js";
import type { ProposeSessionInput } from "./propose-session.js";
import type { CheckSpecConsistencyInput } from "./check-spec-consistency.js";
import type { SetupMonitoringInput } from "./setup-monitoring.js";
import type { CheckT4Input } from "./check-t4.js";
import { generateAdrHandler } from "./generate-adr.js";
import { contributeGates } from "./contribute-gate.js";
import { generateDiagramHandler } from "./generate-diagram.js";
import { setCascadeRequirementHandler } from "./set-cascade-requirement.js";
import { closeCycleHandler } from "./close-cycle.js";
import { generateRoadmapHandler } from "./generate-roadmap.js";
import { cntAddNodeHandler } from "./cnt-add-node.js";
import { startHardeningHandler } from "./start-hardening.js";
import {
  requireParam,
  errorResult,
  unknownActionResult,
} from "./forgecraft-dispatch-helpers.js";
import { generateHarnessHandler } from "./generate-harness.js";
import { runHarnessHandler } from "./run-harness.js";

/**
 * Dispatch governance, generation, and hardening actions.
 * Returns an error result for unrecognized actions.
 *
 * @param action - The action discriminator
 * @param args - Unified tool arguments
 * @returns Tool result from the matched handler, or an error result
 */
export async function dispatchExtendedAction(
  action: string,
  args: ForgecraftArgs,
): Promise<ToolResult> {
  switch (action) {
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

    case "cnt_add_routing": {
      const { cntAddRoutingHandler } = await import("./cnt-add-routing.js");
      return cntAddRoutingHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "cnt_add_routing",
        ),
      });
    }

    case "generate_decision": {
      const { generateDecisionHandler } =
        await import("./generate-decision.js");
      return generateDecisionHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "generate_decision",
        ),
        title: requireParam(
          args.decision_title,
          "decision_title",
          "generate_decision",
        ),
        trigger: args.decision_trigger,
        root_cause: args.decision_root_cause,
        fix: args.decision_fix,
        regression_test: args.decision_regression_test,
        chronicle_session_id: args.decision_chronicle_session_id,
        related_adr: args.decision_related_adr,
      });
    }

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
      return startHardeningHandler(
        args as Parameters<typeof startHardeningHandler>[0],
      );

    case "generate_harness":
      return generateHarnessHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "generate_harness",
        ),
        uc_ids: args.harness_uc_ids,
        force: args.force,
      });

    case "run_harness":
      return runHarnessHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "run_harness",
        ),
        uc_ids: args.harness_uc_ids,
        timeout_ms: args.harness_timeout_ms,
      });

    case "generate_env_probe": {
      const { generateEnvProbeHandler } =
        await import("./generate-env-probe.js");
      return generateEnvProbeHandler(args as unknown as GenerateEnvProbeInput);
    }

    case "run_env_probe": {
      const { runEnvProbeHandler } = await import("./run-env-probe.js");
      return runEnvProbeHandler(args as unknown as RunEnvProbeInput);
    }

    case "generate_slo_probe": {
      const { generateSloProbeHandler } =
        await import("./generate-slo-probe.js");
      return generateSloProbeHandler(args as unknown as GenerateSloProbeInput);
    }

    case "run_slo_probe": {
      const { runSloProbeHandler } = await import("./run-slo-probe.js");
      return runSloProbeHandler(args as unknown as RunSloProbeInput);
    }

    case "propose_session": {
      const { proposeSessionHandler } = await import("./propose-session.js");
      return proposeSessionHandler(args as unknown as ProposeSessionInput);
    }

    case "check_spec_consistency": {
      const { checkSpecConsistencyHandler } =
        await import("./check-spec-consistency.js");
      return checkSpecConsistencyHandler(
        args as unknown as CheckSpecConsistencyInput,
      );
    }

    case "change_request": {
      const { changeRequestHandler } = await import("./change-request.js");
      return changeRequestHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "change_request",
        ),
        title: requireParam(
          args.change_title,
          "change_title",
          "change_request",
        ),
        description: requireParam(
          args.change_description,
          "change_description",
          "change_request",
        ),
        type: requireParam(args.change_type, "change_type", "change_request"),
        breaking: args.change_breaking,
        breaking_details: args.change_breaking_details,
        supersedes_adr: args.change_supersedes_adr,
        affected_artifacts: args.change_affected_artifacts,
      });
    }

    case "list_changes": {
      const { listChangesHandler } = await import("./change-request.js");
      return listChangesHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "list_changes",
        ),
        status: args.changes_status_filter,
      });
    }

    case "setup_monitoring": {
      const { setupMonitoringHandler } = await import("./setup-monitoring.js");
      return setupMonitoringHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "setup_monitoring",
        ),
        project_name: args.project_name,
        force: args.monitoring_force,
      } as SetupMonitoringInput);
    }

    case "check_t4": {
      const { checkT4Handler } = await import("./check-t4.js");
      return checkT4Handler({
        project_dir: requireParam(args.project_dir, "project_dir", "check_t4"),
        acknowledge: args.t4_acknowledge,
        resolve: args.t4_resolve,
        show_resolved: args.t4_show_resolved,
      } as CheckT4Input);
    }

    case "extract_adrs_from_history": {
      const { extractAdrsFromHistoryHandler } =
        await import("./extract-adrs-history.js");
      return extractAdrsFromHistoryHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "extract_adrs_from_history",
        ),
        max_candidates: args.adrs_max_candidates,
        large_commit_threshold: args.adrs_large_commit_threshold,
        ref: args.adrs_ref,
      });
    }

    case "extract_adrs_from_spec": {
      const { extractAdrsFromSpecHandler } =
        await import("./extract-adrs-from-spec.js");
      return extractAdrsFromSpecHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "extract_adrs_from_spec",
        ),
        spec_path: args.spec_path,
        max_adrs: args.adrs_from_spec_max,
      });
    }

    case "review_stubs": {
      const { reviewStubsHandler } = await import("./review-stubs.js");
      return reviewStubsHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "review_stubs",
        ),
      });
    }

    case "check_derivation_chain": {
      const { checkDerivationChainHandler } =
        await import("./check-derivation-chain.js");
      return checkDerivationChainHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "check_derivation_chain",
        ),
      });
    }

    case "score_rubric": {
      const { scoreRubricHandler } = await import("./score-rubric.js");
      return scoreRubricHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "score_rubric",
        ),
      });
    }

    case "analyze_harness": {
      const { analyzeHarnessHandler } = await import("./analyze-harness.js");
      return analyzeHarnessHandler({
        project_dir: requireParam(
          args.project_dir,
          "project_dir",
          "analyze_harness",
        ),
        submit_issues: args.analyze_submit_issues,
        force_fetch: args.analyze_force_fetch,
      });
    }

    default:
      return unknownActionResult(action);
  }
}

export type { Tag };
export { errorResult };
