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

// ── Types ────────────────────────────────────────────────────────────

export interface CloseCycleOptions {
  readonly projectRoot: string;
  readonly dryRun?: boolean;
}

export interface CloseCycleResult {
  readonly cascadeStatus: "pass" | "fail";
  readonly cascadeBlockers?: string[];
  readonly testCommand?: string;
  readonly gatesAssessed: number;
  readonly gatesPromoted: number;
  readonly contributionResult?: { submitted: number; pending: number };
  readonly codeseekerGates: string[];
  readonly nextSteps: string[];
  readonly ready: boolean;
}

// ── Implementation ───────────────────────────────────────────────────

/**
 * Derive the test command from project configuration files.
 * Returns undefined when no recognizable project file is found.
 *
 * @param projectRoot - Absolute path to project root
 * @returns Test command string, or undefined if undetectable
 */
export function deriveTestCommand(projectRoot: string): string | undefined {
  const packageJsonPath = join(projectRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const testScript = pkg.scripts?.["test"];
      if (testScript && !isPlaceholderTestScript(testScript)) {
        return "npm test";
      }
    } catch {
      // Fall through
    }
  }

  if (existsSync(join(projectRoot, "pyproject.toml"))) {
    return "pytest";
  }

  if (existsSync(join(projectRoot, "requirements.txt"))) {
    try {
      const req = readFileSync(join(projectRoot, "requirements.txt"), "utf-8");
      if (req.toLowerCase().includes("pytest")) return "pytest";
    } catch {
      // Fall through
    }
  }

  if (existsSync(join(projectRoot, "go.mod"))) {
    return "go test ./...";
  }

  return undefined;
}

/**
 * Detect whether a test script value is a placeholder with no real tests.
 *
 * @param script - The script value from package.json
 * @returns true if this is a placeholder script
 */
function isPlaceholderTestScript(script: string): boolean {
  const lower = script.toLowerCase();
  return (
    lower.startsWith("echo") ||
    lower.includes("no test") ||
    lower.includes("exit 1")
  );
}

/**
 * Check whether CodeSeeker is configured in .claude/settings.json.
 *
 * @param projectRoot - Absolute path to project root
 * @returns true if codeseeker appears in mcpServers
 */
function isCodeseekerConfigured(projectRoot: string): boolean {
  const settingsPath = join(projectRoot, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = settings["mcpServers"] as
      | Record<string, unknown>
      | undefined;
    if (!mcpServers) return false;
    return Object.keys(mcpServers).some((key) =>
      key.toLowerCase().includes("codeseeker"),
    );
  } catch {
    return false;
  }
}

/**
 * Determine which active gates require CodeSeeker to run.
 * A gate qualifies when implementation is "mcp" and its tools list
 * contains a tool whose name includes "codeseeker".
 *
 * @param projectRoot - Absolute path to project root
 * @returns Array of gate IDs that need CodeSeeker
 */
function findCodeseekerGates(projectRoot: string): string[] {
  if (!isCodeseekerConfigured(projectRoot)) return [];
  return getActiveProjectGates(projectRoot)
    .filter(
      (gate) =>
        gate.implementation === "mcp" &&
        gate.tools?.some((t) => t.name.toLowerCase().includes("codeseeker")),
    )
    .map((gate) => gate.id);
}

/**
 * Run the close-cycle gate logic.
 *
 * @param options - Project root and optional dry-run flag
 * @returns Structured result with cascade status, gate promotion details, and next steps
 */
export async function closeCycle(
  options: CloseCycleOptions,
): Promise<CloseCycleResult> {
  const { projectRoot, dryRun = false } = options;

  // Step 1 — Cascade check
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

  // Step 2 — Test command
  const testCommand = deriveTestCommand(projectRoot);

  // Step 3 — Gate assessment and contribution
  const activeGates = getActiveProjectGates(projectRoot);
  const gatesAssessed = activeGates.length;

  const contributionResult = await contributeGates({ projectRoot, dryRun });

  const submittedIds = new Set(
    contributionResult.submitted.map((g) => g.gateId),
  );
  let gatesPromoted = 0;

  if (!dryRun) {
    for (const gateId of submittedIds) {
      try {
        promoteGate(projectRoot, gateId);
        gatesPromoted++;
      } catch {
        // Gate may already be promoted — skip silently
      }
    }
  } else {
    gatesPromoted = submittedIds.size;
  }

  // Step 4 — CodeSeeker gates
  const codeseekerGates = findCodeseekerGates(projectRoot);

  // Step 5 — Next steps
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
  };
}

/**
 * Format the CloseCycleResult as a plain-text MCP response.
 *
 * @param result - The structured close-cycle result
 * @returns Formatted markdown string
 */
export function formatCloseCycleResult(result: CloseCycleResult): string {
  const statusLabel = result.ready ? "READY" : "BLOCKED";
  const cascadeLabel = result.cascadeStatus === "pass" ? "PASS" : "FAIL";

  const lines: string[] = [
    `## Cycle Status: ${statusLabel}`,
    "",
    `### Cascade: ${cascadeLabel}`,
  ];

  if (result.cascadeBlockers?.length) {
    for (const blocker of result.cascadeBlockers) {
      lines.push(`- ✗ ${blocker}`);
    }
  }

  if (result.cascadeStatus === "pass") {
    if (result.testCommand) {
      lines.push("", `**Test command:** \`${result.testCommand}\``);
    }

    lines.push("", `### Gates Assessed: ${result.gatesAssessed}`);

    if (result.gatesPromoted > 0) {
      lines.push(
        `${result.gatesPromoted} gate${result.gatesPromoted === 1 ? "" : "s"} promoted to community registry`,
      );
    }

    if (result.codeseekerGates.length > 0) {
      lines.push(
        "",
        "**CodeSeeker gates to run:**",
        ...result.codeseekerGates.map((id) => `- ${id}`),
      );
    }
  }

  lines.push("", "### Next Steps");
  result.nextSteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });

  return lines.join("\n");
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
  const result = await closeCycle({ projectRoot, dryRun });
  return {
    content: [{ type: "text", text: formatCloseCycleResult(result) }],
  };
}
