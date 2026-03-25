/**
 * scaffold_project tool handler.
 *
 * Generates full project structure from classified tags.
 * Skips existing files by default to avoid overwriting user content.
 */

import { z } from "zod";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_TAGS,
  ALL_OUTPUT_TARGETS,
} from "../shared/types.js";
import type { Tag, ScaffoldResult } from "../shared/types.js";
import {
  loadAllTemplatesWithExtras,
  loadUserOverrides,
} from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import {
  renderStatusMd,
  renderPrdSkeleton,
  renderTechSpecSkeleton,
} from "../registry/renderer.js";
import { writeFileIfMissing, checkGitSafety } from "../shared/filesystem.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";
import { buildPlaceholderContext } from "../shared/template-resolver.js";
import {
  buildDryRunPlan,
  writeCascadeDecisions,
  renderCascadeDecisionsSection,
} from "./scaffold-cascade.js";
import { writeScaffoldFiles } from "./scaffold-writer.js";
import { renderGsDisclosure, renderInstallStep } from "./scaffold-templates.js";

export { PROJECT_SPECIFIC_TEMPLATE, EXCEPTIONS_TEMPLATE, PROJECT_GATES_TEMPLATE } from "./scaffold-templates.js";
export { SMOKE_TESTS_README, LOAD_TESTS_README } from "./scaffold-templates.js";
export { renderAdrsReadme, renderGitignore, renderInstallStep, renderGsDisclosure, renderSmokeTestsReadme, renderLoadTestsReadme } from "./scaffold-templates.js";
export { USE_CASES_STUB, buildC4ContextStub, writeSpecStub } from "./scaffold-spec-stubs.js";
export { STEP_ARTIFACT_DISPLAY, writeCascadeDecisions, renderCascadeDecisionsSection, buildDryRunPlan } from "./scaffold-cascade.js";
export { writeScaffoldFiles } from "./scaffold-writer.js";

const logger = createLogger("tools/scaffold");

// ── Schema ───────────────────────────────────────────────────────────

export const scaffoldProjectSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Project classification tags. UNIVERSAL is always included."),
  project_dir: z.string().describe("Absolute path to the project root directory."),
  project_name: z.string().describe("Human-readable project name."),
  language: z
    .enum(["typescript", "python"])
    .default("typescript")
    .describe("Primary programming language."),
  dry_run: z
    .boolean()
    .default(false)
    .describe("If true, return the plan without writing files."),
  force: z
    .boolean()
    .default(false)
    .describe("If true, overwrite existing files. Default: skip files that already exist."),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .default(["claude"])
    .describe("AI assistant targets to generate instruction files for."),
  sentinel: z
    .boolean()
    .default(true)
    .describe("If true (default), generate a 50-line sentinel CLAUDE.md + .claude/standards/ domain files."),
});

// ── Hooks Scaffolder ─────────────────────────────────────────────────

/**
 * Scaffold hooks for a project given tags.
 * Called explicitly by setup_project to ensure hooks are always installed.
 *
 * @param projectDir - Absolute project root path
 * @param tags - Project classification tags
 * @returns Array of hook filenames written
 */
export async function scaffoldHooks(
  projectDir: string,
  tags: Tag[],
): Promise<string[]> {
  const normalizedTags: Tag[] = tags.includes("UNIVERSAL") ? tags : ["UNIVERSAL", ...tags];

  const userConfig = loadUserOverrides(projectDir);
  const templateSets = await loadAllTemplatesWithExtras(undefined, userConfig?.templateDirs);
  const composed = composeTemplates(normalizedTags, templateSets, { config: userConfig ?? undefined });

  const hooksDir = join(projectDir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const written: string[] = [];
  for (const hook of composed.hooks) {
    const hookPath = join(hooksDir, hook.filename);
    const result = writeFileIfMissing(hookPath, hook.script, false);
    if (result !== "skipped") {
      written.push(hook.filename);
      try { chmodSync(hookPath, 0o755); } catch { /* chmod may fail on Windows */ }
    }
  }
  return written;
}

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Handle the scaffold_project tool call.
 *
 * @param args - Validated scaffold args
 * @returns MCP-style tool result with text content
 */
export async function scaffoldProjectHandler(
  args: z.infer<typeof scaffoldProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  logger.info("Scaffolding project", { tags, projectDir: args.project_dir, dryRun: args.dry_run, force: args.force });

  const userConfig = loadUserOverrides(args.project_dir);
  const templateSets = await loadAllTemplatesWithExtras(undefined, userConfig?.templateDirs);
  const composed = composeTemplates(tags, templateSets, { config: userConfig ?? undefined });

  const context = detectProjectContext(args.project_dir, args.project_name, args.language, tags);
  const placeholderContext = buildPlaceholderContext(args.project_dir, undefined, tags.map(String));

  const statusMdContent = renderStatusMd(context);
  const prdContent = renderPrdSkeleton(context);
  const techSpecContent = renderTechSpecSkeleton(context);

  if (args.dry_run) {
    return { content: [{ type: "text", text: buildDryRunPlan(composed, tags) }] };
  }

  const gitWarning = checkGitSafety(args.project_dir);

  const { filesCreated, filesSkipped } = writeScaffoldFiles(
    {
      project_dir: args.project_dir,
      project_name: args.project_name,
      language: args.language,
      force: args.force,
      sentinel: args.sentinel,
      output_targets: args.output_targets,
    },
    composed,
    context,
    statusMdContent,
    prdContent,
    techSpecContent,
    placeholderContext,
    userConfig,
  );

  const cascadeDecisions = writeCascadeDecisions(args.project_dir, tags, args.project_name, userConfig);

  const result: ScaffoldResult = {
    filesCreated,
    mcpServersConfigured: [],
    nextSteps: [
      "Review and adjust instruction files for your project specifics",
      "Fill in docs/PRD.md with your actual requirements",
      "Fill in docs/TechSpec.md with your architecture decisions",
      renderInstallStep(args.language),
      "Start implementing your first feature module",
    ],
    restartRequired: true,
  };

  let text = `# Project Scaffolded Successfully\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Files Created:** ${filesCreated.length}\n\n`;

  if (gitWarning) text += `\n> ⚠️ **Git Warning:** ${gitWarning}\n\n`;

  text += `## Created Files\n`;
  text += filesCreated.map((f) => `- \`${f}\``).join("\n");

  if (filesSkipped.length > 0) {
    text += `\n\n## Skipped (already exist)\n`;
    text += filesSkipped.map((f) => `- \`${f}\``).join("\n");
    text += `\n\n_Use \`force=true\` to overwrite existing files._`;
  }

  text += `\n\n## Next Steps\n`;
  text += result.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  text += renderGsDisclosure();
  text += renderCascadeDecisionsSection(cascadeDecisions);
  text += `\n\n⚠️ **Restart may be required** to pick up instruction files and hooks.`;

  return { content: [{ type: "text", text }] };
}
