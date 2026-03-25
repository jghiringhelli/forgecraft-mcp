/**
 * start_hardening action handler.
 *
 * Generates hardening session prompts for the three hardening phases:
 *   HARDEN-001: pre-release — security scan, mutation testing, OWASP dependency check
 *   HARDEN-002: rc          — smoke test against deployed environment (Railway or local Docker)
 *   HARDEN-003: load        — optional load test (skip if not specified in NFR)
 *
 * Gated on: roadmap complete (docs/roadmap.md has no pending items).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getActiveProjectGates } from "../shared/project-gates.js";
import {
  readProjectTags,
  readProjectName,
  readDeploymentUrl,
  readUseCaseTitles,
  filterGateDescriptions,
  PRERELEASE_PHASES,
  RC_PHASES,
  LOAD_PHASES,
} from "./hardening-config.js";
import {
  buildPreReleasePrompt,
  buildRcPrompt,
  buildLoadPrompt,
  writeHardeningPrompt,
} from "./hardening-prompts.js";

// ── Types ────────────────────────────────────────────────────────────

export interface StartHardeningInput {
  readonly project_dir: string;
  /** Override deployment URL for smoke test. Default: read from forgecraft.yaml or 'http://localhost:3000' */
  readonly deployment_url?: string;
  /** Skip load test phase (HARDEN-003). Default: true (skip if not in NFR). */
  readonly skip_load_test?: boolean;
}

export interface HardeningPhase {
  readonly id: string;
  readonly name: string;
  readonly gates: string[];
  readonly promptFile: string;
  readonly skipped: boolean;
}

export interface StartHardeningResult {
  readonly phases: HardeningPhase[];
  readonly blockedReason?: string;
  readonly ready: boolean;
}

// ── Default phase gates ──────────────────────────────────────────────

const DEFAULT_PRERELEASE_GATES: ReadonlyArray<string> = [
  "Run `npm audit --audit-level=high` — zero high CVEs",
  "Run mutation testing — score ≥ 80%",
  "Run linter with zero errors",
];

const DEFAULT_RC_GATES: ReadonlyArray<string> = [
  "Deploy to staging environment and run `GET /health` smoke check",
  "Run Playwright smoke test (2-3 critical user journeys)",
];

const DEFAULT_LOAD_GATES: ReadonlyArray<string> = [
  "Run k6 load test — p99 < 500ms at 10 concurrent users for 30s",
];

// ── Roadmap helpers ──────────────────────────────────────────────────

/**
 * Find pending roadmap items in the current active phase only.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of pending item IDs/titles in the current phase only
 */
function findPendingItemsInCurrentPhase(
  projectDir: string,
): ReadonlyArray<{ readonly id: string; readonly title: string }> {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return [];

  const content = readFileSync(roadmapPath, "utf-8");
  const sections = content.split(/(?=^## Phase \d+)/m).filter(Boolean);
  if (sections.length === 0) {
    return extractPendingItems(content);
  }

  let currentSection: string | null = null;
  for (const section of sections) {
    if (/\|\s*done\s*\|/i.test(section)) {
      currentSection = section;
    }
  }
  if (!currentSection) {
    currentSection = sections[0] ?? "";
  }

  return extractPendingItems(currentSection);
}

/**
 * Extract all pending RM-NNN items from a roadmap section text.
 *
 * @param text - Roadmap text (may be a single phase section)
 * @returns Array of pending items with id and title
 */
function extractPendingItems(
  text: string,
): ReadonlyArray<{ readonly id: string; readonly title: string }> {
  const results: Array<{ id: string; title: string }> = [];
  const rowRegex = /\|\s*(RM-\d+)\s*\|\s*([^|]+)\s*\|\s*pending\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(text)) !== null) {
    results.push({ id: match[1]!.trim(), title: match[2]!.trim() });
  }
  return results;
}

// ── Main handler ─────────────────────────────────────────────────────

/**
 * Generate hardening session prompts for the three hardening phases.
 *
 * @param input - Project directory, optional deployment URL, optional skip_load_test flag
 * @returns Structured result with phase details or a blocked reason
 */
export function startHardening(
  input: StartHardeningInput,
): StartHardeningResult {
  const {
    project_dir: projectDir,
    deployment_url,
    skip_load_test = true,
  } = input;

  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) {
    return {
      phases: [],
      blockedReason: "No roadmap found. Run generate_roadmap first.",
      ready: false,
    };
  }

  const pendingInCurrentPhase = findPendingItemsInCurrentPhase(projectDir);
  if (pendingInCurrentPhase.length > 0) {
    const ids = pendingInCurrentPhase.map((i) => i.id).join(", ");
    return {
      phases: [],
      blockedReason: `Current phase has pending items: ${ids}. Complete them before hardening.`,
      ready: false,
    };
  }

  const projectName = readProjectName(projectDir);
  const resolvedUrl =
    deployment_url ?? readDeploymentUrl(projectDir) ?? "http://localhost:3000";
  const useCaseTitles = readUseCaseTitles(projectDir);
  const activeGates = getActiveProjectGates(projectDir);
  const projectTags = readProjectTags(projectDir);

  const preReleaseGates = filterGateDescriptions(
    activeGates,
    PRERELEASE_PHASES,
  );
  const rcGates = filterGateDescriptions(activeGates, RC_PHASES);
  const loadGates = filterGateDescriptions(activeGates, LOAD_PHASES);

  const phases: HardeningPhase[] = [];

  const preReleasePrompt = buildPreReleasePrompt(projectName, preReleaseGates);
  writeHardeningPrompt(projectDir, "HARDEN-001", preReleasePrompt);
  phases.push({
    id: "HARDEN-001",
    name: "pre-release",
    gates: [...DEFAULT_PRERELEASE_GATES, ...preReleaseGates],
    promptFile: "docs/session-prompts/HARDEN-001.md",
    skipped: false,
  });

  const rcPrompt = buildRcPrompt(
    projectName,
    resolvedUrl,
    useCaseTitles,
    rcGates,
    projectTags,
  );
  writeHardeningPrompt(projectDir, "HARDEN-002", rcPrompt);
  phases.push({
    id: "HARDEN-002",
    name: "rc",
    gates: [...DEFAULT_RC_GATES, ...rcGates],
    promptFile: "docs/session-prompts/HARDEN-002.md",
    skipped: false,
  });

  const hasLoadGates = loadGates.length > 0;
  const skipLoad = skip_load_test && !hasLoadGates;
  if (!skipLoad) {
    const loadPrompt = buildLoadPrompt(projectName, resolvedUrl, loadGates);
    writeHardeningPrompt(projectDir, "HARDEN-003", loadPrompt);
  }
  phases.push({
    id: "HARDEN-003",
    name: "load",
    gates: [...DEFAULT_LOAD_GATES, ...loadGates],
    promptFile: "docs/session-prompts/HARDEN-003.md",
    skipped: skipLoad,
  });

  return { phases, ready: true };
}

/**
 * Format the StartHardeningResult as a plain-text MCP response.
 *
 * @param result - The structured start-hardening result
 * @returns Formatted markdown string
 */
export function formatStartHardeningResult(
  result: StartHardeningResult,
): string {
  if (!result.ready) {
    return `## Hardening Blocked\n\n${result.blockedReason ?? "Unknown reason."}`;
  }

  const lines: string[] = [
    "## 🛡️ Hardening Initiated",
    "",
    "Session prompts written for the following phases:",
    "",
  ];

  for (const phase of result.phases) {
    if (phase.skipped) {
      lines.push(`- **${phase.id}** (${phase.name}) — ⏭️ skipped`);
    } else {
      lines.push(`- **${phase.id}** (${phase.name}) — ${phase.promptFile}`);
    }
  }

  const active = result.phases.filter((p) => !p.skipped);
  if (active.length > 0) {
    lines.push(
      "",
      "## Next Steps",
      `1. Load \`${active[0]!.promptFile}\` and run the pre-release gates.`,
      "2. When HARDEN-001 passes, proceed to HARDEN-002 (RC smoke test).",
    );
    if (active.length > 2) {
      lines.push(
        "3. When HARDEN-002 passes, proceed to HARDEN-003 (load test).",
      );
    }
  }

  return lines.join("\n");
}

/**
 * MCP handler for the start_hardening action.
 *
 * @param args - Raw args from the MCP router (project_dir, deployment_url, skip_load_test)
 * @returns MCP-style tool result with text content
 */
export function startHardeningHandler(args: Record<string, unknown>): {
  content: Array<{ type: "text"; text: string }>;
} {
  const projectDir = args["project_dir"] as string | undefined;
  if (!projectDir) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Missing required parameter 'project_dir' for action 'start_hardening'.",
        },
      ],
    };
  }

  const deploymentUrl = args["deployment_url"] as string | undefined;
  const skipLoadTest = (args["skip_load_test"] as boolean | undefined) ?? true;

  const result = startHardening({
    project_dir: projectDir,
    deployment_url: deploymentUrl,
    skip_load_test: skipLoadTest,
  });

  return {
    content: [{ type: "text", text: formatStartHardeningResult(result) }],
  };
}
