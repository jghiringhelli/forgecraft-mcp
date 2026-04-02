/**
 * setup-phase1: Phase 1 response builders — analysis summary and calibration questions.
 */

import type { ToolResult } from "../shared/types.js";
import type { AmbiguityItem } from "./spec-parser.js";
import {
  generateReversePrd,
  writeBrownfieldReversePrd,
} from "./setup-detector.js";
import { readExperimentConfig } from "../shared/config.js";
import type { ProjectContext } from "./setup-context.js";
import type { GitStatus } from "./setup-artifact-writers.js";

// ── Phase 1 Response ─────────────────────────────────────────────────

/**
 * Build the phase 1 "what I found + three questions" response.
 *
 * @param context - Assembled project context
 * @param gitStatus - Pre-flight git check result; shows a warning when no repo exists
 * @returns MCP tool response with analysis summary and calibration questions
 */
export function buildPhase1Response(
  context: ProjectContext,
  gitStatus?: GitStatus,
): ToolResult {
  let text = `## Project Setup — Step 0\n\n`;
  text += buildFoundSummary(context, gitStatus);

  if (context.ambiguities.length > 0) {
    text += buildAmbiguitySection(context.ambiguities);
  }

  if (context.specCandidates.length > 1) {
    text += buildSpecDisambiguationBlock(context.specCandidates);
  } else if (context.specContent) {
    text += buildSpecExtractionRequest(context.specSourceLabel);
  }

  if (context.isBrownfield) {
    writeBrownfieldReversePrd(context.projectDir);
    text += buildBrownfieldQuestions();
  } else {
    text += buildPhase1Questions();
  }

  const experiment = readExperimentConfig(context.projectDir);
  if (experiment?.id) {
    text += `\n🧪 Experiment mode: ${experiment.id} (${experiment.type}) — gates will be auto-contributed at end of each cycle.\n`;
  }

  return { content: [{ type: "text", text }] };
}

/**
 * Build the "multiple spec files found — please identify" block.
 */
function buildSpecDisambiguationBlock(
  candidates: ReadonlyArray<{ path: string; preview: string }>,
): string {
  let block = `\n### Multiple specification files found\n\n`;
  block += `Before proceeding, read each of these files and identify which one is the **project system spec** `;
  block += `(not a series bible, world-building document, or supporting creative content).\n\n`;
  for (let i = 0; i < candidates.length; i++) {
    block += `**[${i + 1}] \`${candidates[i].path}\`**\n`;
    block += `\`\`\`\n${candidates[i].preview.replace(/`/g, "'")}...\n\`\`\`\n\n`;
  }
  block += `In your next call to \`setup_project\`, provide:\n`;
  block += `- \`spec_file_confirmed\`: the full path to the project spec file\n`;
  block += `- \`problem_statement\`: 1–3 sentence summary of the core problem the app solves\n`;
  block += `- \`primary_users\`: comma-separated list of the primary user roles or actors\n`;
  block += `- \`success_criteria\`: comma-separated list of measurable success outcomes\n\n`;
  return block;
}

/**
 * Build the spec extraction request when a single spec was auto-selected.
 */
function buildSpecExtractionRequest(specPath: string): string {
  let block = `\n### Spec identified: \`${specPath}\`\n\n`;
  block += `Read this spec now. In your next call to \`setup_project\` (Phase 2), also provide:\n`;
  block += `- \`problem_statement\`: 1–3 sentence summary of the core problem the app solves\n`;
  block += `- \`primary_users\`: comma-separated list of the primary user roles or actors\n`;
  block += `- \`success_criteria\`: comma-separated list of measurable success outcomes\n\n`;
  return block;
}

/**
 * Build the Ambiguity Detected section for phase 1.
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
 */
function buildFoundSummary(
  context: ProjectContext,
  gitStatus?: GitStatus,
): string {
  const {
    projectName,
    isExistingProject,
    specContent,
    specSourceLabel,
    specCandidates,
    inferredTags,
  } = context;
  const specTitle = specContent?.match(/^#\s+(.+)/m)?.[1]?.trim() ?? null;
  const displayName =
    specTitle && specTitle !== "[Project Name]" ? specTitle : projectName;
  let summary = `### What I found:\n`;
  summary += `- **Project**: ${displayName}\n`;
  summary += `- **Mode**: ${isExistingProject ? "Existing project (source code detected)" : "New project"}\n`;
  if (specCandidates.length > 1) {
    summary += `- **Spec files**: ${specCandidates.length} candidates found — disambiguation required (see below)\n`;
  } else if (specContent) {
    summary += `- **Spec**: ${specSourceLabel}\n`;
  } else {
    summary += `- **Spec**: not found — will scaffold with stubs\n`;
  }
  summary += `- **Inferred tags**: ${inferredTags.map((t) => `[${t}]`).join(" ")}\n`;
  if (gitStatus === "no-repo") {
    summary += `- **Git**: ⚠️ No repository detected — ForgeCraft will initialise one automatically during setup\n`;
  }
  summary += `\n`;
  return summary;
}

/**
 * Build the three calibration questions block.
 */
function buildPhase1Questions(): string {
  return `### Before I proceed, I need four answers:

**Q1: What is the development stage?**
- \`mvp\` — early validation, expect significant changes, minimal ceremony
- \`production\` — shipping to real users, full spec and quality gates required

**Q2: Is the scope defined and stable?**
- \`complete\` — requirements are clear; proceed with full cascade
- \`evolving\` — scope is still forming; use lighter cascade, revisit when stable

**Q3: Does this project have existing users or downstream consumers?**
- \`yes\` — behavioral contracts and breaking-change detection are required
- \`no\` — contracts are recommended but not blocking

**Q4: Would you like to add CodeSeeker for semantic code search?**
CodeSeeker builds a live knowledge graph of your codebase so the AI assistant can find existing patterns before writing new code — this cut duplication by ~53% in measured sessions. It runs locally (no data leaves your machine).
- \`yes\` *(recommended)* — wire it in automatically
- \`no\` — skip it; choose this if you already use a similar semantic search tool

Call \`setup_project\` again with \`mvp\`, \`scope_complete\`, \`has_consumers\`, and \`use_codeseeker\` to proceed.`;
}

/**
 * Build brownfield-specific calibration questions for phase 1.
 */
function buildBrownfieldQuestions(): string {
  return `## Brownfield Project Detected

I found existing source code. Before we proceed:

1. **What is currently broken or incomplete?** (Describe the known issues or missing features)
2. **What new feature or improvement are you adding?** (Describe the specific change)
3. **Do tests exist, and do they currently pass?** (Run \`npm test\` or \`pytest\` to check)

I've generated a reverse-engineered spec stub at \`docs/PRD.md\`. Review and complete it.

Create a \`work/\` branch before making changes: \`git checkout -b work/forgecraft-setup\`

**Also answer the CodeSeeker question:** Would you like semantic code search wired in?
CodeSeeker builds a live knowledge graph so the AI can find existing patterns before writing new code — measured ~53% reduction in duplication. Runs locally, no data leaves your machine.
- \`use_codeseeker: true\` *(recommended)*
- \`use_codeseeker: false\` — skip if you already have a similar semantic search tool

Call \`setup_project\` again with \`mvp\`, \`scope_complete\`, \`has_consumers\`, and \`use_codeseeker\` to proceed.`;
}

// Export generateReversePrd for backward compatibility
export { generateReversePrd };
