/**
 * Extended dispatch: governance, generation, and hardening actions.
 * Handles: generate_adr, contribute_gate, generate_diagram, set_cascade_requirement,
 * close_cycle, generate_roadmap, cnt_add_node, start_hardening.
 */

import type { Tag, ToolResult } from "../shared/types.js";
import type { ForgecraftArgs } from "./forgecraft-schema.js";
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

    default:
      return unknownActionResult(action);
  }
}

export type { Tag };
export { errorResult };
