import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
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

export interface ContributeGateOptions {
  readonly projectRoot: string;
  readonly serverUrl?: string;
  readonly dryRun?: boolean;
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

/**
 * Reads the forgecraft.yaml config for contribution settings.
 */
function readContributionConfig(projectRoot: string): {
  contributeGates: false | "anonymous" | "attributed";
  serverUrl: string;
  githubUser?: string;
} {
  const forgecraftPath = join(projectRoot, "forgecraft.yaml");
  if (!existsSync(forgecraftPath)) {
    return { contributeGates: false, serverUrl: "https://api.genspec.dev" };
  }
  try {
    // Simple parse — avoid importing js-yaml to keep this lightweight
    const raw = readFileSync(forgecraftPath, "utf-8");
    const contributeMatch = raw.match(/contribute_gates:\s*(\S+)/);
    const serverMatch = raw.match(/server_url:\s*(\S+)/);
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
      serverUrl: serverMatch?.[1] ?? "https://api.genspec.dev",
      githubUser: githubMatch?.[1],
    };
  } catch {
    return { contributeGates: false, serverUrl: "https://api.genspec.dev" };
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
 * Submits a gate to the forgecraft-server API or queues it locally.
 *
 * @param gate - The project gate to submit.
 * @param mode - Contribution mode: anonymous or attributed.
 * @param serverUrl - Target API URL.
 * @param githubUser - GitHub username for attributed mode.
 * @param projectType - Optional project type context.
 * @returns Submission result with status and optional issue URL.
 */
async function submitGate(
  gate: ProjectGate,
  mode: "anonymous" | "attributed",
  serverUrl: string,
  githubUser?: string,
  projectType?: string,
): Promise<{ status: "submitted" | "pending"; issueUrl?: string }> {
  try {
    const response = await fetch(`${serverUrl}/contribute/gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: {
          id: gate.id,
          title: gate.title,
          description: gate.description,
          domain: gate.domain,
          gsProperty: gate.gsProperty,
          phase: gate.phase,
          hook: gate.hook,
          check: gate.check,
          passCriterion: gate.passCriterion,
          tags: gate.tags,
          evidence: gate.evidence,
          convergenceAttributes: gate.convergenceAttributes,
        },
        mode,
        attribution:
          mode === "attributed"
            ? { github: githubUser, projectType }
            : undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return { status: "pending" };
    const data = (await response.json()) as {
      status: string;
      issueUrl?: string;
    };
    return {
      status: data.status === "submitted" ? "submitted" : "pending",
      issueUrl: data.issueUrl,
    };
  } catch {
    return { status: "pending" };
  }
}

/**
 * Contributes all generalizable gates from .forgecraft/project-gates.yaml.
 * - Reads contribute_gates setting from forgecraft.yaml
 * - Skips gates already submitted (tracked in .forgecraft/contributions.json)
 * - Calls forgecraft-server API if reachable, otherwise queues locally
 * - Never throws — all failures are recorded as skipped
 *
 * @param options - Contribution options including project root and optional overrides.
 * @returns Result containing submitted, skipped gates and optional pending file path.
 */
export async function contributeGates(
  options: ContributeGateOptions,
): Promise<ContributionResult> {
  const { projectRoot, dryRun = false } = options;
  const config = readContributionConfig(projectRoot);

  if (!config.contributeGates) {
    return {
      submitted: [],
      skipped: [],
      pendingFile: undefined,
    };
  }

  const mode = config.contributeGates;
  const serverUrl = options.serverUrl ?? config.serverUrl;
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

    const result = await submitGate(gate, mode, serverUrl, config.githubUser);
    const contributed: ContributedGate = { gateId: gate.id, ...result, mode };
    submitted.push(contributed);
    recordSubmission(projectRoot, contributed);
  }

  // Write pending contributions to file for manual review/retry
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
