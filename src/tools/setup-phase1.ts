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

// ── Phase 1 Response ─────────────────────────────────────────────────

/**
 * Build the phase 1 "what I found + three questions" response.
 *
 * Only reached when git pre-flight passes (repo exists), so no git status
 * annotation is needed here.
 *
 * @param context - Assembled project context
 * @returns MCP tool response with analysis summary and calibration questions
 */
export function buildPhase1Response(context: ProjectContext): ToolResult {
  let text = `## Project Setup — Step 0\n\n`;
  text += buildFoundSummary(context);

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
    text += buildBrownfieldQuestions(context.inferredTags);
  } else {
    text += buildPhase1Questions(context.inferredTags);
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
function buildFoundSummary(context: ProjectContext): string {
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
  summary += `\n`;
  return summary;
}

/**
 * Build the three calibration questions block.
 */
const PLAYWRIGHT_TAGS = new Set(["WEB-REACT", "WEB-STATIC", "API"]);

/**
 * Build the standard "four/five questions" block for greenfield projects.
 * Q5 (Playwright) is only shown when the project has HTML or API tags.
 *
 * @param tags - Inferred project tags (to decide whether to show Q5)
 */
function buildPhase1Questions(tags: readonly string[]): string {
  const needsPlaywright = tags.some((t) => PLAYWRIGHT_TAGS.has(t));
  const questionCount = needsPlaywright ? "five" : "four";
  const playwrightBlock = needsPlaywright
    ? `\n**Q5: Would you like to add Playwright MCP for browser automation and testing?**
Playwright MCP lets the AI assistant drive a real browser — navigate pages, fill forms, screenshot, and loop on visual feedback without leaving the chat. For API projects it adds request interception and response validation. It runs locally (no data leaves your machine).
- \`yes\` *(recommended)* — wire it in automatically
- \`no\` — skip it; choose this if you already use an equivalent browser testing tool\n`
    : "";
  const params = needsPlaywright
    ? "`mvp`, `scope_complete`, `has_consumers`, `use_codeseeker`, and `use_playwright`"
    : "`mvp`, `scope_complete`, `has_consumers`, and `use_codeseeker`";

  return `### Before I proceed, I need ${questionCount} answers:

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
${playwrightBlock}
Call \`setup_project\` again with ${params} to proceed.`;
}

/**
 * Build brownfield-specific calibration questions for phase 1.
 *
 * @param tags - Inferred project tags (to decide whether to show Playwright Q)
 */
function buildBrownfieldQuestions(tags: readonly string[]): string {
  const needsPlaywright = tags.some((t) => PLAYWRIGHT_TAGS.has(t));
  const playwrightBlock = needsPlaywright
    ? `\n**Also answer the Playwright question:** Would you like browser automation wired in?
Playwright MCP lets the AI drive a real browser for E2E loops, visual verification, and API request interception — all locally.
- \`use_playwright: true\` *(recommended)*
- \`use_playwright: false\` — skip if you already have an equivalent browser testing tool\n`
    : "";
  const params = needsPlaywright
    ? "`mvp`, `scope_complete`, `has_consumers`, `use_codeseeker`, and `use_playwright`"
    : "`mvp`, `scope_complete`, `has_consumers`, and `use_codeseeker`";

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
${playwrightBlock}
Call \`setup_project\` again with ${params} to proceed.`;
}

// Export generateReversePrd for backward compatibility
export { generateReversePrd };
