/**
 * setup_project tool handler — two-phase onboarding entry point.
 *
 * Phase 1 (no mvp/scope_complete/has_consumers): Analyzes the project or spec,
 * shows what was found, and returns three calibration questions.
 *
 * Phase 2 (all three answers provided): Derives cascade decisions from answers
 * and tags, writes forgecraft.yaml, creates docs/PRD.md, and scaffolds the project.
 *
 * Decomposed: detection → setup-detector.ts, context → setup-context.ts,
 * phase1 response → setup-phase1.ts, phase2 response → setup-phase2.ts,
 * artifact writers → setup-artifact-writers.ts, CNT writers → setup-cnt.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Tag } from "../shared/types.js";
import { ALL_TAGS } from "../shared/types.js";
import { scaffoldProjectHandler, scaffoldHooks } from "./scaffold.js";
import { configureMcpHandler } from "./configure-mcp.js";
import { createLogger } from "../shared/logger/index.js";
import { parseSpec, inferSensitiveData } from "./spec-parser.js";
import { buildProjectContext } from "./setup-context.js";
import type { ProjectContext } from "./setup-context.js";
import { buildPhase1Response } from "./setup-phase1.js";
import { deriveCascadeDecisions, buildPhase2Response } from "./setup-phase2.js";
import type { Phase2ResponseParams } from "./setup-phase2.js";
import {
  writeForgeYaml,
  setExperimentGroupIfMissing,
  writePrd,
  writeUseCases,
  initGitRepo,
} from "./setup-artifact-writers.js";
import type { AiExtractedFields } from "./setup-artifact-writers.js";
import { writeCntFiles, writeCoreMd, writeAdrIndex, writeGatesIndex } from "./setup-cnt.js";

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
  /** Phase 2: override the inferred project type when ambiguities were reported in phase 1. */
  readonly project_type_override?: string;
  /** Phase 2: the spec file the AI identified as the primary project spec. */
  readonly spec_file_confirmed?: string;
  /** Phase 2: AI-extracted problem statement from the spec. */
  readonly problem_statement?: string;
  /** Phase 2: AI-extracted primary users / actors from the spec. */
  readonly primary_users?: string;
  /** Phase 2: AI-extracted success criteria from the spec. */
  readonly success_criteria?: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

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
export async function setupProjectHandler(args: SetupProjectArgs): Promise<ToolResult> {
  const isPhase2 =
    args.mvp !== undefined &&
    args.scope_complete !== undefined &&
    args.has_consumers !== undefined;

  logger.info("setup_project", { phase: isPhase2 ? 2 : 1, projectDir: args.project_dir });

  const context = await buildProjectContext(args);

  if (!isPhase2) return buildPhase1Response(context);

  return executePhase2(
    { ...args, mvp: args.mvp!, scope_complete: args.scope_complete!, has_consumers: args.has_consumers! },
    context,
  );
}

// ── Phase 2 Execution ─────────────────────────────────────────────────

async function executePhase2(
  args: SetupProjectArgs & { mvp: boolean; scope_complete: boolean; has_consumers: boolean },
  context: ProjectContext,
): Promise<ToolResult> {
  const { projectDir, projectName } = context;

  const effectiveTags = args.project_type_override
    ? applyProjectTypeOverride(context.inferredTags, args.project_type_override)
    : context.inferredTags;

  const decisions = deriveCascadeDecisions(effectiveTags, projectName, args.mvp, args.scope_complete, args.has_consumers);
  const forgeCraftTags = filterToValidTags(effectiveTags);

  const specSummaryForSensitive = context.specContent ? parseSpec(context.specContent, context.projectName) : null;
  const isSensitive = specSummaryForSensitive
    ? inferSensitiveData(specSummaryForSensitive, effectiveTags)
    : effectiveTags.some((t) => ["FINTECH", "WEB3", "HEALTHCARE", "HIPAA", "SOC2"].includes(t));

  const yamlWritten = writeForgeYaml(projectDir, projectName, forgeCraftTags, decisions, isSensitive, context.isBrownfield);
  setExperimentGroupIfMissing(projectDir);

  const aiFields: AiExtractedFields = {
    problemStatement: args.problem_statement,
    primaryUsers: args.primary_users,
    successCriteria: args.success_criteria,
  };
  const hasSpec = !!context.specContent || !!aiFields.problemStatement;
  const prdWritten = hasSpec ? writePrd(projectDir, projectName, aiFields, context.specContent) : false;
  const useCasesWritten = hasSpec ? writeUseCases(projectDir, projectName, aiFields, context.specContent) : false;

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

  const validTagsForHooks = (forgeCraftTags.length > 0 ? forgeCraftTags : ["UNIVERSAL"]) as Tag[];
  await scaffoldHooks(projectDir, validTagsForHooks);

  let mcpServerNames: string[] = [];
  try {
    await configureMcpHandler({ tags: validTagsForHooks, project_dir: projectDir, auto_approve_tools: true, include_remote: false });
    mcpServerNames = readConfiguredMcpServerNames(projectDir);
  } catch (error) {
    logger.warn("configure_mcp failed during setup", { error });
  }

  const gitInitStatus = initGitRepo(projectDir);

  const params: Phase2ResponseParams = {
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
    coreMdWritten: writeCoreMd(projectDir, projectName, effectiveTags, context.specContent),
    adrIndexWritten: writeAdrIndex(projectDir),
    gatesIndexWritten: writeGatesIndex(projectDir),
    gitInitStatus,
  };

  return { content: [{ type: "text", text: buildPhase2Response(params) }] };
}

// ── Utilities ─────────────────────────────────────────────────────────

function filterToValidTags(tags: string[]): string[] {
  return tags.filter((t) => VALID_TAGS_SET.has(t));
}

function readConfiguredMcpServerNames(projectDir: string): string[] {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return [];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    const mcpServers = settings["mcpServers"] as Record<string, unknown> | undefined;
    return mcpServers ? Object.keys(mcpServers) : [];
  } catch {
    return [];
  }
}

const PROJECT_TYPE_OVERRIDE_MAP: Readonly<Record<string, string[]>> = {
  docs: ["UNIVERSAL", "DOCS"],
  cli: ["UNIVERSAL", "CLI"],
  api: ["UNIVERSAL", "API"],
  library: ["UNIVERSAL", "LIBRARY"],
  "cli+library": ["UNIVERSAL", "CLI", "LIBRARY"],
  "cli+api": ["UNIVERSAL", "CLI", "API"],
  "api+library": ["UNIVERSAL", "API", "LIBRARY"],
};

function applyProjectTypeOverride(existingTags: readonly string[], override: string): string[] {
  const mapped = PROJECT_TYPE_OVERRIDE_MAP[override.toLowerCase()];
  return mapped ?? Array.from(existingTags);
}
