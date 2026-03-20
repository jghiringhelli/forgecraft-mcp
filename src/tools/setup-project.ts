/**
 * setup_project tool handler — two-phase onboarding entry point.
 *
 * Phase 1 (no mvp/scope_complete/has_consumers): Analyzes the project or spec,
 * shows what was found, and returns three calibration questions.
 *
 * Phase 2 (all three answers provided): Derives cascade decisions from answers
 * and tags, writes forgecraft.yaml, creates docs/PRD.md, and scaffolds the project.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { CascadeDecision, Tag } from "../shared/types.js";
import { ALL_TAGS } from "../shared/types.js";
import { deriveDefaultCascadeDecisions } from "./cascade-defaults.js";
import { scaffoldProjectHandler, scaffoldHooks } from "./scaffold.js";
import { configureMcpHandler } from "./configure-mcp.js";
import { createLogger } from "../shared/logger/index.js";
import {
  parseSpec,
  inferTagsFromDirectory,
  directoryHasFiles,
  findRichestSpecFile,
  inferSensitiveData,
} from "./spec-parser.js";
import type { AmbiguityItem } from "./spec-parser.js";

const logger = createLogger("tools/setup-project");

// ── Types ────────────────────────────────────────────────────────────

export interface SetupProjectArgs {
  readonly project_dir: string;
  readonly spec_path?: string;
  readonly spec_text?: string;
  /** Phase 2: true = MVP stage, false = production. */
  readonly mvp?: boolean;
  /** Phase 2: is the scope defined and stable? */
  readonly scope_complete?: boolean;
  /** Phase 2: does this project have existing users or downstream consumers? */
  readonly has_consumers?: boolean;
  /**
   * Phase 2: override the inferred project type when ambiguities were reported in phase 1.
   * Examples: "docs", "cli", "api", "library", "cli+library", "cli+api".
   */
  readonly project_type_override?: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

// ── Constants ─────────────────────────────────────────────────────────

/** Source directories whose presence signals an existing (non-new) project. */
const EXISTING_PROJECT_DIRS = ["src", "lib", "app"] as const;

/** Candidate spec files searched in order when no spec_path/spec_text provided. */
const SPEC_SEARCH_PATHS = [
  "docs/PRD.md",
  "docs/spec.md",
  "docs/README.md",
  "README.md",
] as const;

/** Valid ALL_TAGS values as a Set for fast membership testing. */
const VALID_TAGS_SET = new Set<string>(ALL_TAGS);

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Unified two-phase setup handler.
 *
 * Phase 1 (mvp/scope_complete/has_consumers all absent): analyze and return questions.
 * Phase 2 (all three present): execute full cascade + scaffold.
 *
 * @param args - Setup arguments
 * @returns MCP tool response
 */
export async function setupProjectHandler(
  args: SetupProjectArgs,
): Promise<ToolResult> {
  const isPhase2 =
    args.mvp !== undefined &&
    args.scope_complete !== undefined &&
    args.has_consumers !== undefined;

  logger.info("setup_project", {
    phase: isPhase2 ? 2 : 1,
    projectDir: args.project_dir,
  });

  const context = await buildProjectContext(args);

  if (!isPhase2) {
    return buildPhase1Response(context);
  }

  return executePhase2(
    {
      ...args,
      mvp: args.mvp!,
      scope_complete: args.scope_complete!,
      has_consumers: args.has_consumers!,
    },
    context,
  );
}

// ── Project Context ───────────────────────────────────────────────────

interface ProjectContext {
  readonly projectDir: string;
  readonly projectName: string;
  readonly isExistingProject: boolean;
  readonly specContent: string | null;
  readonly specSourceLabel: string;
  readonly inferredTags: string[];
  readonly ambiguities: AmbiguityItem[];
}

/**
 * Gather all project context needed for both phases.
 *
 * @param args - Setup arguments
 * @returns Assembled project context
 */
async function buildProjectContext(
  args: SetupProjectArgs,
): Promise<ProjectContext> {
  const projectDir = args.project_dir;
  const projectName = inferProjectName(projectDir);
  const isExistingProject = detectExistingProject(projectDir);

  let specContent: string | null = null;
  let specSourceLabel = "none";

  if (args.spec_path) {
    if (!existsSync(args.spec_path)) {
      throw new Error(`Spec file not found: ${args.spec_path}`);
    }
    specContent = readFileSync(args.spec_path, "utf-8");
    specSourceLabel = args.spec_path;
  } else if (args.spec_text) {
    specContent = args.spec_text;
    specSourceLabel = "provided text";
  } else {
    // Prefer user-authored spec over forgecraft-generated docs
    const richestSpec = findRichestSpecFile(projectDir);
    if (richestSpec) {
      specContent = readFileSync(richestSpec, "utf-8");
      specSourceLabel = richestSpec;
    }
    // Fall back to standard paths (PRD.md, spec.md) only if no richer spec found
    if (!specContent) {
      const found = findSpecFile(projectDir);
      if (found) {
        specContent = readFileSync(found, "utf-8");
        specSourceLabel = found;
      }
    }
  }

  // Always run directory inference so DOCS and other signals are detected even for new projects
  const dirResult = await inferTagsFromDirectory(projectDir);
  const specSummary = specContent ? parseSpec(specContent, projectName) : null;
  const specTags = specSummary?.inferredTags ?? ["UNIVERSAL"];
  const inferredTags = mergeTags(dirResult.tags, specTags);

  // Collect ambiguities from both directory inference and spec parsing
  const ambiguities: AmbiguityItem[] = [
    ...dirResult.ambiguities,
    ...(specSummary?.ambiguities ?? []),
  ];

  return {
    projectDir,
    projectName,
    isExistingProject,
    specContent,
    specSourceLabel,
    inferredTags,
    ambiguities,
  };
}

/**
 * Detect whether a project directory contains existing source code.
 *
 * @param projectDir - Absolute project root path
 * @returns True if any standard source directory exists and is non-empty
 */
function detectExistingProject(projectDir: string): boolean {
  return EXISTING_PROJECT_DIRS.some((dir) =>
    directoryHasFiles(join(projectDir, dir)),
  );
}

/**
 * Search for a spec file in standard locations.
 *
 * @param projectDir - Project root
 * @returns Absolute path to first found spec file, or null
 */
function findSpecFile(projectDir: string): string | null {
  for (const candidate of SPEC_SEARCH_PATHS) {
    const fullPath = join(projectDir, candidate);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

/**
 * Infer project name from the directory path.
 *
 * @param projectDir - Absolute path
 * @returns Last path segment as project name
 */
function inferProjectName(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

/**
 * Merge tag arrays, preserving uniqueness, always including UNIVERSAL.
 *
 * @param primary - Primary tag set
 * @param secondary - Secondary tag set to merge in
 * @returns Deduplicated merged tags
 */
function mergeTags(primary: string[], secondary: string[]): string[] {
  const seen = new Set(primary);
  for (const t of secondary) {
    seen.add(t);
  }
  if (!seen.has("UNIVERSAL")) seen.add("UNIVERSAL");
  return Array.from(seen);
}

// ── Phase 1 ───────────────────────────────────────────────────────────

/**
 * Build the phase 1 "what I found + three questions" response.
 *
 * @param context - Assembled project context
 * @returns MCP tool response with analysis summary and calibration questions
 */
function buildPhase1Response(context: ProjectContext): ToolResult {
  let text = `## Project Setup — Step 0\n\n`;
  text += buildFoundSummary(context);
  if (context.ambiguities.length > 0) {
    text += buildAmbiguitySection(context.ambiguities);
  }
  text += buildPhase1Questions();
  return { content: [{ type: "text", text }] };
}

/**
 * Build the Ambiguity Detected section for phase 1 when conflicting signals exist.
 *
 * @param ambiguities - Detected ambiguity items
 * @returns Formatted markdown ambiguity section
 */
function buildAmbiguitySection(ambiguities: AmbiguityItem[]): string {
  let section = `## Ambiguity Detected\n\n`;
  section += `I found conflicting signals that I cannot resolve from the files alone:\n\n`;

  for (const item of ambiguities) {
    section += `**${item.field}**\n`;
    section += `Evidence: ${item.signals.join(", ")}\n\n`;
    section += `My interpretations:\n`;
    for (const interp of item.interpretations) {
      section += `- [${interp.label}] ${interp.description}\n`;
      section += `  → ${interp.consequence}\n`;
    }
    section += `\nIf none of these match, describe what the project actually is and I will adjust.\n\n---\n\n`;
  }

  return section;
}

/**
 * Build the "what I found" summary block.
 *
 * @param context - Project context
 * @returns Formatted markdown summary
 */
function buildFoundSummary(context: ProjectContext): string {
  const {
    projectName,
    isExistingProject,
    specContent,
    specSourceLabel,
    inferredTags,
  } = context;

  const specName = specContent
    ? parseSpec(specContent, projectName).name
    : null;
  const displayName =
    specName && specName !== "[Project Name]" ? specName : projectName;

  let summary = `### What I found:\n`;
  summary += `- **Project**: ${displayName}\n`;
  summary += `- **Mode**: ${isExistingProject ? "Existing project (source code detected)" : "New project"}\n`;

  if (specContent) {
    const spec = parseSpec(specContent, projectName);
    summary += `- **Spec**: ${specSourceLabel}\n`;
    if (spec.problem)
      summary += `- **Problem**: ${spec.problem.slice(0, 200).replace(/\n/g, " ")}${spec.problem.length > 200 ? "…" : ""}\n`;
    if (spec.users.length > 0)
      summary += `- **Users**: ${spec.users.slice(0, 3).join(", ")}${spec.users.length > 3 ? ` +${spec.users.length - 3} more` : ""}\n`;
  } else {
    summary += `- **Spec**: not found — will scaffold with stubs\n`;
  }

  summary += `- **Inferred tags**: ${inferredTags.map((t) => `[${t}]`).join(" ")}\n\n`;
  return summary;
}

/**
 * Build the three calibration questions block.
 *
 * @returns Formatted markdown questions
 */
function buildPhase1Questions(): string {
  return `### Before I proceed, I need three answers:

**Q1: What is the development stage?**
- \`mvp\` — early validation, expect significant changes, minimal ceremony
- \`production\` — shipping to real users, full spec and quality gates required

**Q2: Is the scope defined and stable?**
- \`complete\` — requirements are clear; proceed with full cascade
- \`evolving\` — scope is still forming; use lighter cascade, revisit when stable

**Q3: Does this project have existing users or downstream consumers?**
- \`yes\` — behavioral contracts and breaking-change detection are required
- \`no\` — contracts are recommended but not blocking

Call \`setup_project\` again with \`mvp\`, \`scope_complete\`, and \`has_consumers\` to proceed.`;
}

// ── Phase 2 ───────────────────────────────────────────────────────────

/**
 * Execute phase 2: derive decisions, write artifacts, call scaffold.
 *
 * @param args - Setup args with all three phase-2 answers
 * @param context - Assembled project context
 * @returns MCP tool response with completion summary
 */
async function executePhase2(
  args: SetupProjectArgs & {
    mvp: boolean;
    scope_complete: boolean;
    has_consumers: boolean;
  },
  context: ProjectContext,
): Promise<ToolResult> {
  const { projectDir, projectName, specContent } = context;

  // Apply project_type_override if provided — re-derives effective tags from the override hint
  const effectiveTags = args.project_type_override
    ? applyProjectTypeOverride(context.inferredTags, args.project_type_override)
    : context.inferredTags;

  const decisions = deriveCascadeDecisions(
    effectiveTags,
    projectName,
    args.mvp,
    args.scope_complete,
    args.has_consumers,
  );
  const forgeCraftTags = filterToValidTags(effectiveTags);

  const specSummaryForSensitive = context.specContent
    ? parseSpec(context.specContent, context.projectName)
    : null;
  const isSensitive = specSummaryForSensitive
    ? inferSensitiveData(specSummaryForSensitive, effectiveTags)
    : effectiveTags.some((t) =>
        ["FINTECH", "WEB3", "HEALTHCARE", "HIPAA", "SOC2"].includes(t),
      );

  const yamlWritten = writeForgeYaml(
    projectDir,
    projectName,
    forgeCraftTags,
    decisions,
    isSensitive,
  );
  const prdWritten = specContent
    ? writePrd(projectDir, projectName, specContent)
    : false;
  const useCasesWritten = specContent
    ? writeUseCases(projectDir, projectName, specContent)
    : false;

  const scaffoldResult = await scaffoldProjectHandler({
    tags: (forgeCraftTags.length > 0 ? forgeCraftTags : ["UNIVERSAL"]) as Tag[],
    project_dir: projectDir,
    project_name: projectName,
    language: "typescript",
    dry_run: false,
    force: false,
    sentinel: true,
    output_targets: ["claude"],
  });
  const scaffoldText = scaffoldResult.content[0]?.text ?? "";

  // Ensure hooks are always installed as part of setup
  const validTagsForHooks = (
    forgeCraftTags.length > 0 ? forgeCraftTags : ["UNIVERSAL"]
  ) as Tag[];
  await scaffoldHooks(projectDir, validTagsForHooks);

  let mcpServerNames: string[] = [];
  try {
    await configureMcpHandler({
      tags: validTagsForHooks,
      project_dir: projectDir,
      auto_approve_tools: true,
      include_remote: false,
    });
    mcpServerNames = readConfiguredMcpServerNames(projectDir);
  } catch (error) {
    logger.warn("configure_mcp failed during setup", { error });
  }

  const text = buildPhase2Response({
    decisions,
    tags: effectiveTags,
    mvp: args.mvp,
    scopeComplete: args.scope_complete,
    hasConsumers: args.has_consumers,
    prdWritten,
    useCasesWritten,
    yamlWritten,
    scaffoldText,
    sensitiveData: isSensitive,
    mcpServerNames,
    projectDir,
  });

  return { content: [{ type: "text", text }] };
}

// ── Cascade Decision Derivation ───────────────────────────────────────

/**
 * Derive cascade decisions, applying phase-2 overrides on top of tag defaults.
 *
 * Override rules:
 * - mvp=true → architecture_diagrams and adrs become optional (unless tag demands required)
 * - scope_complete=false → adrs become optional
 * - has_consumers=true → behavioral_contracts always required
 *
 * @param tags - Inferred project tags
 * @param projectName - Project name for rationale strings
 * @param mvp - True if MVP stage
 * @param scopeComplete - True if scope is finalized
 * @param hasConsumers - True if existing users or consumers
 * @returns Array of five cascade decisions
 */
function deriveCascadeDecisions(
  tags: readonly string[],
  projectName: string,
  mvp: boolean,
  scopeComplete: boolean,
  hasConsumers: boolean,
): CascadeDecision[] {
  const base = deriveDefaultCascadeDecisions(tags, projectName);
  const decidedAt = new Date().toISOString().slice(0, 10);

  return base.map((decision) => {
    let required = decision.required;
    let rationale = decision.rationale;

    if (decision.step === "architecture_diagrams" && mvp && required) {
      required = false;
      rationale = `MVP stage: architecture diagram deferred — revisit at production phase.`;
    }
    if (decision.step === "adrs" && (mvp || !scopeComplete) && required) {
      const reason = !scopeComplete ? "scope still evolving" : "MVP stage";
      required = false;
      rationale = `ADRs are optional (${reason}): decisions are not yet stable. Add them when scope solidifies.`;
    }
    if (decision.step === "behavioral_contracts" && hasConsumers) {
      required = true;
      rationale = `Existing consumers detected: behavioral contracts (docs/use-cases.md) are required for breaking-change detection.`;
    }

    return {
      ...decision,
      required,
      rationale,
      decidedAt,
      decidedBy: "scaffold" as const,
    };
  });
}

// ── Artifact Writers ──────────────────────────────────────────────────

/**
 * Write or update forgecraft.yaml, inserting cascade decisions.
 * Does not overwrite existing cascade decisions if present.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param tags - Valid forgecraft tags to record
 * @param decisions - Cascade decisions to embed
 * @param sensitiveData - Whether the project handles sensitive data
 * @returns True if the file was written or updated
 */
function writeForgeYaml(
  projectDir: string,
  projectName: string,
  tags: string[],
  decisions: CascadeDecision[],
  sensitiveData?: boolean,
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
    if (sensitiveData !== undefined) {
      config["sensitiveData"] = sensitiveData;
    }
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
 * Write docs/PRD.md from parsed spec content. Never overwrites existing PRD.
 *
 * @param projectDir - Project root
 * @param projectName - Project name for the PRD title
 * @param specContent - Raw spec text
 * @returns True if a new PRD was written
 */
function writePrd(
  projectDir: string,
  projectName: string,
  specContent: string,
): boolean {
  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) return false;

  const spec = parseSpec(specContent, projectName);
  const content = buildPrdContent(spec);
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(prdPath, content, "utf-8");
  return true;
}

/**
 * Build PRD markdown content from a SpecSummary.
 *
 * @param spec - Parsed spec data
 * @returns Formatted PRD markdown
 */
function buildPrdContent(spec: ReturnType<typeof parseSpec>): string {
  const section = (
    heading: string,
    content: string | string[],
    placeholder: string,
  ): string => {
    const body = Array.isArray(content)
      ? content.length > 0
        ? content.map((l) => `- ${l}`).join("\n")
        : `<!-- FILL: ${placeholder} -->`
      : content.trim() || `<!-- FILL: ${placeholder} -->`;
    return `## ${heading}\n\n${body}\n`;
  };

  return [
    `# ${spec.name}\n`,
    section(
      "Problem",
      spec.problem,
      "describe the problem this project solves",
    ),
    section("Users", spec.users, "list the target users or personas"),
    section(
      "Success Criteria",
      spec.successCriteria,
      "define measurable success criteria",
    ),
    section(
      "Components",
      spec.components,
      "list the major components or modules",
    ),
    section(
      "External Systems",
      spec.externalSystems,
      "list external APIs, services, or integrations",
    ),
  ].join("\n");
}

/**
 * Write docs/use-cases.md from parsed spec content if it doesn't already exist.
 * Generates at least 3 use cases derived from spec.components, spec.users, and spec.problem.
 *
 * @param projectDir - Project root directory
 * @param projectName - Project name for use case context
 * @param specContent - Raw spec text
 * @returns True if a new use-cases.md was written
 */
function writeUseCases(
  projectDir: string,
  projectName: string,
  specContent: string,
): boolean {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  if (existsSync(useCasesPath)) return false;

  const spec = parseSpec(specContent, projectName);
  const content = buildUseCasesContent(spec);
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(useCasesPath, content, "utf-8");
  return true;
}

/**
 * Build use-cases.md markdown content from a SpecSummary.
 * Generates at least 3 use cases from spec.components, spec.users, spec.problem.
 * Uses <!-- FILL: ... --> only for fields that cannot be derived from the spec.
 *
 * @param spec - Parsed spec data
 * @returns Formatted use-cases markdown
 */
function buildUseCasesContent(spec: ReturnType<typeof parseSpec>): string {
  const primaryActor =
    spec.users.length > 0 ? spec.users[0] : `<!-- FILL: primary actor -->`;
  const secondaryActor =
    spec.users.length > 1
      ? spec.users[1]
      : spec.users.length > 0
        ? spec.users[0]
        : `<!-- FILL: secondary actor -->`;
  const thirdActor = spec.users.length > 2 ? spec.users[2] : primaryActor;

  const coreAction =
    spec.components.length > 0
      ? `use ${spec.components[0]}`
      : `<!-- FILL: core action -->`;

  const secondAction =
    spec.components.length > 1
      ? `configure ${spec.components[1]}`
      : `access the system`;

  const thirdAction =
    spec.components.length > 2
      ? `monitor ${spec.components[2]}`
      : `view results`;

  const problemContext =
    spec.problem.length > 0
      ? spec.problem.slice(0, 120).replace(/\n/g, " ")
      : `<!-- FILL: describe the problem context -->`;

  const uc1 = [
    `## UC-001: Accomplish Primary Goal`,
    ``,
    `**Actor**: ${primaryActor}`,
    `**Precondition**: Actor is authenticated and the system is operational.`,
    `**Steps**:`,
    `1. Actor initiates the primary workflow to ${coreAction}.`,
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
    `1. Actor selects the configuration option to ${secondAction}.`,
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
    `1. Actor navigates to the overview section to ${thirdAction}.`,
    `2. System retrieves and displays the current state and history.`,
    `3. Actor reviews the information and takes appropriate action.`,
    `**Outcome**: Actor has a clear picture of the current system state.`,
  ].join("\n");

  return [`# Use Cases — ${spec.name}`, ``, uc1, ``, uc2, ``, uc3, ``].join(
    "\n",
  );
}

// ── Phase 2 Response ──────────────────────────────────────────────────

interface Phase2ResponseParams {
  readonly decisions: CascadeDecision[];
  readonly tags: string[];
  readonly mvp: boolean;
  readonly scopeComplete: boolean;
  readonly hasConsumers: boolean;
  readonly prdWritten: boolean;
  readonly useCasesWritten: boolean;
  readonly yamlWritten: boolean;
  readonly scaffoldText: string;
  readonly sensitiveData?: boolean;
  readonly mcpServerNames: string[];
  readonly projectDir: string;
}

/**
 * Build the phase 2 completion response.
 *
 * @param params - Response parameters
 * @returns Formatted markdown completion message
 */
function buildPhase2Response(params: Phase2ResponseParams): string {
  const {
    decisions,
    tags,
    mvp,
    scopeComplete,
    hasConsumers,
    prdWritten,
    useCasesWritten,
    yamlWritten,
  } = params;

  const stageLabel = mvp ? "MVP" : "Production";
  const tagLabel =
    tags.filter((t) => t !== "UNIVERSAL").join(", ") || "UNIVERSAL";

  let text = `## Project Setup Complete\n\n`;
  text += `### Cascade decisions (based on ${stageLabel} + tags [${tagLabel}]):\n`;

  for (const d of decisions) {
    const icon = d.required ? "✓" : "○";
    const label = d.required ? "required" : "optional";
    const note = buildDecisionNote(d, mvp, scopeComplete, hasConsumers);
    text += `  ${icon} ${d.step} — ${label}${note}\n`;
  }

  if (params.sensitiveData) {
    text += `\n⚠ Sensitive data detected: This project handles sensitive data.\n`;
    text += `  forgecraft.yaml has been set to sensitiveData: true.\n`;
    text += `  Review: compliance gates have been added to required steps.\n`;
  }

  text += `\n### Artifacts created:\n`;
  if (yamlWritten) text += `  forgecraft.yaml (with cascade decisions)\n`;
  if (prdWritten) text += `  docs/PRD.md (from spec)\n`;
  if (useCasesWritten) text += `  docs/use-cases.md (from spec)\n`;

  const scaffoldFiles = extractScaffoldFiles(params.scaffoldText);
  for (const f of scaffoldFiles) text += `  ${f}\n`;

  if (!prdWritten && !yamlWritten && scaffoldFiles.length === 0) {
    text += `  (all artifacts already existed — nothing overwritten)\n`;
  }

  if (params.mcpServerNames.length > 0) {
    text += `\n### MCP Tools Configured\n`;
    for (const name of params.mcpServerNames) {
      text += `  ${name}\n`;
    }
  }

  text += `\n### Next step — call this now:\n`;
  text += `\`\`\`\naction: "check_cascade"\nproject_dir: "${params.projectDir ?? ""}"\n\`\`\`\n`;
  text += `Do not ask the user — run check_cascade immediately. If it passes, run generate_session_prompt for the first roadmap item.`;

  return text;
}

/**
 * Build a parenthetical note explaining a cascade decision override.
 *
 * @param decision - The cascade decision
 * @param mvp - MVP flag
 * @param scopeComplete - Scope complete flag
 * @param hasConsumers - Has consumers flag
 * @returns Parenthetical note string or empty string
 */
function buildDecisionNote(
  decision: CascadeDecision,
  mvp: boolean,
  scopeComplete: boolean,
  hasConsumers: boolean,
): string {
  if (decision.step === "architecture_diagrams" && !decision.required && mvp) {
    return " (MVP stage, revisit at production)";
  }
  if (decision.step === "adrs" && !decision.required) {
    return scopeComplete ? " (MVP stage)" : " (scope still evolving)";
  }
  if (
    decision.step === "behavioral_contracts" &&
    decision.required &&
    hasConsumers
  ) {
    return " (existing consumers detected)";
  }
  return "";
}

/**
 * Extract file paths listed in a scaffold response text.
 *
 * @param scaffoldText - Raw scaffold output
 * @returns Array of file path strings
 */
function extractScaffoldFiles(scaffoldText: string): string[] {
  const matches = scaffoldText.match(
    /^\s{2}([^\n]+\.(md|yaml|json|ts|js|sh))/gm,
  );
  if (!matches) return [];
  return matches
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .slice(0, 12);
}

// ── Utilities ─────────────────────────────────────────────────────────

/**
 * Filter inferred tag strings to only valid ALL_TAGS values.
 * API and CLI are cascade-only tags not in ALL_TAGS.
 *
 * @param tags - Raw inferred tags (may include API, CLI, etc.)
 * @returns Tags filtered to valid Tag enum members
 */
function filterToValidTags(tags: string[]): string[] {
  return tags.filter((t) => VALID_TAGS_SET.has(t));
}

/**
 * Read the names of configured MCP servers from .claude/settings.json.
 *
 * @param projectDir - Project root
 * @returns Array of server names, or empty array if file not found or unreadable
 */
function readConfiguredMcpServerNames(projectDir: string): string[] {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return [];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = settings["mcpServers"] as
      | Record<string, unknown>
      | undefined;
    return mcpServers ? Object.keys(mcpServers) : [];
  } catch {
    return [];
  }
}

/**
 * Apply a project_type_override to replace inferred tags with the user-specified type.
 * Merges with existing tags, replacing any conflicting specific-type tags.
 *
 * @param existingTags - Previously inferred tags
 * @param override - User-supplied override string, e.g. "docs", "cli+library"
 * @returns Revised tag set
 */
function applyProjectTypeOverride(
  existingTags: readonly string[],
  override: string,
): string[] {
  const overrideMap: Readonly<Record<string, string[]>> = {
    docs: ["UNIVERSAL", "DOCS"],
    cli: ["UNIVERSAL", "CLI"],
    api: ["UNIVERSAL", "API"],
    library: ["UNIVERSAL", "LIBRARY"],
    "cli+library": ["UNIVERSAL", "CLI", "LIBRARY"],
    "cli+api": ["UNIVERSAL", "CLI", "API"],
    "api+library": ["UNIVERSAL", "API", "LIBRARY"],
  };

  const mapped = overrideMap[override.toLowerCase()];
  if (!mapped) {
    // Unknown override — return existing tags unchanged so nothing breaks
    return Array.from(existingTags);
  }
  return mapped;
}
