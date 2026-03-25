/**
 * setup_project tool handler — two-phase onboarding entry point.
 *
 * Phase 1 (no mvp/scope_complete/has_consumers): Analyzes the project or spec,
 * shows what was found, and returns three calibration questions.
 *
 * Phase 2 (all three answers provided): Derives cascade decisions from answers
 * and tags, writes forgecraft.yaml, creates docs/PRD.md, and scaffolds the project.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Tag, ToolResult } from "../shared/types.js";
import { ALL_TAGS } from "../shared/types.js";
import { scaffoldProjectHandler, scaffoldHooks } from "./scaffold.js";
import { configureMcpHandler } from "./configure-mcp.js";
import { createLogger } from "../shared/logger/index.js";
import { parseSpec, inferSensitiveData } from "./spec-parser.js";
import { buildProjectContext } from "./setup-context.js";
import type { ProjectContext } from "./setup-context.js";
export { detectProjectMode } from "./setup-detector.js";
import { buildPhase1Response } from "./setup-phase1.js";
import {
  writeForgeYaml,
  setExperimentGroupIfMissing,
  writePrd,
  writeUseCases,
  initGitRepo,
} from "./setup-artifact-writers.js";
import type { AiExtractedFields } from "./setup-artifact-writers.js";
import { deriveCascadeDecisions, buildPhase2Response } from "./setup-phase2.js";
import {
  writeCntFiles,
  writeCoreMd,
  writeAdrIndex,
  writeGatesIndex,
} from "./setup-cnt.js";

const logger = createLogger("tools/setup-project");

// ── Types ─────────────────────────────────────────────────────────────

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
  /**
   * Phase 2: the spec file the AI identified as the primary project spec.
   * Provide this when Phase 1 listed multiple candidates.
   */
  readonly spec_file_confirmed?: string;
  /**
   * Phase 2: AI-extracted problem statement from the spec.
   * The AI should read the spec and summarise the core problem in 1-3 sentences.
   */
  readonly problem_statement?: string;
  /**
   * Phase 2: AI-extracted primary users / actors from the spec.
   * Comma-separated list of the main user roles or personas.
   */
  readonly primary_users?: string;
  /**
   * Phase 2: AI-extracted success criteria from the spec.
   * Comma-separated list of measurable outcomes or goals.
   */
  readonly success_criteria?: string;
}

/** Valid ALL_TAGS values as a Set for fast membership testing. */
const VALID_TAGS_SET = new Set<string>(ALL_TAGS);

// ── Handler ───────────────────────────────────────────────────────────

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

// ── Phase 2 Orchestration ─────────────────────────────────────────────

/**
 * Execute phase 2: derive decisions, write artifacts, call scaffold.
 *
 * @param args - Setup args with all three phase-2 answers guaranteed defined
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
  const { projectDir, projectName } = context;

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
    context.isBrownfield,
  );
  setExperimentGroupIfMissing(projectDir);

  const aiFields: AiExtractedFields = {
    problemStatement: args.problem_statement,
    primaryUsers: args.primary_users,
    successCriteria: args.success_criteria,
  };
  const hasSpec = !!context.specContent || !!aiFields.problemStatement;
  const prdWritten = hasSpec
    ? writePrd(projectDir, projectName, aiFields, context.specContent)
    : false;
  const useCasesWritten = hasSpec
    ? writeUseCases(projectDir, projectName, aiFields, context.specContent)
    : false;

  const validTagsForHooks = (
    forgeCraftTags.length > 0 ? forgeCraftTags : ["UNIVERSAL"]
  ) as Tag[];
  const scaffoldResult = await scaffoldProjectHandler({
    tags: validTagsForHooks,
    project_dir: projectDir,
    project_name: projectName,
    language: "typescript",
    dry_run: false,
    force: false,
    sentinel: true,
    output_targets: ["claude"],
  });
  const scaffoldText = scaffoldResult.content[0]?.text ?? "";

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

  const gitInitStatus = initGitRepo(projectDir);

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
    indexMdWritten: writeCntFiles(projectDir, projectName, effectiveTags),
    coreMdWritten: writeCoreMd(
      projectDir,
      projectName,
      effectiveTags,
      context.specContent,
    ),
    adrIndexWritten: writeAdrIndex(projectDir),
    gatesIndexWritten: writeGatesIndex(projectDir),
    gitInitStatus,
  });

  return { content: [{ type: "text", text }] };
}

// ── Utilities ─────────────────────────────────────────────────────────

/**
 * Filter inferred tag strings to only valid ALL_TAGS values.
 *
 * @param tags - Raw inferred tags (may include API, CLI, etc.)
 * @returns Tags filtered to valid Tag enum members
 */
export function filterToValidTags(tags: string[]): string[] {
  return tags.filter((t) => VALID_TAGS_SET.has(t));
}

/**
 * Read the names of configured MCP servers from .claude/settings.json.
 *
 * @param projectDir - Project root
 * @returns Array of server names, or empty array if file not found or unreadable
 */
export function readConfiguredMcpServerNames(projectDir: string): string[] {
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
 *
 * @param existingTags - Previously inferred tags
 * @param override - User-supplied override string, e.g. "docs", "cli+library"
 * @returns Revised tag set
 */
export function applyProjectTypeOverride(
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
  if (!mapped) return Array.from(existingTags);
  return mapped;
}
