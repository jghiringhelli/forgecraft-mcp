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
  language?: string,
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
    if (language && language !== "typescript") config["language"] = language;
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

/** A single use case extracted from the spec by the AI. */
export interface UseCaseInput {
  readonly id: string;
  readonly title: string;
  readonly actor: string;
  readonly precondition: string;
  readonly steps: string[];
  readonly postcondition: string;
  readonly errorCases?: ReadonlyArray<{ name: string; description: string }>;
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
 * Write docs/use-cases.md from structured spec-derived use cases when available,
 * or from AI-extracted fields as a fallback. Never overwrites an existing use-cases.md.
 *
 * @param projectDir - Project root directory
 * @param projectName - Project name for use case context
 * @param aiFields - AI-extracted problem, users, criteria (fallback)
 * @param _specContent - Raw spec text (reserved for future use)
 * @param useCases - Structured use cases extracted from the spec (preferred)
 * @returns True if a new use-cases.md was written
 */
export function writeUseCases(
  projectDir: string,
  projectName: string,
  aiFields: AiExtractedFields,
  _specContent: string | null,
  useCases?: ReadonlyArray<UseCaseInput>,
): boolean {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  if (existsSync(useCasesPath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  const content =
    useCases && useCases.length > 0
      ? buildStructuredUseCasesContent(projectName, useCases)
      : buildUseCasesContent(projectName, aiFields);
  writeFileSync(useCasesPath, content, "utf-8");
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

/**
 * Build use-cases.md from structured UC data extracted by the AI from the spec.
 * Produces the Precondition / Steps / Postcondition / Error Cases format that
 * generate_harness and layer_status expect.
 */
function buildStructuredUseCasesContent(
  projectName: string,
  useCases: ReadonlyArray<UseCaseInput>,
): string {
  const lines: string[] = [`# Use Cases — ${projectName}`, ``];
  for (const uc of useCases) {
    lines.push(`## ${uc.id}: ${uc.title}`, ``);
    lines.push(`**Actor**: ${uc.actor}`);
    lines.push(`**Precondition**: ${uc.precondition}`);
    lines.push(`**Steps**:`);
    uc.steps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
    lines.push(`**Postcondition**: ${uc.postcondition}`);
    if (uc.errorCases && uc.errorCases.length > 0) {
      lines.push(`**Error Cases**:`);
      for (const ec of uc.errorCases) {
        lines.push(`  - ${ec.name}: ${ec.description}`);
      }
    }
    lines.push(``);
  }
  return lines.join("\n");
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

// ── Operation classification writer ──────────────────────────────────

/**
 * Write docs/operation-classification.md — Tier 0–3 operation classification schema.
 * Referenced by CLAUDE.md and the pre-tool-use hook.
 * Never overwrites an existing file.
 *
 * @param projectDir - Project root
 * @returns True if the file was written
 */
export function writeOperationClassification(projectDir: string): boolean {
  const filePath = join(projectDir, "docs", "operation-classification.md");
  if (existsSync(filePath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  const content = [
    `# Operation Classification — Tier 0–3 Gate`,
    ``,
    `> Referenced by CLAUDE.md and pre-tool-use hook.`,
    `> Every AI-initiated operation must be classified before execution.`,
    `> Tier 2+ requires human awareness. Tier 3 requires explicit authorization.`,
    ``,
    `## Tier 0 — Reversible (no confirmation needed)`,
    ``,
    `- Read operations (no side effects)`,
    `- File edits with git history`,
    `- Test runs (no DB side effects)`,
    `- Documentation updates`,
    `- Adding code / new files`,
    ``,
    `## Tier 1 — Recoverable with effort (warn, proceed)`,
    ``,
    `- \`git push\` to feature branch (can be reverted via revert commit)`,
    `- Adding/updating dependencies`,
    `- Environment variable changes (non-production)`,
    `- Schema migrations on dev/test (reversible via rollback migration)`,
    `- Config file changes`,
    ``,
    `## Tier 2 — Hard to recover (require human awareness)`,
    ``,
    `- \`git push\` to main (use PR — direct push blocked)`,
    `- Full data resync / backfill operations`,
    `- Schema migrations on production`,
    `- Mass update queries with broad WHERE conditions`,
    `- Adding dependencies >100 KB`,
    `- Changing core architecture decisions (require ADR)`,
    ``,
    `## Tier 3 — Irreversible (blocked without FORGECRAFT_ALLOW_DESTRUCTIVE=1)`,
    ``,
    `- \`DROP TABLE\`, \`TRUNCATE\`, \`DELETE\` without specific WHERE`,
    `- \`git push --force\` to main/master`,
    `- \`rm -rf\` on source directories`,
    `- Disabling security constraints (RLS, auth guards) in production`,
    `- Hard delete of domain entities (use soft delete + audit log instead)`,
    `- Dropping databases or clearing all data`,
    ``,
    `## Override Protocol`,
    ``,
    `For legitimate Tier 3 operations (emergency fixes, database resets):`,
    `1. Document the reason in \`docs/status.md\``,
    `2. Get explicit human confirmation`,
    `3. Run with: \`FORGECRAFT_ALLOW_DESTRUCTIVE=1 <command>\``,
    `4. Create an ADR if the operation represents a structural change`,
  ].join("\n");
  writeFileSync(filePath, content, "utf-8");
  return true;
}

// ── Spec sub-doc stub writers ─────────────────────────────────────────

/**
 * Write stub documentation files for large specs or specs with architecture/data model content.
 * Creates docs/architecture.md, docs/data-model.md, docs/domain-glossary.md,
 * and docs/test-architecture.md as stubs for the AI to populate from the spec.
 * Never overwrites existing files.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param specContent - Raw spec text (checked for size and content signals)
 * @returns Array of file paths written
 */
export function writeSpecSubDocStubs(
  projectDir: string,
  projectName: string,
  specContent: string | null,
): string[] {
  const written: string[] = [];
  const docsDir = join(projectDir, "docs");
  mkdirSync(docsDir, { recursive: true });

  const specLines = specContent ? specContent.split("\n").length : 0;
  const hasArchSignal = specContent
    ? /architect|layer|component|infrastructure|service|repository/i.test(
        specContent,
      )
    : false;
  const hasDataSignal = specContent
    ? /entity|model|schema|table|relation|database|db\b/i.test(specContent)
    : false;

  // Always write if spec is large (>400 lines) or has architecture/data signals
  const shouldWrite =
    specLines > 400 || hasArchSignal || hasDataSignal || !specContent;

  if (!shouldWrite) return written;

  const architecturePath = join(docsDir, "architecture.md");
  if (!existsSync(architecturePath)) {
    writeFileSync(
      architecturePath,
      [
        `# Architecture Overview`,
        ``,
        `> Extract from \`docs/PRD.md\` and the spec. Document the system architecture.`,
        ``,
        `## System Layers`,
        ``,
        `[Document the layer diagram here]`,
        ``,
        `## Component Diagram`,
        ``,
        `[Document the main components and their relationships]`,
        ``,
        `## Data Flow`,
        ``,
        `[Document how data flows through the system]`,
        ``,
        `## Integration Points`,
        ``,
        `[Document external systems and integration patterns]`,
      ].join("\n"),
      "utf-8",
    );
    written.push("docs/architecture.md");
  }

  const dataModelPath = join(docsDir, "data-model.md");
  if (!existsSync(dataModelPath)) {
    writeFileSync(
      dataModelPath,
      [
        `# Data Model`,
        ``,
        `> Extract from spec/PRD. Document all entities, relationships, and constraints.`,
        ``,
        `## Entities`,
        ``,
        `[List all primary entities with their fields]`,
        ``,
        `## Relationships`,
        ``,
        `[Document entity relationships]`,
        ``,
        `## Constraints & Invariants`,
        ``,
        `[Document business rules, uniqueness constraints, etc.]`,
        ``,
        `## Schema Notes`,
        ``,
        `[Naming conventions, migration strategy, etc.]`,
      ].join("\n"),
      "utf-8",
    );
    written.push("docs/data-model.md");
  }

  const glossaryPath = join(docsDir, "domain-glossary.md");
  if (!existsSync(glossaryPath)) {
    writeFileSync(
      glossaryPath,
      [
        `# Domain Glossary`,
        ``,
        `> Extract from spec. Define all domain terms used in code, tests, and docs.`,
        `> Bilingual is fine if the team operates in two languages.`,
        ``,
        `| Term | Definition | Used in |`,
        `|------|-----------|---------|`,
        `| [term] | [definition] | [files/modules] |`,
      ].join("\n"),
      "utf-8",
    );
    written.push("docs/domain-glossary.md");
  }

  const testArchPath = join(docsDir, "test-architecture.md");
  if (!existsSync(testArchPath)) {
    writeFileSync(
      testArchPath,
      buildTestArchitectureContent(projectName),
      "utf-8",
    );
    written.push("docs/test-architecture.md");
  }

  return written;
}

/**
 * Build the test-architecture.md template content.
 *
 * @param _projectName - Project name (reserved for future customization)
 * @returns Formatted test architecture content
 */
function buildTestArchitectureContent(_projectName: string): string {
  return [
    `# Test Architecture`,
    ``,
    `## Test Pyramid`,
    ``,
    `- **Unit tests** — domain logic, pure functions, no I/O`,
    `- **Integration tests** — services with real adapters (DB, external APIs)`,
    `- **E2E / smoke tests** — critical user journeys via Playwright or equivalent`,
    ``,
    `## TDD Protocol`,
    ``,
    `1. Write the failing test first: \`test(scope): [RED] description\``,
    `2. Implement minimal code that passes: \`feat(scope): [GREEN] description\``,
    `3. Refactor: \`refactor(scope): description\``,
    ``,
    `Never commit [GREEN] code without a [RED] commit for the same scope.`,
    ``,
    `## Coverage Targets`,
    ``,
    `- Global: ≥80%`,
    `- Critical modules (auth, security, payments): ≥90%`,
    `- Run: \`vitest run --coverage\``,
    ``,
    `## Pre-commit vs Pre-push`,
    ``,
    `- **Pre-commit**: \`vitest run --changed --passWithNoTests\` (affected tests only)`,
    `- **Pre-push**: full test suite (\`vitest run\`)`,
    ``,
    `## Test Naming`,
    ``,
    `Adversarial naming: \`test_rejects_X\`, \`test_denies_Y\`, \`test_prevents_Z\`.`,
    `Not: \`test_basic_flow\`, \`test_happy_path\`.`,
    ``,
    `## Test DB vs Dev DB`,
    ``,
    `Always use a separate test database/instance. Never run tests against dev or production.`,
  ].join("\n");
}

// ── Agent definitions writer ──────────────────────────────────────────

/**
 * Write generic sub-agent definitions to .claude/agents/.
 * Agents are autonomous Claude Code sub-agents with specialized personas.
 * Never overwrites existing files.
 *
 * @param projectDir - Project root
 * @returns Array of agent filenames written
 */
export function writeAgentDefinitions(projectDir: string): string[] {
  const agentsDir = join(projectDir, ".claude", "agents");
  mkdirSync(agentsDir, { recursive: true });
  const written: string[] = [];

  const agents: Array<{ filename: string; content: string }> = [
    {
      filename: "test-hunter.md",
      content: buildTestHunterAgent(),
    },
    {
      filename: "spec-guardian.md",
      content: buildSpecGuardianAgent(),
    },
    {
      filename: "security-reviewer.md",
      content: buildSecurityReviewerAgent(),
    },
    {
      filename: "change-reviewer.md",
      content: buildChangeReviewerAgent(),
    },
  ];

  for (const agent of agents) {
    const agentPath = join(agentsDir, agent.filename);
    if (!existsSync(agentPath)) {
      writeFileSync(agentPath, agent.content, "utf-8");
      written.push(agent.filename);
    }
  }
  return written;
}

function buildTestHunterAgent(): string {
  return [
    `---`,
    `name: test-hunter`,
    `description: >`,
    `  Generates adversarial tests for a module or feature. Does NOT write happy-path`,
    `  tests — that is the author's job. Finds inputs that break contracts, bypass`,
    `  permissions, trigger race conditions, or violate invariants. Invoke when a module`,
    `  has a base suite and needs adversarial hardening, before merging a sensitive feature,`,
    `  or after a post-mortem (why didn't a test catch this?).`,
    `tools: [Read, Glob, Grep, Bash]`,
    `---`,
    ``,
    `# Test Hunter`,
    ``,
    `You are an attacker. Your job is NOT to verify the happy path works — the author`,
    `already did that. Your job is to find the cracks.`,
    ``,
    `GS White Paper §4.3 _Verifiable_: "the test is a hunter, not a witness".`,
    ``,
    `## Principles`,
    ``,
    `1. **Against interfaces, never against implementation.** A test that breaks on a valid`,
    `   refactor is a bad test.`,
    `2. **Name the violation.** \`test_denies_X\`, \`test_rejects_X\`, \`test_survives_Y\`.`,
    `3. **Cover attack classes, not examples.** One test for "leading whitespace" forces`,
    `   coverage of the entire whitespace edge case class.`,
    `4. **Race conditions count.** Two parallel mutations, two concurrent syncs.`,
    ``,
    `## Attack classes to consider`,
    ``,
    `- **Adversarial input**: empty, whitespace-only, very long (>1 MB), null on non-null`,
    `  fields, Unicode edge cases (\\u0000, RTL, zero-width), numbers (0, -0, Infinity, NaN).`,
    `- **Auth / permission bypass**: expired token, tampered claims, cross-tenant ID, anon`,
    `  request to authenticated endpoint.`,
    `- **Invalid state transitions**: archiving already-archived entity, deleting already-`,
    `  deleted record, inconsistent field combinations (e.g., status='accepted' with rejection`,
    `  fields populated).`,
    `- **Idempotence**: run the same mutation twice → same result; re-sync same entity → no`,
    `  duplicate.`,
    `- **Race conditions**: two parallel updates to the same record; two concurrent jobs for`,
    `  the same resource.`,
    `- **Dirty data**: missing required fields from external API, malformed dates, negative`,
    `  sizes, empty arrays where non-empty is expected.`,
    ``,
    `## How to work`,
    ``,
    `1. Read the target module and its existing test suite.`,
    `2. Identify the **public contract** (exports, signatures, documented side effects).`,
    `3. List applicable attack classes given the module's purpose.`,
    `4. Write 5–15 targeted tests. One violation per test.`,
    `5. Run the suite and report.`,
    ``,
    `## Output`,
    ``,
    `Add tests to the existing \`*.test.ts\` (or language equivalent). Then report:`,
    ``,
    `\`\`\`markdown`,
    `# Test Hunter — <module>`,
    `## Tests added (<N>)`,
    `- Input adversarial: X`,
    `- Auth/permissions: X`,
    `- State transitions: X`,
    `- Idempotence: X`,
    `- Race conditions: X`,
    `## Real bugs found (if any)`,
    `## Not covered (and why)`,
    `\`\`\``,
  ].join("\n");
}

function buildSpecGuardianAgent(): string {
  return [
    `---`,
    `name: spec-guardian`,
    `description: >`,
    `  Verifies the codebase is in sync with the spec (PRD.md, use-cases.md, ADRs,`,
    `  data-model.md). Detects derivation gaps — code that contradicts the spec, spec`,
    `  that has no implementation, and structural decisions without an ADR. Invoke before`,
    `  cutting a release or when drift is suspected.`,
    `tools: [Read, Glob, Grep, Bash]`,
    `---`,
    ``,
    `# Spec Guardian`,
    ``,
    `Your job: make code and specification describe the same system. Any gap between them`,
    `is a **derivation gap** (GS White Paper §6.4) and is as important as a bug.`,
    ``,
    `## What to check`,
    ``,
    `### 1. Spec → code (was it implemented?)`,
    `For each section of docs/PRD.md, use-cases.md, ADRs:`,
    `- Is there code that implements this decision?`,
    `- If not: is it on the roadmap as pending?`,
    `- If neither: 🚨 gap.`,
    ``,
    `### 2. Code → spec (is it documented?)`,
    `For each module or structural decision in code:`,
    `- Is there a spec or ADR justifying it?`,
    `- If not and the decision is non-trivial: 🚨 missing ADR.`,
    ``,
    `### 3. Use cases → tests`,
    `Each UC in use-cases.md should have test coverage. For each UC:`,
    `- Do named tests exist?`,
    `- If not: ⚠️ UC without coverage.`,
    ``,
    `### 4. ADR consistency`,
    `- Are there ADRs that should be marked Superseded but aren't?`,
    `- Are there structural decisions in commits that have no ADR?`,
    ``,
    `### 5. Conventions`,
    `- Files > 300 lines (Bounded violation).`,
    `- Functions > 50 lines.`,
    `- Naming conventions (files: kebab-case, types: PascalCase, DB: snake_case).`,
    `- Circular imports.`,
    ``,
    `## How to work`,
    ``,
    `1. Read docs/PRD.md and docs/use-cases.md.`,
    `2. Run \`git log --oneline --since='7 days ago'\` for recent activity.`,
    `3. For each ADR, find the corresponding implementation.`,
    `4. For each module, find the spec that justifies it.`,
    ``,
    `## Output`,
    ``,
    `\`\`\`markdown`,
    `# Spec Guardian — <date> — <branch>`,
    `## Overall: ✅ Aligned / ⚠️ Minor drift / 🚨 Major gaps`,
    `## Gaps found`,
    `### 🚨 Major (block release)`,
    `### ⚠️ Minor (create issue)`,
    `### 🧹 Housekeeping`,
    `## UC coverage`,
    `| UC | Tests listed | Tests found | Status |`,
    `## Missing ADRs`,
    `## Next steps`,
    `\`\`\``,
  ].join("\n");
}

function buildSecurityReviewerAgent(): string {
  return [
    `---`,
    `name: security-reviewer`,
    `description: >`,
    `  Reviews code changes for security issues: credential leaks, auth bypass, missing`,
    `  input validation, unsafe operations, and violations of operation-classification.md.`,
    `  Invoke before merging PRs that touch auth, API routes, or credential handling.`,
    `tools: [Read, Glob, Grep, Bash]`,
    `---`,
    ``,
    `# Security Reviewer`,
    ``,
    `Specialized reviewer for security concerns. Your output is a verdict; merging is done`,
    `by a human.`,
    ``,
    `## What to review`,
    ``,
    `### 🚨 Credential leaks (zero tolerance)`,
    `- No secrets committed. Check with: git grep -nE '...' on your staged files.`,
    `- No \`.env\` files committed (only \`.env.example\`).`,
    `- \`NEXT_PUBLIC_*\` variables contain nothing sensitive.`,
    `- Service/admin credentials isolated to server-side code, never in client-side.`,
    ``,
    `### Auth on all endpoints`,
    `For each new API route or server action:`,
    `- First line calls auth check (\`requireAuth()\`, \`requireRole()\`, or equivalent).`,
    `- Inputs validated with schema (Zod, Pydantic, etc.) — no assumed shape.`,
    `- Outputs filtered — no leaking of internal IDs or sensitive columns.`,
    ``,
    `### Security constraints`,
    `- Row-level or equivalent security active on data tables.`,
    `- No policy/guard set to \`allow all\` without explicit justification.`,
    `- Admin-only credentials not accessible from user-facing code paths.`,
    ``,
    `### Input validation`,
    `- Path parameters validated — no \`../\` traversal possible.`,
    `- Queries parameterized — no template string SQL.`,
    `- File uploads: type and size checks present.`,
    ``,
    `### Destructive operations`,
    `- Check against \`docs/operation-classification.md\`.`,
    `- Any new Tier 2+ operation? Update that doc.`,
    `- Any Tier 3 in automated code? 🚨 BLOCK.`,
    ``,
    `## How to work`,
    ``,
    `1. \`git diff main..HEAD --stat\` — inventory.`,
    `2. Focus on auth, API routes, and credential handling.`,
    `3. Cross-check with \`docs/operation-classification.md\`.`,
    ``,
    `## Output`,
    ``,
    `\`\`\`markdown`,
    `# Security Review — <branch>`,
    `## Verdict: ✅ APPROVE / ⚠️ APPROVE WITH CONCERNS / ❌ REQUEST CHANGES / 🚨 BLOCK`,
    `## Findings`,
    `### 🚨 Critical (block merge)`,
    `### ❌ Must fix`,
    `### ⚠️ Concerns`,
    `### ✅ Good practice observed`,
    `## Suggested tests`,
    `\`\`\``,
    ``,
    `**Rule**: when in doubt, block. A conversation is cheaper than a breach.`,
  ].join("\n");
}

function buildChangeReviewerAgent(): string {
  return [
    `---`,
    `name: change-reviewer`,
    `description: >`,
    `  Reviews structural changes (new modules, refactors, schema changes) for`,
    `  architecture conformance, naming conventions, layer violations, and missing ADRs.`,
    `  Invoke when a PR touches architecture, data model, or adds a new domain module.`,
    `tools: [Read, Glob, Grep, Bash]`,
    `---`,
    ``,
    `# Change Reviewer`,
    ``,
    `Specialized reviewer for structural correctness. You catch architecture violations`,
    `that regular code review misses.`,
    ``,
    `## What to review`,
    ``,
    `### Architecture conformance`,
    `- Does the change respect the layer diagram in CLAUDE.md?`,
    `- No imports from a higher layer (UI importing from DB, etc.).`,
    `- No lateral imports between unrelated domains.`,
    `- New shared utilities go to \`shared/\` — not duplicated across domains.`,
    ``,
    `### File bounds (GS Bounded property)`,
    `- Files ≤ 300 lines.`,
    `- Functions ≤ 50 lines.`,
    `- One concern per file.`,
    ``,
    `### Naming and conventions`,
    `- Files: kebab-case.ts`,
    `- Types/classes: PascalCase`,
    `- Variables/functions: camelCase`,
    `- DB columns: snake_case`,
    `- No abbreviations (except id, url, http, db, api).`,
    ``,
    `### ADR coverage`,
    `- Does this change represent a structural decision?`,
    `- If yes: is there an ADR in docs/adrs/?`,
    `- If no ADR: this is a gap — flag it.`,
    ``,
    `### Test coverage`,
    `- New business logic has unit tests.`,
    `- New endpoints have integration tests.`,
    `- Tests are adversarial (test_rejects_X), not just happy-path.`,
    ``,
    `### Idempotence and safety`,
    `- New DB migrations are idempotent (IF NOT EXISTS, ON CONFLICT).`,
    `- No raw string concatenation in queries.`,
    `- New operations classified in docs/operation-classification.md if Tier 2+.`,
    ``,
    `## How to work`,
    ``,
    `1. \`git diff main..HEAD --stat\` — inventory of changed files.`,
    `2. Read each new/modified file against the checklist above.`,
    `3. Cross-check the layer diagram from CLAUDE.md.`,
    `4. Check docs/adrs/ for coverage of structural decisions.`,
    ``,
    `## Output`,
    ``,
    `\`\`\`markdown`,
    `# Change Review — <branch>`,
    `## Verdict: ✅ APPROVE / ⚠️ NITS / ❌ REQUEST CHANGES`,
    `## Changed files: <N>`,
    `## Findings`,
    `### ❌ Architecture violations (must fix)`,
    `### ⚠️ Convention violations (should fix)`,
    `### 📝 Missing ADRs`,
    `### ✅ Good patterns observed`,
    `## Suggested next steps`,
    `\`\`\``,
  ].join("\n");
}

// ── Project manifest writer ───────────────────────────────────────────

/**
 * Write docs/manifest.yaml — canonical GS document taxonomy contract.
 * Project-specific instance that references the canonical schema template.
 * Never overwrites an existing manifest.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param tags - Active project tags
 * @returns True if the file was written
 */
export function writeProjectManifest(
  projectDir: string,
  projectName: string,
  tags: readonly string[],
): boolean {
  const manifestPath = join(projectDir, "docs", "manifest.yaml");
  if (existsSync(manifestPath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });

  const projectType = inferProjectTypeFromTags(tags);
  const date = new Date().toISOString().split("T")[0];

  const lines = [
    `# docs/manifest.yaml — GS document taxonomy contract for ${projectName}`,
    `# Generated by ForgeCraft setup on ${date}`,
    `# Schema: forgecraft/templates/docs-manifest.yaml`,
    `#`,
    `# This file declares which documents exist, where they live, and which commit`,
    `# types require which doc updates. Tools (forgecraft, chronicle) read this`,
    `# to enforce the doc-first cascade and avoid spec drift.`,
    ``,
    `schema_source: "forgecraft/templates/docs-manifest.yaml"`,
    ``,
    `project:`,
    `  name: "${projectName}"`,
    `  type: ${projectType}`,
    `  release_phase: greenfield`,
    ``,
    `# Override canonical paths here if your layout differs from the default.`,
    `# Example: documents.specs.path: docs/product/`,
    `overrides: {}`,
    ``,
    `# Human-judgment gate — protects main from AI-only merges`,
    `human_judgment:`,
    `  protected_branches: [main, develop]`,
    `  require_review: true`,
    `  min_reviewers: 1`,
    `  require_tests_pass: true`,
    `  require_human_ack: true`,
    `  block_ai_only_merge: true`,
    ``,
    `# Three-layer recording contract`,
    `recording:`,
    `  project:`,
    `    owner: forgecraft`,
    `    surface: "docs/* + .claude/hooks/*"`,
    `    scope: cascade docs, gates, hooks, harness contracts`,
    `  individual:`,
    `    owner: chronicle`,
    `    surface: "~/.chronicle/"`,
    `    scope: prompt history, decisions, findings, work style`,
  ];

  writeFileSync(manifestPath, lines.join("\n") + "\n", "utf-8");
  return true;
}

function inferProjectTypeFromTags(tags: readonly string[]): string {
  if (tags.includes("WEB-NEXT") || tags.includes("WEB-REACT")) return "app";
  if (tags.includes("API")) return "api";
  if (tags.includes("CLI") && tags.includes("LIBRARY")) return "tool";
  if (tags.includes("CLI")) return "cli";
  if (tags.includes("LIBRARY")) return "library";
  return "service";
}

// ── Status writer ─────────────────────────────────────────────────────

/**
 * Write docs/status.md — current project state and next steps.
 * Gives AI assistants and humans a quick orientation at session start.
 * Never overwrites an existing file.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @returns True if the file was written
 */
export function writeStatusMd(
  projectDir: string,
  projectName: string,
): boolean {
  const statusPath = join(projectDir, "docs", "status.md");
  if (existsSync(statusPath)) return false;
  mkdirSync(join(projectDir, "docs"), { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const content = [
    `# ${projectName} — Status`,
    ``,
    `> Last updated: ${date} (auto-generated by ForgeCraft setup)`,
    `> Update this file at the end of each session. The Session Loop Invariant in CLAUDE.md`,
    `> references this file for any unresolved items.`,
    ``,
    `## Completed (this session)`,
    ``,
    `<!-- FILL: what was finished in the most recent session -->`,
    ``,
    `## In Progress`,
    ``,
    `<!-- FILL: what is actively being worked on -->`,
    ``,
    `## Next`,
    ``,
    `<!-- FILL: first roadmap item or pending task — be specific enough to resume without re-reading everything -->`,
    ``,
    `## Decisions Made (this session)`,
    ``,
    `<!-- FILL: key decisions made — link to ADRs where they exist -->`,
    ``,
    `## Blockers / Dependencies`,
    ``,
    `<!-- FILL: known blockers, open questions, or external dependencies -->`,
  ].join("\n");

  writeFileSync(statusPath, content, "utf-8");
  return true;
}

// ── Architecture CNT stub writer ─────────────────────────────────────

/**
 * Write docs/architecture/ CNT branch stubs — four scoped nodes for
 * layers, modules, data-model, and integrations.
 * Never overwrites existing files.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @returns Array of relative paths written
 */
export function writeArchitectureCntStubs(
  projectDir: string,
  projectName: string,
): string[] {
  const archDir = join(projectDir, "docs", "architecture");
  mkdirSync(archDir, { recursive: true });
  const written: string[] = [];

  const stubs: Array<{ file: string; content: string }> = [
    {
      file: "layers.md",
      content: [
        `# Architecture: Layer Diagram & Boundary Rules`,
        ``,
        `> CNT node — read when: changing or reviewing layer structure, adding a new module, or diagnosing layer violations.`,
        ``,
        `## Layers`,
        ``,
        `<!-- FILL: document the layer stack (e.g. Entry → Dispatch → Handlers → Domain → Adapters) -->`,
        ``,
        `## Boundary Rules`,
        ``,
        `| From | To | Allowed | Rule |`,
        `|---|---|---|---|`,
        `| <!-- FILL --> | <!-- FILL --> | ✅/❌ | <!-- FILL --> |`,
        ``,
        `## Key Invariants`,
        ``,
        `<!-- FILL: list the non-negotiable structural invariants (e.g. "no circular imports", "domain has zero external imports") -->`,
      ].join("\n"),
    },
    {
      file: "modules.md",
      content: [
        `# Architecture: Module Registry`,
        ``,
        `> CNT node — read when: adding a new module, understanding file ownership, or debugging an unexpected dependency.`,
        ``,
        `## Core Modules`,
        ``,
        `| Module | File | Owns | Does NOT own |`,
        `|---|---|---|---|`,
        `| <!-- FILL: module name --> | <!-- FILL: path --> | <!-- FILL: responsibility --> | <!-- FILL: what it delegates --> |`,
        ``,
        `## Shared Utilities`,
        ``,
        `<!-- FILL: list shared utility modules and their purpose -->`,
        ``,
        `## Addition Protocol`,
        ``,
        `When adding a new module: <!-- FILL: define the decision tree for where new code goes -->`,
      ].join("\n"),
    },
    {
      file: "data-model.md",
      content: [
        `# Architecture: Data Model & Schema`,
        ``,
        `> CNT node — read when: changing the data model, adding entities, modifying schema, or updating the ERD.`,
        ``,
        `## Core Entities`,
        ``,
        `<!-- FILL: describe primary entities with their fields and invariants -->`,
        ``,
        `## Entity Relationships`,
        ``,
        `\`\`\`mermaid`,
        `erDiagram`,
        `    %% FILL: replace with actual entities and relationships`,
        `    ENTITY_A ||--o{ ENTITY_B : "has"`,
        `\`\`\``,
        ``,
        `## Schema Notes`,
        ``,
        `<!-- FILL: naming conventions, migration strategy, DB / persistence approach -->`,
        ``,
        `## DB / State`,
        ``,
        `<!-- FILL: where does state live? (DB, file system, in-memory, external service) -->`,
        `<!-- If using a DB: describe the migration strategy and any ORM/query builder choices -->`,
      ].join("\n"),
    },
    {
      file: "integrations.md",
      content: [
        `# Architecture: External Integrations`,
        ``,
        `> CNT node — read when: adding a new external dependency, changing a protocol, or understanding network access.`,
        ``,
        `## Integration Map`,
        ``,
        `| Integration | Direction | When | Protocol |`,
        `|---|---|---|---|`,
        `| <!-- FILL: name --> | Inbound/Outbound | <!-- FILL: when --> | <!-- FILL: HTTP/gRPC/stdio/etc --> |`,
        ``,
        `## File System Contract`,
        ``,
        `<!-- FILL: what paths does this project read/write? what is out of bounds? -->`,
        ``,
        `## Network Policy`,
        ``,
        `<!-- FILL: which operations require network access? which must work offline? -->`,
      ].join("\n"),
    },
  ];

  for (const stub of stubs) {
    const filePath = join(archDir, stub.file);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, stub.content, "utf-8");
      written.push(`docs/architecture/${stub.file}`);
    }
  }

  // Suppress unused variable warning
  void projectName;

  return written;
}

// ── Load cascade decisions ────────────────────────────────────────────

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
