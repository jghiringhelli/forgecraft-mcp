/**
 * Gate contribution to the public quality-gates registry.
 *
 * Submission mechanism: GitHub issues on jghiringhelli/quality-gates
 * (there is no ForgeCraft API server — by design).
 *
 *   Primary:  `gh issue create` — works when the dev has the GitHub CLI
 *             installed and authenticated (the common case).
 *   Fallback: a pre-filled GitHub issue URL written to the pending file —
 *             one click opens the proposal in the browser, body pre-populated.
 *
 * Issue format matches .github/ISSUE_TEMPLATE/quality-gate-proposal.md in
 * the registry repo (labels: gate-proposal, status:pending-review).
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { getContributableGates } from "../shared/project-gates.js";
import type { ProjectGate } from "../shared/types.js";

/**
 * Validate that a generalizable gate satisfies all five community convergence attributes.
 * Returns a human-readable rejection reason, or null if the gate passes.
 *
 * The five attributes (GS White Paper §10.2):
 *   prescriptive, agnostic, promptHealthy, deterministic, convergent
 *
 * If convergenceAttributes is absent, we skip validation (backward compat: pre-existing gates).
 * If present, all five must be true for the gate to pass.
 *
 * @param gate - The project gate to validate
 * @returns Rejection reason string, or null if valid
 */
function validateConvergenceAttributes(gate: ProjectGate): string | null {
  const attrs = gate.convergenceAttributes;
  if (!attrs) return null;

  const failing: string[] = [];
  if (!attrs.prescriptive) failing.push("prescriptive");
  if (!attrs.agnostic) failing.push("agnostic");
  if (!attrs.promptHealthy) failing.push("prompt-healthy");
  if (!attrs.deterministic) failing.push("deterministic");
  if (!attrs.convergent) failing.push("convergent");

  if (failing.length === 0) return null;
  return (
    `convergence attribute check failed: [${failing.join(", ")}]. ` +
    `Set these to true or fix the gate before contributing.`
  );
}

/** Result of attempting to create a GitHub issue (injectable for tests). */
export interface GhResult {
  readonly ok: boolean;
  readonly stdout: string;
}

/** Function that runs the GitHub CLI — injectable for tests. */
export type GhRunner = (args: string[]) => GhResult;

export interface ContributeGateOptions {
  readonly projectRoot: string;
  /** Target registry repo in "owner/name" form. Default: jghiringhelli/quality-gates. */
  readonly registryRepo?: string;
  readonly dryRun?: boolean;
  readonly experimentId?: string;
  /** Override the gh CLI invocation (tests). */
  readonly ghRunner?: GhRunner;
}

export interface ContributionResult {
  readonly submitted: ContributedGate[];
  readonly skipped: SkippedGate[];
  readonly pendingFile?: string;
}

export interface ContributedGate {
  readonly gateId: string;
  readonly issueUrl?: string;
  readonly mode: "anonymous" | "attributed";
  readonly status: "submitted" | "pending";
}

export interface SkippedGate {
  readonly gateId: string;
  readonly reason: string;
}

const PENDING_CONTRIBUTIONS_FILE = ".forgecraft/pending-contributions.json";
const SUBMITTED_CONTRIBUTIONS_FILE = ".forgecraft/contributions.json";
const DEFAULT_REGISTRY_REPO = "jghiringhelli/quality-gates";
const ISSUE_LABELS = "gate-proposal,status:pending-review";

function readContributionConfig(projectRoot: string): {
  contributeGates: false | "anonymous" | "attributed";
  registryRepo: string;
  githubUser?: string;
} {
  const forgecraftPath = join(projectRoot, "forgecraft.yaml");
  if (!existsSync(forgecraftPath)) {
    return { contributeGates: false, registryRepo: DEFAULT_REGISTRY_REPO };
  }
  try {
    // Simple parse — avoid importing js-yaml to keep this lightweight
    const raw = readFileSync(forgecraftPath, "utf-8");
    const contributeMatch = raw.match(/contribute_gates:\s*(\S+)/);
    const repoMatch = raw.match(/registry_repo:\s*(\S+)/);
    const githubMatch = raw.match(/github_user:\s*(\S+)/);
    const val = contributeMatch?.[1];
    const contributeGates =
      val === "anonymous"
        ? "anonymous"
        : val === "attributed"
          ? "attributed"
          : false;
    return {
      contributeGates,
      registryRepo: repoMatch?.[1] ?? DEFAULT_REGISTRY_REPO,
      githubUser: githubMatch?.[1],
    };
  } catch {
    return { contributeGates: false, registryRepo: DEFAULT_REGISTRY_REPO };
  }
}

/**
 * Returns already-submitted gate IDs to avoid re-submitting.
 */
function getAlreadySubmitted(projectRoot: string): Set<string> {
  const filePath = join(projectRoot, SUBMITTED_CONTRIBUTIONS_FILE);
  if (!existsSync(filePath)) return new Set();
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as {
      gateId: string;
    }[];
    return new Set(data.map((c) => c.gateId));
  } catch {
    return new Set();
  }
}

/**
 * Records a submission to the contributions log.
 */
function recordSubmission(projectRoot: string, gate: ContributedGate): void {
  const filePath = join(projectRoot, SUBMITTED_CONTRIBUTIONS_FILE);
  let existing: ContributedGate[] = [];
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(
        readFileSync(filePath, "utf-8"),
      ) as ContributedGate[];
    } catch {
      existing = [];
    }
  }
  writeFileSync(
    filePath,
    JSON.stringify([...existing, gate], null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Build the GitHub issue title for a gate proposal.
 * Matches the registry's issue template: "[Gate Proposal] <gate-id>".
 */
function buildIssueTitle(gate: ProjectGate): string {
  return `[Gate Proposal] ${gate.id}`;
}

/**
 * Build the GitHub issue body matching the registry's
 * .github/ISSUE_TEMPLATE/quality-gate-proposal.md format.
 */
function buildIssueBody(
  gate: ProjectGate,
  mode: "anonymous" | "attributed",
  githubUser?: string,
  experimentId?: string,
): string {
  const contributor =
    mode === "attributed" && githubUser ? `@${githubUser}` : "anonymous";
  const tags = Array.isArray(gate.tags) ? gate.tags.join(" | ") : "UNIVERSAL";

  return [
    `## Gate Proposal`,
    ``,
    `**Contributor**: ${contributor}`,
    `**Project type**: ${gate.domain ?? "general"}`,
    experimentId ? `**Experiment**: ${experimentId}` : ``,
    ``,
    `---`,
    ``,
    `### Gate Definition`,
    ``,
    `**ID**: \`${gate.id}\``,
    `**Title**: ${gate.title}`,
    `**Category**: ${gate.domain ?? "other"}`,
    `**GS Property**: ${gate.gsProperty ?? ""}`,
    `**Phase**: ${gate.phase ?? "development"}`,
    `**Hook**: ${gate.hook ?? ""}`,
    `**Tags**: ${tags}`,
    ``,
    `### Description`,
    gate.description ?? "",
    ``,
    `### Check`,
    "```",
    gate.check ?? "",
    "```",
    ``,
    `### Pass Criterion`,
    gate.passCriterion ?? "",
    ``,
    `### Evidence`,
    `> ${(gate.evidence ?? "").replace(/\n/g, "\n> ")}`,
    ``,
    `---`,
    ``,
    `*Submitted via \`forgecraft-mcp contribute_gate\`. By submitting this proposal,`,
    `the contributor agrees the gate definition may be published under CC-BY-4.0`,
    `in the quality-gates registry.*`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/**
 * Build a pre-filled GitHub "new issue" URL — the no-auth fallback.
 * One click opens the proposal in the browser with the body pre-populated.
 * GitHub caps URLs around 8 KB; the body is truncated defensively.
 */
function buildFallbackIssueUrl(
  registryRepo: string,
  title: string,
  body: string,
): string {
  const truncatedBody =
    body.length > 5500
      ? body.slice(0, 5500) +
        "\n\n<!-- truncated — full gate YAML in .forgecraft/gates/active/ -->"
      : body;
  const params = new URLSearchParams({
    title,
    labels: ISSUE_LABELS,
    body: truncatedBody,
  });
  return `https://github.com/${registryRepo}/issues/new?${params.toString()}`;
}

/** Default GhRunner — invokes the real GitHub CLI. Exported for direct testing. */
export function runGhCli(args: string[]): GhResult {
  // Safety net: never create real GitHub issues from a test run.
  // Tests exercising the success path inject a mock ghRunner instead.
  if (process.env["VITEST"] || process.env["NODE_ENV"] === "test") {
    return { ok: false, stdout: "" };
  }
  try {
    const result = spawnSync("gh", args, {
      encoding: "utf-8",
      timeout: 15_000,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      return { ok: false, stdout: result.stdout ?? "" };
    }
    return { ok: true, stdout: (result.stdout ?? "").trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/**
 * Submit a gate proposal as a GitHub issue on the registry repo.
 *
 * Tries `gh issue create` first (authenticated CLI). On any failure, returns
 * status "pending" with a pre-filled issue URL the dev can open manually.
 *
 * @param gate - The project gate to submit
 * @param mode - Contribution mode: anonymous or attributed
 * @param registryRepo - Target repo ("owner/name")
 * @param githubUser - GitHub username for attributed mode
 * @param experimentId - Optional experiment identifier
 * @param ghRunner - Injectable gh CLI runner (tests)
 * @returns Submission result with status and issue URL
 */
function submitGateAsIssue(
  gate: ProjectGate,
  mode: "anonymous" | "attributed",
  registryRepo: string,
  githubUser?: string,
  experimentId?: string,
  ghRunner: GhRunner = runGhCli,
): { status: "submitted" | "pending"; issueUrl?: string } {
  const title = buildIssueTitle(gate);
  const body = buildIssueBody(gate, mode, githubUser, experimentId);

  // Primary: gh CLI. --body-file avoids all shell-escaping issues.
  let bodyDir: string | undefined;
  try {
    bodyDir = mkdtempSync(join(tmpdir(), "fc-gate-"));
    const bodyFile = join(bodyDir, "issue-body.md");
    writeFileSync(bodyFile, body, "utf-8");

    const result = ghRunner([
      "issue",
      "create",
      "--repo",
      registryRepo,
      "--title",
      title,
      "--body-file",
      bodyFile,
      "--label",
      ISSUE_LABELS,
    ]);

    if (result.ok) {
      // gh prints the created issue URL as the last stdout line
      const url = result.stdout
        .split("\n")
        .reverse()
        .find((l) => l.startsWith("https://"));
      return { status: "submitted", issueUrl: url };
    }
  } catch {
    // fall through to URL fallback
  } finally {
    if (bodyDir) {
      try {
        rmSync(bodyDir, { recursive: true, force: true });
      } catch {
        /* temp cleanup is best-effort */
      }
    }
  }

  // Fallback: pre-filled issue URL — dev opens it in the browser.
  return {
    status: "pending",
    issueUrl: buildFallbackIssueUrl(registryRepo, title, body),
  };
}

/**
 * Contributes all generalizable gates from .forgecraft/project-gates.yaml.
 * - Reads contribute_gates setting from forgecraft.yaml
 * - Skips gates already submitted (tracked in .forgecraft/contributions.json)
 * - Creates a GitHub issue on the registry repo via gh CLI when available,
 *   otherwise queues a pre-filled issue URL for one-click manual submission
 * - Never throws — all failures are recorded as skipped or pending
 *
 * @param options - Contribution options including project root and optional overrides.
 * @returns Result containing submitted, skipped gates and optional pending file path.
 */
export async function contributeGates(
  options: ContributeGateOptions,
): Promise<ContributionResult> {
  const { projectRoot, dryRun = false, experimentId, ghRunner } = options;
  const config = readContributionConfig(projectRoot);

  if (!config.contributeGates) {
    return { submitted: [], skipped: [], pendingFile: undefined };
  }

  const mode = config.contributeGates;
  const registryRepo = options.registryRepo ?? config.registryRepo;
  const gates = getContributableGates(projectRoot);
  const alreadySubmitted = getAlreadySubmitted(projectRoot);

  const submitted: ContributedGate[] = [];
  const skipped: SkippedGate[] = [];

  for (const gate of gates) {
    if (alreadySubmitted.has(gate.id)) {
      skipped.push({ gateId: gate.id, reason: "already submitted" });
      continue;
    }
    if (!gate.evidence?.trim()) {
      skipped.push({
        gateId: gate.id,
        reason: "evidence field is empty — required for contribution",
      });
      continue;
    }

    const convergenceIssue = validateConvergenceAttributes(gate);
    if (convergenceIssue) {
      skipped.push({ gateId: gate.id, reason: convergenceIssue });
      continue;
    }

    if (dryRun) {
      submitted.push({ gateId: gate.id, mode, status: "pending" });
      continue;
    }

    const result = submitGateAsIssue(
      gate,
      mode,
      registryRepo,
      config.githubUser,
      experimentId,
      ghRunner,
    );
    const contributed: ContributedGate = { gateId: gate.id, ...result, mode };
    submitted.push(contributed);
    recordSubmission(projectRoot, contributed);
  }

  // Write pending contributions (with their one-click issue URLs) for manual submission
  const pending = submitted.filter((s) => s.status === "pending");
  let pendingFile: string | undefined;
  if (pending.length > 0) {
    pendingFile = join(projectRoot, PENDING_CONTRIBUTIONS_FILE);
    writeFileSync(
      pendingFile,
      JSON.stringify(pending, null, 2) + "\n",
      "utf-8",
    );
  }

  return { submitted, skipped, pendingFile };
}
