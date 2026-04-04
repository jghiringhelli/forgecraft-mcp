/**
 * close_cycle tool handler.
 *
 * End-of-cycle gate that:
 *   1. Re-runs all 5 cascade checks (must all pass)
 *   2. Derives the test command from project files
 *   3. Assesses active project gates for community contribution
 *   4. Calls contributeGates() for generalizable gates and promotes them
 *   5. Detects CodeSeeker gates that need to be run
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  runCascadeChecks,
  isCascadeComplete,
  loadCascadeDecisions,
} from "./check-cascade.js";
import { contributeGates } from "./contribute-gate.js";
import { getActiveProjectGates, promoteGate } from "../shared/project-gates.js";
import { detectSpecRoadmapDrift } from "../shared/drift-detector.js";
import {
  scoreGsProperties,
  findDirectDbCallsInRoutes,
  findMissingTestFiles,
} from "../analyzers/gs-scorer.js";
import {
  computeSRealized,
  appendGsScoreRow,
} from "../shared/gs-score-logger.js";
import { readExperimentConfig } from "../shared/config.js";
import {
  deriveTestCommand,
  findCodeseekerGates,
  findNextRoadmapItem,
  markRoadmapItemDone,
  formatCloseCycleResult,
} from "./close-cycle-helpers.js";
import {
  suggestVersionBump,
  appendChangelogEntry,
} from "./close-cycle-versioning.js";

export type {
  CloseCycleOptions,
  CloseCycleResult,
} from "./close-cycle-helpers.js";
export {
  deriveTestCommand,
  findNextRoadmapItem,
  parseRoadmapItems,
  markRoadmapItemDone,
  formatCloseCycleResult,
  findCodeseekerGates,
} from "./close-cycle-helpers.js";
export {
  suggestVersionBump,
  appendChangelogEntry,
  readCommitsSinceLastTag,
} from "./close-cycle-versioning.js";

// -- Implementation --------------------------------------------------

/**
 * Run the close-cycle gate logic.
 *
 * @param options - Project root and optional dry-run flag
 * @returns Structured result with cascade status, gate promotion details, and next steps
 */
export async function closeCycle(
  options: import("./close-cycle-helpers.js").CloseCycleOptions,
): Promise<import("./close-cycle-helpers.js").CloseCycleResult> {
  const { projectRoot, dryRun = false } = options;

  // Step 1 -- Cascade check
  const decisions = loadCascadeDecisions(projectRoot);
  const cascadeSteps = runCascadeChecks(projectRoot, decisions);
  const cascadePassed = isCascadeComplete(cascadeSteps);

  if (!cascadePassed) {
    const blockers = cascadeSteps
      .filter((s) => s.status === "FAIL" || s.status === "STUB")
      .map((s) => s.name);
    const nextSteps = [
      `Fix cascade blockers before closing the cycle: ${blockers.join(", ")}`,
    ];
    return {
      cascadeStatus: "fail",
      cascadeBlockers: blockers,
      gatesAssessed: 0,
      gatesPromoted: 0,
      codeseekerGates: [],
      nextSteps,
      ready: false,
    };
  }

  // Step 2 -- Test command
  const testCommand = deriveTestCommand(projectRoot);

  // Step 3 -- Gate assessment and contribution
  const activeGates = getActiveProjectGates(projectRoot);
  const gatesAssessed = activeGates.length;

  const experiment = readExperimentConfig(projectRoot);
  const effectiveDryRun = experiment?.id ? false : dryRun;

  const contributionResult = await contributeGates({
    projectRoot,
    dryRun: effectiveDryRun,
    experimentId: experiment?.id,
  });

  const submittedIds = new Set(
    contributionResult.submitted.map((g) => g.gateId),
  );
  let gatesPromoted = 0;

  if (!effectiveDryRun) {
    for (const gateId of submittedIds) {
      try {
        promoteGate(projectRoot, gateId);
        gatesPromoted++;
      } catch {
        // Gate may already be promoted -- skip silently
      }
    }
  } else {
    gatesPromoted = submittedIds.size;
  }

  // Step 4 -- CodeSeeker gates
  const codeseekerGates = findCodeseekerGates(projectRoot);

  // Step 5 -- Roadmap next item
  const nextRoadmapItem = findNextRoadmapItem(projectRoot);
  const roadmapComplete =
    nextRoadmapItem === null &&
    existsSync(join(projectRoot, "docs", "roadmap.md"));

  // Step 6 -- Version suggestion and CHANGELOG
  const versionSuggestion = suggestVersionBump(projectRoot);
  const changelogUpdated = appendChangelogEntry(projectRoot, versionSuggestion);

  // Step 7.5 -- GS score logging
  let gsScoreLogged = false;
  let gsScoreLoop: number | undefined;
  try {
    const sRealized = computeSRealized(cascadeSteps);
    const layerViolations = findDirectDbCallsInRoutes(projectRoot);
    const missingTestFiles = findMissingTestFiles(projectRoot);
    const propertyScores = scoreGsProperties(
      projectRoot,
      true,
      layerViolations,
      missingTestFiles,
    );

    const gsScorePath = join(projectRoot, "docs", "gs-score.md");
    let existingRowCount = 0;
    if (existsSync(gsScorePath)) {
      const content = readFileSync(gsScorePath, "utf-8");
      existingRowCount = content
        .split("\n")
        .filter(
          (line) => line.startsWith("|") && !line.startsWith("|---"),
        ).length;
      existingRowCount = Math.max(0, existingRowCount - 1);
    }
    gsScoreLoop = existingRowCount + 1;

    appendGsScoreRow({
      projectDir: projectRoot,
      loop: gsScoreLoop,
      roadmapItemId: nextRoadmapItem?.id,
      sRealized,
      propertyScores,
    });
    gsScoreLogged = true;
  } catch {
    gsScoreLogged = false;
  }

  // Step 7 -- Next steps
  const nextSteps: string[] = [];

  if (gatesPromoted > 0) {
    nextSteps.push(
      `${gatesPromoted} gate${gatesPromoted === 1 ? "" : "s"} submitted to community registry. Check your GitHub Issues for tracking URLs.`,
    );
  }

  if (codeseekerGates.length > 0) {
    nextSteps.push(
      `Run these MCP gates before committing: ${codeseekerGates.join(", ")}`,
    );
  }

  // Step 8 -- Drift check
  const driftResult = detectSpecRoadmapDrift(projectRoot);
  if (driftResult.driftDetected && driftResult.message) {
    nextSteps.push(`Warning: Drift: ${driftResult.message}`);
  }

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Cycle complete. Commit your changes with: git commit -m 'feat(...): ...'",
    );
  }

  return {
    cascadeStatus: "pass",
    testCommand,
    gatesAssessed,
    gatesPromoted,
    contributionResult: {
      submitted: contributionResult.submitted.length,
      pending: contributionResult.submitted.filter(
        (g) => g.status === "pending",
      ).length,
    },
    codeseekerGates,
    nextSteps,
    ready: true,
    nextRoadmapItem,
    versionSuggestion: versionSuggestion ?? undefined,
    changelogUpdated,
    roadmapComplete,
    gsScoreLogged,
    ...(gsScoreLoop !== undefined ? { gsScoreLoop } : {}),
    ...(driftResult.driftDetected ? { driftWarning: driftResult.message } : {}),
    ...(experiment?.id ? { experimentId: experiment.id } : {}),
  };
}

/**
 * MCP handler for the close_cycle action.
 *
 * @param args - Raw args from the MCP router (project_dir, dry_run)
 * @returns MCP-style tool result with text content
 */
export async function closeCycleHandler(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectRoot = args["project_dir"] as string | undefined;
  if (!projectRoot) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Missing required parameter 'project_dir' for action 'close_cycle'.",
        },
      ],
    };
  }

  const dryRun = (args["dry_run"] as boolean | undefined) ?? false;
  const roadmapItem = args["roadmap_item"] as string | undefined;
  const result = await closeCycle({ projectRoot, dryRun });

  if (roadmapItem && result.cascadeStatus === "pass" && !dryRun) {
    markRoadmapItemDone(projectRoot, roadmapItem);
  }

  return {
    content: [{ type: "text", text: formatCloseCycleResult(result) }],
  };
}
