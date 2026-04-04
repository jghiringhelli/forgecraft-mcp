/**
 * close_cycle helper utilities: types, gate/roadmap helpers, and result formatting.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getActiveProjectGates } from "../shared/project-gates.js";

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
  readonly nextRoadmapItem?: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly versionSuggestion?: string;
  readonly changelogUpdated?: boolean;
  readonly driftWarning?: string;
  /** True when all roadmap items are complete — suggests entering hardening phase */
  readonly roadmapComplete?: boolean;
  /** True when the GS score row was successfully appended to docs/gs-score.md */
  readonly gsScoreLogged?: boolean;
  /** The loop number used for the GS score row (1-based) */
  readonly gsScoreLoop?: number;
  /** Experiment id when experiment mode is active — gates are auto-contributed */
  readonly experimentId?: string;
}

// ── Roadmap Types ────────────────────────────────────────────────────

/** A single item parsed from docs/roadmap.md. */
export interface RoadmapItem {
  readonly id: string;
  readonly title: string;
  /** IDs that must be status:done before this item can be started. Empty array = no deps. */
  readonly dependsOn: ReadonlyArray<string>;
  readonly status: "pending" | "in-progress" | "done";
  readonly promptPath: string;
}

// ── Test Command Derivation ───────────────────────────────────────────

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

  if (existsSync(join(projectRoot, "Cargo.toml"))) {
    return "cargo test";
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

// ── CodeSeeker Gates ──────────────────────────────────────────────────

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
export function findCodeseekerGates(projectRoot: string): string[] {
  if (!isCodeseekerConfigured(projectRoot)) return [];
  return getActiveProjectGates(projectRoot)
    .filter(
      (gate) =>
        gate.implementation === "mcp" &&
        gate.tools?.some((t) => t.name.toLowerCase().includes("codeseeker")),
    )
    .map((gate) => gate.id);
}

// ── Roadmap Helpers ──────────────────────────────────────────────────

/**
 * Parse all roadmap items from docs/roadmap.md content.
 * Handles both the legacy 4-column format (ID | Title | Status | Prompt)
 * and the current 5-column format (ID | Title | Depends On | Status | Prompt).
 *
 * @param content - Raw roadmap.md file content
 * @returns Parsed items in document order
 */
export function parseRoadmapItems(content: string): ReadonlyArray<RoadmapItem> {
  const items: RoadmapItem[] = [];
  for (const line of content.split("\n")) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");
    if (cells.length < 4) continue;
    const id = cells[0]!;
    if (!/^RM-\d+$/.test(id)) continue;

    let dependsOnRaw: string;
    let statusRaw: string;
    let promptPath: string;

    if (cells.length >= 5) {
      // 5-column: ID | Title | Depends On | Status | Prompt
      dependsOnRaw = cells[2]!;
      statusRaw = cells[3]!;
      promptPath = cells[4]!;
    } else {
      // 4-column legacy: ID | Title | Status | Prompt
      dependsOnRaw = "—";
      statusRaw = cells[2]!;
      promptPath = cells[3]!;
    }

    const status = (["pending", "in-progress", "done"] as const).includes(
      statusRaw as "pending" | "in-progress" | "done",
    )
      ? (statusRaw as "pending" | "in-progress" | "done")
      : "pending";

    const dependsOn =
      dependsOnRaw === "—" || dependsOnRaw === ""
        ? []
        : dependsOnRaw
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d.length > 0);

    items.push({ id, title: cells[1]!, dependsOn, status, promptPath });
  }
  return items;
}

/**
 * Find the first pending roadmap item whose DAG dependencies are all done.
 *
 * @param projectDir - Absolute path to project root
 * @returns The first unblocked pending item, or null if none exists
 */
export function findNextRoadmapItem(
  projectDir: string,
): { readonly id: string; readonly title: string } | null {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return null;
  const content = readFileSync(roadmapPath, "utf-8");
  const items = parseRoadmapItems(content);
  const doneIds = new Set(
    items.filter((i) => i.status === "done").map((i) => i.id),
  );
  for (const item of items) {
    if (item.status !== "pending") continue;
    const blocked = item.dependsOn.some((dep) => !doneIds.has(dep));
    if (!blocked) return { id: item.id, title: item.title };
  }
  return null;
}

/**
 * Mark a roadmap item as done in docs/roadmap.md.
 * Works for both 4-column (legacy) and 5-column (current) formats.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID, e.g. "RM-001"
 */
export function markRoadmapItemDone(projectDir: string, itemId: string): void {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return;
  const content = readFileSync(roadmapPath, "utf-8");
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const updated = content.replace(
    new RegExp(`(\\|\\s*${escapedId}\\s*\\|[^\\n]*)\\bpending\\b`, "g"),
    "$1done",
  );
  if (updated !== content) writeFileSync(roadmapPath, updated, "utf-8");
}

// ── Result Formatting ────────────────────────────────────────────────

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

    if (result.gsScoreLogged) {
      const loopLabel =
        result.gsScoreLoop !== undefined
          ? `loop ${result.gsScoreLoop}`
          : "logged";
      lines.push("", `📊 S_realized logged to docs/gs-score.md (${loopLabel})`);
    }

    if (result.experimentId) {
      lines.push(
        "",
        `🧪 Experiment: ${result.experimentId} — gates auto-contributed`,
      );
    }
  }

  lines.push("", "### Next Steps");
  result.nextSteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });

  return lines.join("\n");
}
