/**
 * scaffold_project tool handler.
 *
 * Generates full project structure from classified tags.
 * Skips existing files by default to avoid overwriting user content.
 */

import { z } from "zod";
import { mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  ALL_TAGS,
  ALL_OUTPUT_TARGETS,
  OUTPUT_TARGET_CONFIGS,
  DEFAULT_OUTPUT_TARGET,
} from "../shared/types.js";
import type { Tag, ScaffoldResult, OutputTarget } from "../shared/types.js";
import {
  loadAllTemplatesWithExtras,
  loadUserOverrides,
} from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import {
  renderInstructionFile,
  renderSkill,
  renderStatusMd,
  renderPrdSkeleton,
  renderTechSpecSkeleton,
} from "../registry/renderer.js";
import { renderSentinelTree } from "../registry/sentinel-renderer.js";
import { writeFileIfMissing, checkGitSafety } from "../shared/filesystem.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/scaffold");

/** Template for the user-owned project-specific rules file. Never overwritten. */
const PROJECT_SPECIFIC_TEMPLATE = `# Project-Specific Rules
<!-- This file is owned by YOU. ForgeCraft will never overwrite it. -->
<!-- Add project-specific rules, framework choices, conventions, and corrections here. -->
<!-- The sentinel CLAUDE.md links here so any AI reading your project can find it. -->

## Framework & Stack Choices
<!-- e.g. We use Prisma for ORM. Deploy target is Railway. Python 3.11+. -->

## Custom Corrections Log
<!-- Log AI corrections so the pattern isn't repeated. -->
<!-- Format: - YYYY-MM-DD: [description of correction] -->

## Project-Specific Gates
<!-- Add quality rules specific to this project that don't belong in universal standards. -->
`;

// ── Schema ───────────────────────────────────────────────────────────

export const scaffoldProjectSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Project classification tags. UNIVERSAL is always included."),
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
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
    .describe(
      "If true, overwrite existing files. Default: skip files that already exist.",
    ),
  output_targets: z
    .array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]]))
    .default(["claude"])
    .describe(
      "AI assistant targets to generate instruction files for. Options: claude, cursor, copilot, windsurf, cline, aider.",
    ),
  sentinel: z
    .boolean()
    .default(true)
    .describe(
      "If true (default), generate a 50-line sentinel CLAUDE.md + .claude/standards/ domain files instead of one large file. Set to false to generate the traditional monolithic CLAUDE.md.",
    ),
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

  const context = detectProjectContext(
    args.project_dir,
    args.project_name,
    args.language,
    tags,
  );

  // Render content
  const outputTargets = (args.output_targets ?? [
    DEFAULT_OUTPUT_TARGET,
  ]) as OutputTarget[];
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
  function trackWrite(
    relativePath: string,
    filePath: string,
    content: string,
  ): void {
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

    // For claude target: use sentinel tree (default) or monolithic file
    if (target === "claude" && args.sentinel !== false) {
      const sentinelFiles = renderSentinelTree(
        composed.instructionBlocks,
        context,
      );
      for (const file of sentinelFiles) {
        const fullPath = join(args.project_dir, file.relativePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        trackWrite(file.relativePath, fullPath, file.content);
      }
      // Scaffold the user-owned project-specific.md (never overwritten after first creation)
      const projectSpecificPath = join(
        args.project_dir,
        ".claude",
        "standards",
        "project-specific.md",
      );
      trackWrite(
        ".claude/standards/project-specific.md",
        projectSpecificPath,
        PROJECT_SPECIFIC_TEMPLATE,
      );
    } else {
      const content = renderInstructionFile(
        composed.instructionBlocks,
        context,
        target,
        { compact: userConfig?.compact },
      );
      const outputPath = targetConfig.directory
        ? join(args.project_dir, targetConfig.directory, targetConfig.filename)
        : join(args.project_dir, targetConfig.filename);
      mkdirSync(dirname(outputPath), { recursive: true });
      const relativePath = targetConfig.directory
        ? `${targetConfig.directory}/${targetConfig.filename}`
        : targetConfig.filename;
      trackWrite(relativePath, outputPath, content);
    }
  }

  // Write Status.md
  trackWrite("Status.md", join(args.project_dir, "Status.md"), statusMdContent);

  // Write docs
  mkdirSync(join(args.project_dir, "docs"), { recursive: true });
  trackWrite(
    "docs/PRD.md",
    join(args.project_dir, "docs", "PRD.md"),
    prdContent,
  );
  trackWrite(
    "docs/TechSpec.md",
    join(args.project_dir, "docs", "TechSpec.md"),
    techSpecContent,
  );

  // Create docs/adrs/ with README so the directory is tracked by git and
  // the Auditable scorer finds it immediately (ADRs score 2/2 once populated).
  const adrsDir = join(args.project_dir, "docs", "adrs");
  mkdirSync(adrsDir, { recursive: true });
  trackWrite(
    "docs/adrs/README.md",
    join(adrsDir, "README.md"),
    renderAdrsReadme(context.projectName),
  );

  // Write .env.example — universal signals only; runtime-specific vars are added by the AI assistant
  trackWrite(
    ".env.example",
    join(args.project_dir, ".env.example"),
    "# Environment configuration\n# Copy to .env and fill in values\nLOG_LEVEL=info\n",
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

  // Write .gitignore — content is language-aware; tool/framework choice is left to the team
  trackWrite(
    ".gitignore",
    join(args.project_dir, ".gitignore"),
    renderGitignore(args.language),
  );

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
  text += renderGsDisclosure();
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
  text += dirs
    .map((d) => `- \`${d.path}/\`${d.description ? ` — ${d.description}` : ""}`)
    .join("\n");

  text += `\n\n## Files to Generate\n`;
  text += `- CLAUDE.md (~50-line sentinel)\n`;
  text += `- .claude/standards/*.md (domain files — ForgeCraft-managed)\n`;
  text += `- .claude/standards/project-specific.md (YOUR file — ForgeCraft never overwrites)\n`;
  text += `- Status.md\n`;
  text += `- docs/PRD.md (skeleton)\n`;
  text += `- docs/TechSpec.md (skeleton with ${composed.nfrBlocks.length} NFR sections)\n`;
  text += `- docs/adrs/README.md (ADR directory bootstrap — Auditable signal)\n`;
  text += `- .env.example\n`;
  text += `- .gitignore\n`;

  text += `\n## Hooks to Install (${composed.hooks.length})\n`;
  text += composed.hooks
    .map((h) => `- \`${h.filename}\` (${h.trigger}) — ${h.description}`)
    .join("\n");

  if (composed.skills.length > 0) {
    text += `\n\n## Skills to Install (${composed.skills.length})\n`;
    text += composed.skills
      .map(
        (s) =>
          `- \`/project:${s.filename.replace(".md", "")}\` — ${s.description}`,
      )
      .join("\n");
  }

  text += `\n\n_Run again with dry_run=false to write files._`;
  return text;
}

/**
 * Render the bootstrap README for docs/adrs/.
 * Its presence tells the Auditable scorer that the ADR convention is adopted.
 * The first real ADR should supersede this file's instructions.
 */
function renderAdrsReadme(projectName: string): string {
  return [
    `# Architecture Decision Records — ${projectName}`,
    ``,
    `This directory contains Architecture Decision Records (ADRs) for ${projectName}.`,
    ``,
    `## Format`,
    ``,
    `Each ADR is a numbered Markdown file: \`NNNN-short-title.md\``,
    ``,
    `Use \`npx forgecraft-mcp generate_adr\` (or the \`generate_adr\` MCP action) to create a new ADR`,
    `with automatic sequencing and the standard MADR template.`,
    ``,
    `## Status values`,
    ``,
    `- **Proposed** — under discussion`,
    `- **Accepted** — decision taken, implementation may be pending`,
    `- **Superseded by ADR-NNNN** — replaced by a later decision`,
    `- **Deprecated** — no longer relevant`,
    ``,
    `## Why ADRs?`,
    ``,
    `Every non-obvious architectural choice must be recorded with context, alternatives`,
    `considered, and consequences accepted. Without this record, the team re-litigates`,
    `the same decisions and AI coding assistants cannot reason about past choices.`,
    ``,
    `---`,
    `_This README was generated by ForgeCraft scaffold. Replace it with your first ADR._`,
  ].join("\n");
}

/**
 * Language-aware .gitignore content.
 * Tool and framework choices (bundler output dirs, virtual envs, etc.) are left to the team;
 * only universal and language-level patterns are included.
 */
function renderGitignore(language: "typescript" | "python"): string {
  const universal = [".env", ".env.*", "coverage/", "*.log", ".DS_Store"];
  const byLanguage: Record<string, string[]> = {
    typescript: ["node_modules/", "dist/", "build/", ".tsbuildinfo"],
    python: [
      "__pycache__/",
      "*.pyc",
      ".venv/",
      "venv/",
      "dist/",
      "*.egg-info/",
      ".mypy_cache/",
    ],
  };
  return [...(byLanguage[language] ?? []), ...universal].join("\n") + "\n";
}

/**
 * Language-aware install step for next-steps guidance.
 * Intentionally vague — the AI assistant will choose the actual package manager.
 */
function renderInstallStep(language: "typescript" | "python"): string {
  const hints: Record<string, string> = {
    typescript: "Install dependencies (npm install / pnpm install / yarn)",
    python:
      "Create a virtual environment and install dependencies (pip install -e . / poetry install / uv sync)",
  };
  return hints[language] ?? "Install project dependencies";
}

/**
 * GS-model disclosure appended to every scaffold summary.
 *
 * Explains what was NOT generated and WHY — referencing the Generative Specification
 * white paper decisions so the team understands the design intent, not just the output.
 */
function renderGsDisclosure(): string {
  return [
    ``,
    ``,
    `## GS Model Disclosure`,
    ``,
    `ForgeCraft scaffolds to the **Generative Specification** model (7 properties, max 14 pts).`,
    `The following artifacts were intentionally NOT generated — here is the reasoning:`,
    ``,
    `| Artifact | Why not generated | GS property | How to satisfy it |`,
    `|---|---|---|---|`,
    `| commitlint / lefthook / husky | **Auditable(2/2)** requires commit discipline, not a specific tool. The GS model is tool-agnostic; enforce via any hook framework or CI rule. | Auditable | Add your preferred commit-lint config; \`verify\` will detect it automatically. |`,
    `| Linter config (.eslintrc, .pylintrc…) | **Defended(2/2)** requires a pre-commit hook + lint config, but which linter is a team/language decision the AI assistant should make from your spec. | Defended | Any recognized lint config file satisfies this signal. |`,
    `| CI pipeline file | **Executable(2/2)** is highest with CI evidence, but the pipeline syntax is platform-specific. The AI assistant generates this from your tag set. | Executable | Run \`scaffold\` then ask your AI to generate a CI workflow for your platform. |`,
    `| docs/PRD.md content | The skeleton is scaffolded; actual requirements are your inputs. | Self-Describing | Fill in PRD.md — it is referenced by the Self-Describing scorer. |`,
    ``,
    `> **GS principle:** scaffold outputs are language- and tool-agnostic starting points.`,
    `> The AI coding assistant fills in the specifics from your spec and tag context.`,
    `> Run \`node forgecraft-mcp/dist/index.js verify .\` at any time to see your GS score.`,
  ].join("\n");
}
