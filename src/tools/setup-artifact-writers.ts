/**
 * setup-artifact-writers: Writers for forgecraft.yaml, PRD, use-cases, and git init.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import type { CascadeDecision } from "../shared/types.js";
import type { ForgeCraftConfig } from "../shared/types.js";
import { deriveDefaultCascadeDecisions } from "./cascade-defaults.js";

// ── Git initialization ────────────────────────────────────────────────

/**
 * Result of a pre-flight git environment check.
 *
 * - `repo`    — a `.git` directory exists; all good.
 * - `no-repo` — git is installed but no repository exists yet; ForgeCraft will init one.
 * - `no-git`  — git binary not found; user must install git before setup can proceed.
 */
export type GitStatus = "repo" | "no-repo" | "no-git";

/**
 * Check whether a git repository and the git binary are present.
 *
 * Does NOT modify the filesystem. Safe to call at any time.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Current git status for the directory
 */
export function checkGitStatus(projectDir: string): GitStatus {
  if (existsSync(join(projectDir, ".git"))) return "repo";
  try {
    execSync("git --version", { stdio: "ignore" });
    return "no-repo";
  } catch {
    return "no-git";
  }
}

/**
 * Initialise a git repository in projectDir if one does not already exist.
 * Falls back gracefully when git is not installed.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Summary string describing what happened
 */
export function initGitRepo(projectDir: string): string {
  if (process.env["VITEST"] || process.env["NODE_ENV"] === "test") {
    return "git: skipped in test environment";
  }
  if (existsSync(join(projectDir, ".git"))) {
    return "git: existing repo detected — skipped init";
  }
  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    return "git not found — install git and run:\n  git init && git add . && git commit -m 'chore: initial forgecraft cascade'";
  }
  try {
    execSync("git init", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync(
      'git commit -m "chore: initial forgecraft cascade\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"',
      { cwd: projectDir, stdio: "ignore" },
    );
    return "git: repo initialised and cascade committed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `git init attempted but failed: ${message}`;
  }
}

// ── forgecraft.yaml writer ────────────────────────────────────────────

/**
 * Write or update forgecraft.yaml, inserting cascade decisions.
 * Does not overwrite existing cascade decisions if present.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param tags - Valid forgecraft tags to record
 * @param decisions - Cascade decisions to embed
 * @param sensitiveData - Whether the project handles sensitive data
 * @param brownfield - Whether this is a brownfield project
 * @returns True if the file was written or updated
 */
export function writeForgeYaml(
  projectDir: string,
  projectName: string,
  tags: string[],
  decisions: CascadeDecision[],
  sensitiveData?: boolean,
  brownfield?: boolean,
): boolean {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  let config: Record<string, unknown>;
  if (existsSync(yamlPath)) {
    try {
      config = yaml.load(readFileSync(yamlPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      config = {};
    }
  } else {
    config = { projectName, tags: tags.length > 0 ? tags : ["UNIVERSAL"] };
    if (sensitiveData !== undefined) config["sensitiveData"] = sensitiveData;
    if (brownfield === true) config["brownfield"] = true;
  }
  const existingCascade = config["cascade"] as
    | { steps?: CascadeDecision[] }
    | undefined;
  if (!existingCascade?.steps || existingCascade.steps.length === 0) {
    config["cascade"] = { steps: decisions };
    writeFileSync(
      yamlPath,
      yaml.dump(config, { lineWidth: 120, noRefs: true }),
      "utf-8",
    );
    return true;
  }
  return false;
}

/**
 * If forgecraft.yaml has an experiment block with an id but no group,
 * sets experiment.group = 'gs'.
 *
 * @param projectDir - Project root
 */
export function setExperimentGroupIfMissing(projectDir: string): void {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return;
  let config: Record<string, unknown>;
  try {
    config = yaml.load(readFileSync(yamlPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return;
  }
  if (!config || typeof config !== "object") return;
  const experiment = config["experiment"];
  if (!experiment || typeof experiment !== "object") return;
  const exp = experiment as Record<string, unknown>;
  if (typeof exp["id"] !== "string" || exp["id"].trim() === "") return;
  if (exp["group"] === "gs" || exp["group"] === "control") return;
  exp["group"] = "gs";
  writeFileSync(
    yamlPath,
    yaml.dump(config, { lineWidth: 120, noRefs: true }),
    "utf-8",
  );
}

// ── PRD and use-cases writers ─────────────────────────────────────────

/** Fields extracted by the AI from the spec. */
export interface AiExtractedFields {
  readonly problemStatement?: string;
  readonly primaryUsers?: string;
  readonly successCriteria?: string;
}

/**
 * Write docs/PRD.md using AI-extracted fields when available.
 * Never overwrites an existing PRD.
 *
 * @param projectDir - Project root
 * @param projectName - Project name for the PRD title
 * @param aiFields - AI-extracted problem, users, criteria
 * @param _specContent - Raw spec text (reserved for future use)
 * @returns True if a new PRD was written
 */
export function writePrd(
  projectDir: string,
  projectName: string,
  aiFields: AiExtractedFields,
  _specContent: string | null,
): boolean {
  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(prdPath, buildPrdContent(projectName, aiFields), "utf-8");
  return true;
}

function buildPrdContent(
  projectName: string,
  aiFields: AiExtractedFields,
): string {
  const fill = (placeholder: string) => `<!-- FILL: ${placeholder} -->`;
  const listOrFill = (csv: string | undefined, placeholder: string) =>
    csv
      ? csv
          .split(",")
          .map((s) => `- ${s.trim()}`)
          .join("\n")
      : fill(placeholder);
  return [
    `# ${projectName}\n`,
    `## Problem\n\n${aiFields.problemStatement ?? fill("describe the problem this project solves")}\n`,
    `## Users\n\n${listOrFill(aiFields.primaryUsers, "list the target users or personas")}\n`,
    `## Success Criteria\n\n${listOrFill(aiFields.successCriteria, "define measurable success criteria")}\n`,
    `## Components\n\n${fill("list the major components or modules")}\n`,
    `## External Systems\n\n${fill("list external APIs, services, or integrations")}\n`,
  ].join("\n");
}

/**
 * Write docs/use-cases.md using AI-extracted fields when available.
 * Never overwrites an existing use-cases.md.
 *
 * @param projectDir - Project root directory
 * @param projectName - Project name for use case context
 * @param aiFields - AI-extracted problem, users, criteria
 * @param _specContent - Raw spec text (reserved for future use)
 * @returns True if a new use-cases.md was written
 */
export function writeUseCases(
  projectDir: string,
  projectName: string,
  aiFields: AiExtractedFields,
  _specContent: string | null,
): boolean {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  if (existsSync(useCasesPath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(
    useCasesPath,
    buildUseCasesContent(projectName, aiFields),
    "utf-8",
  );
  return true;
}

function buildUseCasesContent(
  projectName: string,
  aiFields: AiExtractedFields,
): string {
  const fill = (placeholder: string) => `<!-- FILL: ${placeholder} -->`;
  const actors = aiFields.primaryUsers
    ? aiFields.primaryUsers.split(",").map((s) => s.trim())
    : [];
  const primaryActor = actors[0] ?? fill("primary actor");
  const secondaryActor = actors[1] ?? actors[0] ?? fill("secondary actor");
  const thirdActor = actors[2] ?? actors[0] ?? fill("actor");
  const problemContext = aiFields.problemStatement
    ? aiFields.problemStatement.slice(0, 150).replace(/\n/g, " ")
    : fill("problem context");
  const uc1 = [
    `## UC-001: Accomplish Primary Goal`,
    ``,
    `**Actor**: ${primaryActor}`,
    `**Precondition**: Actor is authenticated and the system is operational.`,
    `**Steps**:`,
    `1. Actor initiates the primary workflow.`,
    `2. System validates the request and processes the input.`,
    `3. System returns the result confirming the action was completed.`,
    `**Outcome**: The actor's goal is achieved. Context: ${problemContext}`,
  ].join("\n");
  const uc2 = [
    `## UC-002: Configure and Manage`,
    ``,
    `**Actor**: ${secondaryActor}`,
    `**Precondition**: Actor has appropriate permissions.`,
    `**Steps**:`,
    `1. Actor selects the configuration option.`,
    `2. System presents available options and current state.`,
    `3. Actor applies changes; system persists the configuration.`,
    `**Outcome**: Configuration is updated and takes effect immediately.`,
  ].join("\n");
  const uc3 = [
    `## UC-003: Review and Observe`,
    ``,
    `**Actor**: ${thirdActor}`,
    `**Precondition**: At least one operation has been completed.`,
    `**Steps**:`,
    `1. Actor navigates to the overview section.`,
    `2. System retrieves and displays the current state and history.`,
    `3. Actor reviews the information and takes appropriate action.`,
    `**Outcome**: Actor has a clear picture of the current system state.`,
  ].join("\n");
  return [`# Use Cases — ${projectName}`, ``, uc1, ``, uc2, ``, uc3, ``].join(
    "\n",
  );
}

// ── Re-export deriveDefaultCascadeDecisions for convenience ──────────
export { deriveDefaultCascadeDecisions };

// ── Sample-outcome writer ─────────────────────────────────────────────

/**
 * Write docs/sample-outcome.md — a stub for the first real deliverable of
 * a generative tool. Created when Phase 2 receives tool_sample_split = "tool_and_sample".
 *
 * The AI assistant should fill in the sections from the creative content
 * described in the spec (the book, song, game, artwork, etc.).
 * Never overwrites an existing file.
 *
 * @param projectDir - Project root
 * @param toolName - Name of the core generative tool
 * @returns True if the file was written
 */
export function writeSampleOutcome(
  projectDir: string,
  toolName: string,
): boolean {
  const outcomePath = join(projectDir, "docs", "sample-outcome.md");
  if (existsSync(outcomePath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  const fill = (placeholder: string) => `<!-- FILL: ${placeholder} -->`;
  const content = [
    `# Sample Outcome — First Real Deliverable`,
    ``,
    `> **What this file is:** The core tool is **${toolName}**. This file captures the`,
    `> first specific creative work the tool will produce — the proof that the tool works.`,
    `> It is an acceptance test, not a deliverable in itself.`,
    `> Read the original spec and extract the creative content details into the sections below.`,
    ``,
    `## The Work`,
    ``,
    `**Title / Name**: ${fill("name of the book, song, game, artwork, etc.")}`,
    `**Type**: ${fill("novel | music track | game | artwork | script | other")}`,
    ``,
    `## Description`,
    ``,
    fill(
      "brief description of what this creative work is — 2-3 sentences from the spec",
    ),
    ``,
    `## Key Elements`,
    ``,
    fill(
      "characters, themes, setting, style, structure — the specifics from the spec",
    ),
    ``,
    `## Acceptance Criteria`,
    ``,
    `The tool has succeeded with this first outcome when:`,
    ``,
    `- [ ] ${fill("first measurable criterion — e.g. 'generates a coherent chapter 1'")}`,
    `- [ ] ${fill("second criterion")}`,
    `- [ ] ${fill("third criterion")}`,
    ``,
    `## Notes`,
    ``,
    fill("anything else from the spec about this specific creative work"),
  ].join("\n");
  writeFileSync(outcomePath, content, "utf-8");
  return true;
}

/**
 * Load cascade decisions from forgecraft.yaml (convenience re-used in writers).
 */
export function loadExistingCascadeDecisions(
  projectDir: string,
): CascadeDecision[] | null {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return null;
  try {
    const config = yaml.load(
      readFileSync(yamlPath, "utf-8"),
    ) as ForgeCraftConfig;
    const steps = config?.cascade?.steps as CascadeDecision[] | undefined;
    return steps && steps.length > 0 ? steps : null;
  } catch {
    return null;
  }
}
