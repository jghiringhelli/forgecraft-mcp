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

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { execSync } from "node:child_process";
import {
  runCascadeChecks,
  isCascadeComplete,
  loadCascadeDecisions,
} from "./check-cascade.js";
import { contributeGates } from "./contribute-gate.js";
import { getActiveProjectGates, promoteGate } from "../shared/project-gates.js";
import { CommitHistoryArtifact } from "../artifacts/commit-history.js";
import { detectSpecRoadmapDrift } from "../shared/drift-detector.js";

// -- Types ------------------------------------------------------------

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
  readonly nextRoadmapItem?: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly versionSuggestion?: string;
  readonly changelogUpdated?: boolean;
  readonly driftWarning?: string;
  /** True when all roadmap items are complete — suggests entering hardening phase */
  readonly roadmapComplete?: boolean;
}

// -- Implementation --------------------------------------------------

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
 * Find the first pending roadmap item from docs/roadmap.md.
 * Scans phases in order and returns the first row with "| pending |".
 *
 * @param projectDir - Absolute path to project root
 * @returns The first pending item ID and title, or null if none found
 */
export function findNextRoadmapItem(
  projectDir: string,
): { readonly id: string; readonly title: string } | null {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return null;

  const content = readFileSync(roadmapPath, "utf-8");
  const match = content.match(
    /\|\s*(RM-\d+)\s*\|\s*([^|]+)\s*\|\s*pending\s*\|/,
  );
  if (!match) return null;
  return { id: match[1]!.trim(), title: match[2]!.trim() };
}

/**
 * Parse the current version from the last git tag, or return "0.0.0" as base.
 *
 * @param projectDir - Absolute path to project root
 * @returns Semver string without the "v" prefix, e.g. "1.0.0"
 */
function readCurrentVersion(projectDir: string): string {
  try {
    const raw = execSync("git describe --tags --abbrev=0", {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return raw.replace(/^v/, "");
  } catch {
    return "0.0.0";
  }
}

/**
 * Apply a semver bump to a version string.
 *
 * @param version - Current version string, e.g. "1.2.3"
 * @param bump - Which part to increment
 * @returns Next version string
 */
function applyBump(version: string, bump: "major" | "minor" | "patch"): string {
  const parts = version.split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Read git commits since the last tag (or all commits when no tag exists).
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of one-line commit strings, or empty array if git unavailable
 */
export function readCommitsSinceLastTag(projectDir: string): string[] {
  try {
    let raw: string;
    try {
      const lastTag = execSync("git describe --tags --abbrev=0", {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      })
        .toString()
        .trim();
      raw = execSync(`git log --oneline ${lastTag}..HEAD`, {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
    } catch {
      raw = execSync("git log --oneline", {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
    }
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Suggest the next semantic version bump based on git history since last tag.
 * Returns a human-readable suggestion string, or null if git is unavailable.
 *
 * @param projectDir - Absolute path to project root
 * @returns Suggestion string like "v0.1.0 -> v0.2.0 (contains feat commits)" or null
 */
export function suggestVersionBump(projectDir: string): string | null {
  const commits = readCommitsSinceLastTag(projectDir);
  if (commits.length === 0) return null;

  const commitMessages = commits.map((line) => {
    const match = line.match(/^[0-9a-f]+\s+(.+)$/);
    return match?.[1] ?? line;
  });

  const artifact = new CommitHistoryArtifact(projectDir);
  const bump = artifact.determineBump(commitMessages);
  const currentVersion = readCurrentVersion(projectDir);

  if (currentVersion === "0.0.0") {
    return `Suggested initial version: v0.1.0`;
  }

  const nextVersion = applyBump(currentVersion, bump);
  const bumpReason =
    bump === "major"
      ? "contains breaking changes"
      : bump === "minor"
        ? "contains feat commits"
        : "contains fix/chore commits";

  return `v${currentVersion} -> **v${nextVersion}** (${bumpReason})`;
}

/**
 * Categorise conventional-commit messages into Added/Fixed/Changed buckets.
 *
 * @param commitMessages - Cleaned commit messages (without SHA prefix)
 * @returns Categorised lists for changelog sections
 */
function categoriseCommits(commitMessages: ReadonlyArray<string>): {
  added: string[];
  fixed: string[];
  changed: string[];
} {
  const added: string[] = [];
  const fixed: string[] = [];
  const changed: string[] = [];

  for (const msg of commitMessages) {
    if (msg.startsWith("feat")) {
      added.push(msg);
    } else if (msg.startsWith("fix")) {
      fixed.push(msg);
    } else if (
      msg.startsWith("refactor") ||
      msg.startsWith("perf") ||
      msg.startsWith("chore")
    ) {
      changed.push(msg);
    }
  }

  return { added, fixed, changed };
}

/**
 * Ensure CHANGELOG.md exists with the standard Keep a Changelog header.
 *
 * @param changelogPath - Absolute path to CHANGELOG.md
 */
function ensureChangelogHeader(changelogPath: string): void {
  if (!existsSync(changelogPath)) {
    writeFileSync(
      changelogPath,
      [
        "# Changelog",
        "",
        "All notable changes to this project will be documented in this file.",
        "Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)",
        "Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)",
        "",
      ].join("\n"),
      "utf-8",
    );
  }
}

/**
 * Append a CHANGELOG entry for the suggested version bump.
 * Only runs when git commits exist. Skips silently if git is unavailable.
 *
 * @param projectDir - Absolute path to project root
 * @param versionSuggestion - The human-readable suggestion string from suggestVersionBump
 * @returns true if the changelog was updated, false otherwise
 */
export function appendChangelogEntry(
  projectDir: string,
  versionSuggestion: string | null,
): boolean {
  if (!versionSuggestion) return false;

  const commits = readCommitsSinceLastTag(projectDir);
  if (commits.length === 0) return false;

  const commitMessages = commits.map((line) => {
    const match = line.match(/^[0-9a-f]+\s+(.+)$/);
    return match?.[1] ?? line;
  });

  const { added, fixed, changed } = categoriseCommits(commitMessages);
  if (added.length === 0 && fixed.length === 0 && changed.length === 0) {
    return false;
  }

  const versionMatch = versionSuggestion.match(/\*\*v([\d.]+)\*\*/);
  const initialMatch = versionSuggestion.match(
    /Suggested initial version: v([\d.]+)/,
  );
  const nextVersion = versionMatch?.[1] ?? initialMatch?.[1];
  if (!nextVersion) return false;

  const date = new Date().toISOString().split("T")[0]!;
  const sectionLines: string[] = [`## [${nextVersion}] - ${date}`, ""];

  if (added.length > 0) {
    sectionLines.push("### Added");
    added.forEach((m) => sectionLines.push(`- ${m}`));
    sectionLines.push("");
  }

  if (fixed.length > 0) {
    sectionLines.push("### Fixed");
    fixed.forEach((m) => sectionLines.push(`- ${m}`));
    sectionLines.push("");
  }

  if (changed.length > 0) {
    sectionLines.push("### Changed");
    changed.forEach((m) => sectionLines.push(`- ${m}`));
    sectionLines.push("");
  }

  const changelogPath = join(projectDir, "CHANGELOG.md");
  ensureChangelogHeader(changelogPath);

  const existing = readFileSync(changelogPath, "utf-8");
  const insertionPoint = existing.search(/^## \[/m);
  const newEntry = sectionLines.join("\n");

  if (insertionPoint === -1) {
    appendFileSync(changelogPath, `\n${newEntry}`, "utf-8");
  } else {
    const before = existing.slice(0, insertionPoint);
    const after = existing.slice(insertionPoint);
    writeFileSync(changelogPath, `${before}${newEntry}\n${after}`, "utf-8");
  }

  return true;
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
    nextSteps.push(`⚠️ Drift: ${driftResult.message}`);
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
    ...(driftResult.driftDetected ? { driftWarning: driftResult.message } : {}),
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
      lines.push(`- x ${blocker}`);
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

    if (result.nextRoadmapItem) {
      lines.push(
        "",
        "## Next Session",
        `Next roadmap item: **${result.nextRoadmapItem.id} -- ${result.nextRoadmapItem.title}**`,
        `Run: \`generate_session_prompt\` with item_description="${result.nextRoadmapItem.title}"`,
        `Or load the stub at: docs/session-prompts/${result.nextRoadmapItem.id}.md`,
      );
    }

    if (result.roadmapComplete) {
      lines.push(
        "",
        "## 🎉 Roadmap Complete!",
        "All roadmap items are done. The project is ready for hardening.",
        "Run: `start_hardening` to generate the hardening session prompts (pre-release → rc → deployment).",
      );
    }

    if (result.versionSuggestion) {
      lines.push(
        "",
        "## Version",
        `Suggested bump: ${result.versionSuggestion}`,
        "To tag: `git tag v<next> && git push origin v<next>`",
      );
      if (result.changelogUpdated) {
        lines.push("CHANGELOG.md updated with this version entry.");
      }
    }

    if (result.driftWarning) {
      lines.push("", `> ${result.driftWarning}`);
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
