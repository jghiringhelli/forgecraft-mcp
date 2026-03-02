/**
 * scaffold_project tool handler.
 *
 * Generates full project structure from classified tags.
 * Skips existing files by default to avoid overwriting user content.
 */

import { z } from "zod";
import { mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { ALL_TAGS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, ScaffoldResult, OutputTarget } from "../shared/types.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import {
  renderInstructionFile,
  renderSkill,
  renderStatusMd,
  renderPrdSkeleton,
  renderTechSpecSkeleton,
} from "../registry/renderer.js";
import { writeFileIfMissing, checkGitSafety } from "../shared/filesystem.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/scaffold");

// ── Schema ───────────────────────────────────────────────────────────

export const scaffoldProjectSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Project classification tags. UNIVERSAL is always included."),
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
  project_name: z
    .string()
    .describe("Human-readable project name."),
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
    .describe("AI assistant targets to generate instruction files for. Options: claude, cursor, copilot, windsurf, cline, aider."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function scaffoldProjectHandler(
  args: z.infer<typeof scaffoldProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  logger.info("Scaffolding project", {
    tags,
    projectDir: args.project_dir,
    dryRun: args.dry_run,
    force: args.force,
  });

  // Load and compose templates (respects forgecraft.yaml config if present)
  const userConfig = loadUserOverrides(args.project_dir);
  const templateSets = await loadAllTemplatesWithExtras(
    undefined,
    userConfig?.templateDirs,
  );
  const composed = composeTemplates(tags, templateSets, {
    config: userConfig ?? undefined,
  });

  const context = detectProjectContext(args.project_dir, args.project_name, args.language, tags);

  // Render content
  const outputTargets = (args.output_targets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];
  const statusMdContent = renderStatusMd(context);
  const prdContent = renderPrdSkeleton(context);
  const techSpecContent = renderTechSpecSkeleton(context);

  if (args.dry_run) {
    const plan = buildDryRunPlan(composed, tags);
    return { content: [{ type: "text", text: plan }] };
  }

  // Check git safety
  const gitWarning = checkGitSafety(args.project_dir);

  const filesCreated: string[] = [];
  const filesSkipped: string[] = [];

  /** Track a safe write result. */
  function trackWrite(relativePath: string, filePath: string, content: string): void {
    const result = writeFileIfMissing(filePath, content, args.force);
    if (result === "skipped") {
      filesSkipped.push(relativePath);
    } else {
      filesCreated.push(relativePath);
    }
  }

  // Create directories from structure entries
  for (const entry of composed.structureEntries) {
    const fullPath = join(args.project_dir, entry.path);
    if (entry.type === "directory") {
      mkdirSync(fullPath, { recursive: true });
      filesCreated.push(`${entry.path}/`);
    }
  }

  // Write instruction files for all output targets
  for (const target of outputTargets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];
    const content = renderInstructionFile(composed.instructionBlocks, context, target);
    const outputPath = targetConfig.directory
      ? join(args.project_dir, targetConfig.directory, targetConfig.filename)
      : join(args.project_dir, targetConfig.filename);
    mkdirSync(dirname(outputPath), { recursive: true });
    const relativePath = targetConfig.directory ? `${targetConfig.directory}/${targetConfig.filename}` : targetConfig.filename;
    trackWrite(relativePath, outputPath, content);
  }

  // Write Status.md
  trackWrite("Status.md", join(args.project_dir, "Status.md"), statusMdContent);

  // Write docs
  mkdirSync(join(args.project_dir, "docs"), { recursive: true });
  trackWrite("docs/PRD.md", join(args.project_dir, "docs", "PRD.md"), prdContent);
  trackWrite("docs/TechSpec.md", join(args.project_dir, "docs", "TechSpec.md"), techSpecContent);

  // Write .env.example
  trackWrite(
    ".env.example",
    join(args.project_dir, ".env.example"),
    "NODE_ENV=development\nLOG_LEVEL=info\n",
  );

  // Write hooks
  const hooksDir = join(args.project_dir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  for (const hook of composed.hooks) {
    const hookPath = join(hooksDir, hook.filename);
    trackWrite(`.claude/hooks/${hook.filename}`, hookPath, hook.script);
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      // chmod may fail on Windows, that's OK
    }
  }

  // Write skills (Claude Code custom commands)
  if (composed.skills.length > 0) {
    const commandsDir = join(args.project_dir, ".claude", "commands");
    mkdirSync(commandsDir, { recursive: true });

    for (const skill of composed.skills) {
      const skillContent = renderSkill(skill.content, context);
      const skillPath = join(commandsDir, skill.filename);
      trackWrite(`.claude/commands/${skill.filename}`, skillPath, skillContent);
    }
  }

  // Write .gitignore
  trackWrite(
    ".gitignore",
    join(args.project_dir, ".gitignore"),
    "node_modules/\ndist/\n.env\ncoverage/\n*.log\n",
  );

  const result: ScaffoldResult = {
    filesCreated,
    mcpServersConfigured: [],
    nextSteps: [
      "Review and adjust instruction files for your project specifics",
      "Fill in docs/PRD.md with your actual requirements",
      "Fill in docs/TechSpec.md with your architecture decisions",
      "Run `npm install` or equivalent to install dependencies",
      "Start implementing your first feature module",
    ],
    restartRequired: true,
  };

  let text = `# Project Scaffolded Successfully\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Files Created:** ${filesCreated.length}\n\n`;

  if (gitWarning) {
    text += `\n> ⚠️ **Git Warning:** ${gitWarning}\n\n`;
  }

  text += `## Created Files\n`;
  text += filesCreated.map((f) => `- \`${f}\``).join("\n");

  if (filesSkipped.length > 0) {
    text += `\n\n## Skipped (already exist)\n`;
    text += filesSkipped.map((f) => `- \`${f}\``).join("\n");
    text += `\n\n_Use \`force=true\` to overwrite existing files._`;
  }

  text += `\n\n## Next Steps\n`;
  text += result.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  text += `\n\n⚠️ **Restart may be required** to pick up instruction files and hooks.`;

  return { content: [{ type: "text", text }] };
}

/**
 * Build a dry-run plan without writing files.
 */
function buildDryRunPlan(
  composed: ReturnType<typeof composeTemplates>,
  tags: Tag[],
): string {
  let text = `# Scaffold Plan (Dry Run)\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n\n`;

  text += `## Directories to Create\n`;
  const dirs = composed.structureEntries.filter((e) => e.type === "directory");
  text += dirs.map((d) => `- \`${d.path}/\`${d.description ? ` — ${d.description}` : ""}`).join("\n");

  text += `\n\n## Files to Generate\n`;
  text += `- CLAUDE.md (${composed.claudeMdBlocks.length} blocks)\n`;
  text += `- Status.md\n`;
  text += `- docs/PRD.md (skeleton)\n`;
  text += `- docs/TechSpec.md (skeleton with ${composed.nfrBlocks.length} NFR sections)\n`;
  text += `- .env.example\n`;
  text += `- .gitignore\n`;

  text += `\n## Hooks to Install (${composed.hooks.length})\n`;
  text += composed.hooks
    .map((h) => `- \`${h.filename}\` (${h.trigger}) — ${h.description}`)
    .join("\n");

  if (composed.skills.length > 0) {
    text += `\n\n## Skills to Install (${composed.skills.length})\n`;
    text += composed.skills
      .map((s) => `- \`/project:${s.filename.replace(".md", "")}\` — ${s.description}`)
      .join("\n");
  }

  text += `\n\n_Run again with dry_run=false to write files._`;
  return text;
}
