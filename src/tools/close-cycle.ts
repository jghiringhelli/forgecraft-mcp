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

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { buildLayerReport } from "./layer-status.js";
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
 * Derive the "Next Action" string for .claude/state.md using waterfall logic.
 * First gap in the layer stack wins.
 */
function deriveNextAction(
  l1GateViolations: ReadonlyArray<{ gateId: string }>,
  l2Covered: number,
  total: number,
  harnessRun: {
    passed: number;
    failed: number;
    notImplemented?: number;
    timestamp: string;
  } | null,
  l3Status: string,
  l4Status: string,
): string {
  if (l1GateViolations.length > 0) {
    return `Resolve ${l1GateViolations.length} active gate violation${l1GateViolations.length === 1 ? "" : "s"}. Run \`layer_status\` to see details.`;
  }
  if (l2Covered < total) {
    const missing = total - l2Covered;
    return `Add harness specs for ${missing} UC${missing === 1 ? "" : "s"} missing probes. Run \`generate_harness\`.`;
  }
  if (!harnessRun) {
    return "Run `run_harness` to verify behavioral contracts.";
  }
  if ((harnessRun.notImplemented ?? 0) > 0) {
    const n = harnessRun.notImplemented!;
    return `Implement ${n} stub probe${n === 1 ? "" : "s"} — not_implemented probes exit 0 but verify nothing. Fill the TODO sections.`;
  }
  if (harnessRun.failed > 0) {
    return `Fix ${harnessRun.failed} failing L2 probe${harnessRun.failed === 1 ? "" : "s"} — specification violations. Regenerate from spec.`;
  }
  if (l3Status === "not-started" || l3Status === "partial") {
    return "Run `run_env_probe` to verify environment contracts.";
  }
  if (l4Status === "not-started" || l4Status === "partial") {
    return "Run `run_slo_probe` to verify SLO monitoring contracts.";
  }
  return "All layers verified. Advance to next roadmap item via `generate_session_prompt`.";
}

/**
 * Write .claude/state.md after a successful cycle.
 * Non-throwing — errors are silently swallowed to avoid breaking close_cycle.
 */
function writeStateLeaf(projectDir: string, timestamp: string): void {
  try {
    const report = buildLayerReport(projectDir);
    const total = report.ucs.length;
    const l2Covered = report.l2.filter((u) => u.hasProbe).length;

    // Read harness run evidence
    const harnessRunPath = join(projectDir, ".forgecraft", "harness-run.json");
    let harnessRun: {
      passed: number;
      failed: number;
      notImplemented?: number;
      timestamp: string;
    } | null = null;
    if (existsSync(harnessRunPath)) {
      try {
        const raw = JSON.parse(readFileSync(harnessRunPath, "utf-8")) as {
          timestamp?: string;
          passed?: number;
          failed?: number;
          results?: Array<{ ucId: string; status: string }>;
        };
        if (raw.timestamp) {
          const notImplemented = (raw.results ?? []).filter(
            (r) => r.status === "not_implemented",
          ).length;
          harnessRun = {
            passed: raw.passed ?? 0,
            failed: raw.failed ?? 0,
            notImplemented: notImplemented > 0 ? notImplemented : undefined,
            timestamp: raw.timestamp,
          };
        }
      } catch {
        // ignore
      }
    }

    // Read env probe evidence
    const envProbeRunPath = join(
      projectDir,
      ".forgecraft",
      "env-probe-run.json",
    );
    let envProbeTimestamp = "not run";
    let envProbeStatus = "not-started";
    if (existsSync(envProbeRunPath)) {
      try {
        const raw = JSON.parse(readFileSync(envProbeRunPath, "utf-8")) as {
          timestamp?: string;
          passed?: number;
          failed?: number;
        };
        envProbeTimestamp = raw.timestamp ?? "not run";
        const passed = raw.passed ?? 0;
        const failed = raw.failed ?? 0;
        envProbeStatus =
          failed > 0 ? "partial" : passed > 0 ? "complete" : "not-started";
      } catch {
        // ignore
      }
    }

    // Read SLO probe evidence
    const sloProbeRunPath = join(
      projectDir,
      ".forgecraft",
      "slo-probe-run.json",
    );
    let sloProbeTimestamp = "not run";
    let sloProbeStatus = "not-started";
    if (existsSync(sloProbeRunPath)) {
      try {
        const raw = JSON.parse(readFileSync(sloProbeRunPath, "utf-8")) as {
          timestamp?: string;
          passed?: number;
          failed?: number;
        };
        sloProbeTimestamp = raw.timestamp ?? "not run";
        const passed = raw.passed ?? 0;
        const failed = raw.failed ?? 0;
        sloProbeStatus =
          failed > 0 ? "partial" : passed > 0 ? "complete" : "not-started";
      } catch {
        // ignore
      }
    }

    const l1GateCount = report.l1GateViolations.length;
    const l2Total = report.l2.length;
    const harnessTimestamp = harnessRun?.timestamp ?? "not run";
    const harnessLine = harnessRun
      ? `${harnessRun.passed}/${l2Total} probes passing`
      : "not run";

    const violationLines =
      report.l1GateViolations.length > 0
        ? report.l1GateViolations
            .map((v) => `- [${v.gateId}]: ${v.message ?? "gate violation"}`)
            .join("\n")
        : "None";

    const driftLine = "None detected";

    const cascadeResult = `PASS`;
    const nextAction = deriveNextAction(
      report.l1GateViolations,
      l2Covered,
      total,
      harnessRun,
      report.l3,
      report.l4,
    );

    const lines = [
      "# Project State",
      `_Last updated by close_cycle: ${timestamp}_`,
      "",
      "## Layer Completion",
      "| Layer | Status | Evidence |",
      "|---|---|---|",
      `| L1 Blueprint | ${total}/${total} UCs · ${l1GateCount} gate violation${l1GateCount === 1 ? "" : "s"} | close_cycle: ${timestamp} |`,
      `| L2 Harness | ${harnessLine} | harness-run.json: ${harnessTimestamp} |`,
      `| L3 Environment | ${envProbeStatus} | env-probe-run.json: ${envProbeTimestamp} |`,
      `| L4 Monitoring | ${sloProbeStatus} | slo-probe-run.json: ${sloProbeTimestamp} |`,
      "",
      "## Active Gate Violations",
      violationLines,
      "",
      "## Spec Drift",
      driftLine,
      "",
      "## Last Cycle",
      `${timestamp} — cascade: ${cascadeResult} · gates: ${l1GateCount} violation${l1GateCount === 1 ? "" : "s"} · harness: ${harnessLine}`,
      "",
      "## Next Action",
      nextAction,
    ];

    const outPath = join(projectDir, ".claude", "state.md");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, lines.join("\n"), "utf-8");
  } catch {
    // non-throwing
  }
}

/**
 * Write docs/layer-status.md snapshot after a successful cycle.
 * Non-throwing — errors are silently swallowed to avoid breaking close_cycle.
 */
function writeLayerStatusSnapshot(
  projectDir: string,
  timestamp: string,
  harnessSection: string[],
): void {
  try {
    const report = buildLayerReport(projectDir);
    const total = report.ucs.length;
    const l2Covered = report.l2.filter((u) => u.hasProbe).length;

    // Probe file counts
    const harnessRunPath = join(projectDir, ".forgecraft", "harness-run.json");
    let harnessTimestamp = "(not run)";
    let harnessPassed = 0;
    let harnessFailed = 0;
    if (existsSync(harnessRunPath)) {
      try {
        const run = JSON.parse(readFileSync(harnessRunPath, "utf-8")) as {
          timestamp?: string;
          passed?: number;
          failed?: number;
        };
        harnessTimestamp = run.timestamp ?? "(not run)";
        harnessPassed = run.passed ?? 0;
        harnessFailed = run.failed ?? 0;
      } catch {
        // ignore
      }
    }

    // Determine next action from harness section
    const nextAction = harnessSection.some((l) => l.includes("⛔"))
      ? "Resolve failing probes — they are specification violations. Regenerate from spec."
      : harnessSection.some((l) => l.includes("no execution evidence"))
        ? "Run run_harness to generate behavioral execution evidence."
        : "All probes passing — commit changes and advance the cycle.";

    const l3Status = report.l3;
    const l4Status = report.l4;

    const lines = [
      "# Layer Status Snapshot",
      `_Last updated by close_cycle: ${timestamp}_`,
      "",
      "## L1: Blueprint",
      `${total}/${total} cascade steps passing`,
      `Active gate violations: ${report.l1GateViolations.length} (see layer_status for details)`,
      "",
      "## L2: Behavioral Harness",
      `${l2Covered}/${total} use cases with probe specs`,
      `Last run: ${harnessTimestamp} — ${harnessPassed} passed / ${harnessFailed} failed`,
      "",
      "## L3: Environment",
      l3Status,
      "",
      "## L4: Monitoring",
      l4Status,
      "",
      "## Next Action",
      nextAction,
    ];

    const outPath = join(projectDir, "docs", "layer-status.md");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, lines.join("\n"), "utf-8");
  } catch {
    // non-throwing
  }
}

/**
 * Build the L2 harness section for the close-cycle report.
 * Non-throwing — missing/unparseable harness-run.json produces a "no evidence" section.
 */
function buildHarnessSection(projectDir: string): string[] {
  const harnessRunPath = join(projectDir, ".forgecraft", "harness-run.json");
  const harnessSection: string[] = [""];

  if (existsSync(harnessRunPath)) {
    try {
      const run = JSON.parse(readFileSync(harnessRunPath, "utf-8")) as {
        passed: number;
        failed: number;
        errors: number;
        notFound: number;
        results?: Array<{ ucId: string; status: string }>;
      };
      const total = run.passed + run.failed + run.errors + run.notFound;
      const pct = total > 0 ? Math.round((run.passed / total) * 100) : 0;
      harnessSection.push(
        `### L2 Harness: ${run.passed}/${total} probes passing (${pct}%)`,
      );
      if (run.failed > 0) {
        harnessSection.push(
          `⛔ ${run.failed} failing probe(s) — resolve before advancing.`,
        );
        harnessSection.push(
          "Failing probes are specification violations. Regenerate from spec.",
        );
      }
      const notImpl = (run.results ?? []).filter(
        (r) => r.status === "not_implemented",
      );
      if (notImpl.length > 0) {
        harnessSection.push(
          `⛔ ${notImpl.length} probe(s) are not_implemented — fill TODO sections before close_cycle.`,
        );
        harnessSection.push(
          `  Affected: ${notImpl.map((r) => r.ucId).join(", ")}`,
        );
        harnessSection.push(
          "  A not_implemented probe exits 0 but verifies nothing — false confidence.",
        );
      }
      if (pct < 50) {
        harnessSection.push(
          `⚠️ L2 coverage below 50% — expand harness before pre-release.`,
        );
      }
    } catch {
      harnessSection.push("### L2 Harness: no execution evidence");
      harnessSection.push(
        "Run run_harness before close_cycle for behavioral execution evidence.",
      );
    }
  } else {
    harnessSection.push("### L2 Harness: no execution evidence");
    harnessSection.push(
      "Run run_harness before close_cycle for behavioral execution evidence.",
    );
  }

  return harnessSection;
}

/**
 * Build the L3 env probe section for the close-cycle report.
 * Non-throwing — missing/unparseable env-probe-run.json produces a "not yet run" section.
 */
function buildEnvProbeSection(projectDir: string): string[] {
  const envProbeRunPath = join(projectDir, ".forgecraft", "env-probe-run.json");
  const section: string[] = [""];

  if (existsSync(envProbeRunPath)) {
    try {
      const run = JSON.parse(readFileSync(envProbeRunPath, "utf-8")) as {
        passed: number;
        failed: number;
        timestamp?: string;
      };
      const total = run.passed + run.failed;
      if (run.failed > 0) {
        section.push(`### L3 Env Probes: ${run.passed}/${total} passing`);
        section.push(
          `⛔ ${run.failed} failing env probe(s) — environment contracts not satisfied.`,
        );
      } else {
        section.push(`### L3 Env Probes: ${run.passed}/${total} passing`);
        section.push(
          `✅ All env probes passing — environment contracts verified.`,
        );
      }
    } catch {
      section.push("### L3 Env Probes: not yet run");
      section.push("  Run `run_env_probe` to verify environment contracts.");
    }
  } else {
    section.push("### L3 Env Probes: not yet run");
    section.push("  Run `run_env_probe` to verify environment contracts.");
  }

  return section;
}

/**
 * Build the L4 slo probe section for the close-cycle report.
 * Non-throwing — missing/unparseable slo-probe-run.json produces a "not yet run" section.
 */
function buildSloProbeSection(projectDir: string): string[] {
  const sloProbeRunPath = join(projectDir, ".forgecraft", "slo-probe-run.json");
  const section: string[] = [""];

  if (existsSync(sloProbeRunPath)) {
    try {
      const run = JSON.parse(readFileSync(sloProbeRunPath, "utf-8")) as {
        passed: number;
        failed: number;
        timestamp?: string;
      };
      const total = run.passed + run.failed;
      if (run.failed > 0) {
        section.push(`### L4 SLO Probes: ${run.passed}/${total} passing`);
        section.push(
          `⛔ ${run.failed} failing SLO probe(s) — monitoring contracts not satisfied.`,
        );
      } else {
        section.push(`### L4 SLO Probes: ${run.passed}/${total} passing`);
        section.push(
          `✅ All SLO probes passing — monitoring contracts verified.`,
        );
      }
    } catch {
      section.push("### L4 SLO Probes: not yet run");
      section.push("  Run `run_slo_probe` to verify monitoring contracts.");
    }
  } else {
    section.push("### L4 SLO Probes: not yet run");
    section.push("  Run `run_slo_probe` to verify monitoring contracts.");
  }

  return section;
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

  const reportLines = [formatCloseCycleResult(result)];

  // Append L2 Harness section when cascade passed
  if (result.cascadeStatus === "pass") {
    const harnessLines = buildHarnessSection(projectRoot);
    reportLines.push(...harnessLines);

    const envProbeLines = buildEnvProbeSection(projectRoot);
    reportLines.push(...envProbeLines);

    const sloProbeLines = buildSloProbeSection(projectRoot);
    reportLines.push(...sloProbeLines);

    // Write docs/layer-status.md snapshot
    const cycleTimestamp = new Date().toISOString();
    writeLayerStatusSnapshot(projectRoot, cycleTimestamp, harnessLines);

    // Write .claude/state.md sentinel leaf
    writeStateLeaf(projectRoot, cycleTimestamp);
  }

  return {
    content: [{ type: "text", text: reportLines.join("\n") }],
  };
}
