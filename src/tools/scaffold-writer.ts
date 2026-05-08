/**
 * scaffold-writer: File-writing logic for scaffold_project.
 *
 * Encapsulates all file system writes for the scaffold operation.
 */

import { mkdirSync, chmodSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ForgeCraftConfig, OutputTarget } from "../shared/types.js";
import { OUTPUT_TARGET_CONFIGS } from "../shared/types.js";
import type { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile, renderSkill } from "../registry/renderer.js";
import type { RenderContext } from "../registry/renderer.js";
import { renderSentinelTree } from "../registry/sentinel-renderer.js";
import { writeFileIfMissing } from "../shared/filesystem.js";
import { ensureGateDirs } from "../shared/project-gates.js";
import { resolveTemplatePlaceholders } from "../shared/template-resolver.js";
import type { PlaceholderContext } from "../shared/template-resolver.js";
import {
  PROJECT_SPECIFIC_TEMPLATE,
  EXCEPTIONS_TEMPLATE,
  PROJECT_GATES_TEMPLATE,
  renderAdrsReadme,
  renderGitignore,
  renderSmokeTestsReadme,
  renderLoadTestsReadme,
} from "./scaffold-templates.js";
import {
  buildC4ContextStub,
  buildC4ContainerStub,
  buildSequenceDiagramStub,
  buildStateMachineDiagramStub,
  buildFlowDiagramStub,
  USE_CASES_STUB,
  writeSpecStub,
} from "./scaffold-spec-stubs.js";

export interface ScaffoldWriteInput {
  readonly project_dir: string;
  readonly project_name: string;
  readonly language: "typescript" | "python";
  readonly force: boolean;
  readonly sentinel: boolean;
  readonly output_targets: string[];
}

export interface ScaffoldWriteResult {
  readonly filesCreated: string[];
  readonly filesSkipped: string[];
}

/**
 * Write all scaffold files for a project.
 *
 * @param input - Scaffold write parameters
 * @param composed - Composed template result
 * @param context - Project render context
 * @param statusMdContent - Rendered Status.md content
 * @param prdContent - Rendered PRD skeleton content
 * @param techSpecContent - Rendered TechSpec skeleton content
 * @param placeholderContext - Placeholder resolution context
 * @param userConfig - Loaded user ForgeCraft config or null
 * @returns Lists of created and skipped files
 */
export function writeScaffoldFiles(
  input: ScaffoldWriteInput,
  composed: ReturnType<typeof composeTemplates>,
  context: RenderContext,
  statusMdContent: string,
  prdContent: string,
  techSpecContent: string,
  placeholderContext: PlaceholderContext,
  userConfig: ForgeCraftConfig | null,
): ScaffoldWriteResult {
  const filesCreated: string[] = [];
  const filesSkipped: string[] = [];
  const outputTargets = input.output_targets as OutputTarget[];

  function trackWrite(
    relativePath: string,
    filePath: string,
    content: string,
  ): void {
    const result = writeFileIfMissing(filePath, content, input.force);
    if (result === "skipped") {
      filesSkipped.push(relativePath);
    } else {
      filesCreated.push(relativePath);
    }
  }

  for (const entry of composed.structureEntries) {
    const fullPath = join(input.project_dir, entry.path);
    if (entry.type === "directory") {
      mkdirSync(fullPath, { recursive: true });
      filesCreated.push(`${entry.path}/`);
    }
  }

  for (const target of outputTargets) {
    const targetConfig = OUTPUT_TARGET_CONFIGS[target];
    if (target === "claude" && input.sentinel !== false) {
      const sentinelFiles = renderSentinelTree(
        composed.instructionBlocks,
        context,
      );
      for (const file of sentinelFiles) {
        const fullPath = join(input.project_dir, file.relativePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        trackWrite(
          file.relativePath,
          fullPath,
          resolveTemplatePlaceholders(file.content, placeholderContext),
        );
      }
      const projectSpecificPath = join(
        input.project_dir,
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
        ? join(input.project_dir, targetConfig.directory, targetConfig.filename)
        : join(input.project_dir, targetConfig.filename);
      mkdirSync(dirname(outputPath), { recursive: true });
      const relativePath = targetConfig.directory
        ? `${targetConfig.directory}/${targetConfig.filename}`
        : targetConfig.filename;
      trackWrite(
        relativePath,
        outputPath,
        resolveTemplatePlaceholders(content, placeholderContext),
      );
    }
  }

  trackWrite(
    "Status.md",
    join(input.project_dir, "Status.md"),
    statusMdContent,
  );

  // Write .claude/state.md placeholder — index.md is written by writeCntFiles (setup-cnt.ts)
  const claudeDir = join(input.project_dir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  trackWrite(
    ".claude/state.md",
    join(claudeDir, "state.md"),
    "# Project State\n_Not yet run. Call close_cycle to generate._\n",
  );

  mkdirSync(join(input.project_dir, "docs"), { recursive: true });
  trackWrite(
    "docs/PRD.md",
    join(input.project_dir, "docs", "PRD.md"),
    prdContent,
  );
  trackWrite(
    "docs/TechSpec.md",
    join(input.project_dir, "docs", "TechSpec.md"),
    techSpecContent,
  );

  writeSpecStub(
    "docs/diagrams/c4-context.md",
    join(input.project_dir, "docs", "diagrams", "c4-context.md"),
    buildC4ContextStub(input.project_name),
    input.force,
    filesCreated,
    filesSkipped,
  );
  writeSpecStub(
    "docs/diagrams/c4-container.md",
    join(input.project_dir, "docs", "diagrams", "c4-container.md"),
    buildC4ContainerStub(input.project_name),
    input.force,
    filesCreated,
    filesSkipped,
  );
  writeSpecStub(
    "docs/diagrams/sequence-primary.md",
    join(input.project_dir, "docs", "diagrams", "sequence-primary.md"),
    buildSequenceDiagramStub("Primary Flow"),
    input.force,
    filesCreated,
    filesSkipped,
  );
  writeSpecStub(
    "docs/diagrams/state-primary.md",
    join(input.project_dir, "docs", "diagrams", "state-primary.md"),
    buildStateMachineDiagramStub("Primary Entity"),
    input.force,
    filesCreated,
    filesSkipped,
  );
  writeSpecStub(
    "docs/diagrams/flow-primary.md",
    join(input.project_dir, "docs", "diagrams", "flow-primary.md"),
    buildFlowDiagramStub("UC-01: Primary Use Case"),
    input.force,
    filesCreated,
    filesSkipped,
  );
  writeSpecStub(
    "docs/use-cases.md",
    join(input.project_dir, "docs", "use-cases.md"),
    USE_CASES_STUB,
    input.force,
    filesCreated,
    filesSkipped,
  );

  const adrsDir = join(input.project_dir, "docs", "adrs");
  mkdirSync(adrsDir, { recursive: true });
  trackWrite(
    "docs/adrs/README.md",
    join(adrsDir, "README.md"),
    renderAdrsReadme(input.project_name),
  );

  trackWrite(
    ".env.example",
    join(input.project_dir, ".env.example"),
    "# Environment configuration\n# Copy to .env and fill in values\nLOG_LEVEL=info\n",
  );

  const hooksDir = join(input.project_dir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of composed.hooks) {
    const hookPath = join(hooksDir, hook.filename);
    trackWrite(`.claude/hooks/${hook.filename}`, hookPath, hook.script);
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      /* chmod may fail on Windows */
    }
  }

  if (composed.skills.length > 0) {
    const commandsDir = join(input.project_dir, ".claude", "commands");
    mkdirSync(commandsDir, { recursive: true });
    for (const skill of composed.skills) {
      const skillContent = renderSkill(skill.content, context);
      const skillPath = join(commandsDir, skill.filename);
      trackWrite(`.claude/commands/${skill.filename}`, skillPath, skillContent);
    }
  }

  trackWrite(
    ".gitignore",
    join(input.project_dir, ".gitignore"),
    renderGitignore(input.language),
  );

  const forgecraftDir = join(input.project_dir, ".forgecraft");
  mkdirSync(forgecraftDir, { recursive: true });
  const exceptionsPath = join(forgecraftDir, "exceptions.json");
  if (!existsSync(exceptionsPath)) {
    writeFileSync(exceptionsPath, EXCEPTIONS_TEMPLATE, "utf-8");
    filesCreated.push(".forgecraft/exceptions.json");
  } else {
    filesSkipped.push(".forgecraft/exceptions.json");
  }

  const projectGatesPath = join(forgecraftDir, "project-gates.yaml");
  if (!existsSync(projectGatesPath)) {
    writeFileSync(projectGatesPath, PROJECT_GATES_TEMPLATE, "utf-8");
    filesCreated.push(".forgecraft/project-gates.yaml");
  } else {
    filesSkipped.push(".forgecraft/project-gates.yaml");
  }
  ensureGateDirs(input.project_dir);

  if (userConfig?.deployment) {
    const smokeDir = join(input.project_dir, "tests", "smoke");
    const loadDir = join(input.project_dir, "tests", "load");
    const reportsDir = join(input.project_dir, ".forgecraft", "reports");
    mkdirSync(smokeDir, { recursive: true });
    mkdirSync(loadDir, { recursive: true });
    mkdirSync(reportsDir, { recursive: true });
    trackWrite(
      "tests/smoke/README.md",
      join(smokeDir, "README.md"),
      renderSmokeTestsReadme(userConfig.deployment),
    );
    trackWrite(
      "tests/load/README.md",
      join(loadDir, "README.md"),
      renderLoadTestsReadme(userConfig.deployment),
    );
    trackWrite(
      ".forgecraft/reports/.gitkeep",
      join(reportsDir, ".gitkeep"),
      "",
    );
  }

  return { filesCreated, filesSkipped };
}
