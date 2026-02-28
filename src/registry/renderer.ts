/**
 * Template renderer.
 *
 * Renders composed template content with project-specific variable substitution.
 * Supports multiple output targets (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 * Handles {{variable}} and {{variable | default: value}} syntax.
 */

import { createLogger } from "../shared/logger/index.js";
import type {
  InstructionBlock,
  NfrBlock,
  ReferenceBlock,
  ReviewBlock,
  ReviewDimension,
  Tag,
  OutputTarget,
  OutputTargetConfig,
} from "../shared/types.js";
import {
  OUTPUT_TARGET_CONFIGS,
  DEFAULT_OUTPUT_TARGET,
} from "../shared/types.js";

const logger = createLogger("registry/renderer");

/** Variables available for template rendering. */
export interface RenderContext {
  readonly projectName: string;
  readonly language: string;
  readonly framework?: string;
  readonly domain?: string;
  readonly repoUrl?: string;
  readonly sensitiveData?: string;
  readonly tags: Tag[];
  readonly [key: string]: unknown;
}

/**
 * Render an instruction file from composed blocks and project context.
 * Supports all output targets (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 *
 * @param blocks - Composed instruction blocks
 * @param context - Project context for variable substitution
 * @param target - Output target (defaults to "claude")
 * @returns Full instruction file content as a string
 */
export function renderInstructionFile(
  blocks: InstructionBlock[],
  context: RenderContext,
  target: OutputTarget = DEFAULT_OUTPUT_TARGET,
): string {
  const targetConfig = OUTPUT_TARGET_CONFIGS[target];
  const header = buildHeader(context, targetConfig);
  const sections: string[] = [];

  // Cursor .mdc files use frontmatter
  if (targetConfig.usesFrontmatter) {
    sections.push(buildCursorFrontmatter(context));
  }

  sections.push(`${targetConfig.heading}\n`);
  sections.push(header);

  for (const block of blocks) {
    const rendered = renderTemplate(block.content, context);
    sections.push(rendered);
  }

  return sections.join("\n");
}

/**
 * @deprecated Use renderInstructionFile instead. Kept for backward compatibility.
 */
export function renderClaudeMd(
  blocks: InstructionBlock[],
  context: RenderContext,
): string {
  return renderInstructionFile(blocks, context, "claude");
}

/**
 * Build the ForgeCraft metadata header for the instruction file.
 * Adapts messaging based on the output target.
 */
function buildHeader(context: RenderContext, targetConfig: OutputTargetConfig): string {
  const date = new Date().toISOString().split("T")[0];
  const tagList = context.tags.map((t) => `\`${t}\``).join(", ");
  return (
    `<!-- ForgeCraft managed | ${date} | target: ${targetConfig.target} -->\n` +
    `> **This project is managed by [ForgeCraft](https://github.com/jghiringhelli/forgecraft-mcp).** Generated for ${targetConfig.displayName}.\n` +
    `> Tags: ${tagList}\n` +
    `>\n` +
    `> Available commands:\n` +
    `> - \`setup_project\` — re-run full setup (detects tags, generates instruction files)\n` +
    `> - \`refresh_project\` — detect drift, update tags/tier after project scope changes\n` +
    `> - \`audit_project\` — score compliance, find gaps\n` +
    `> - \`review_project\` — structured code review checklist\n` +
    `> - \`scaffold_project\` — generate folders, hooks, docs skeletons\n` +
    `>\n` +
    `> Config: \`forgecraft.yaml\` | Tier system: core → recommended → optional\n`
  );
}

/**
 * Build Cursor-specific MDC frontmatter.
 */
function buildCursorFrontmatter(context: RenderContext): string {
  return (
    `---\n` +
    `description: Engineering standards for ${context.projectName}\n` +
    `globs:\n` +
    `alwaysApply: true\n` +
    `---\n`
  );
}

/**
 * Render NFR sections from composed blocks.
 */
export function renderNfrs(
  blocks: NfrBlock[],
  context: RenderContext,
): string {
  const sections: string[] = [];

  for (const block of blocks) {
    sections.push(renderTemplate(block.content, context));
  }

  return sections.join("\n");
}

/**
 * Render design reference blocks (DDD, CQRS, GoF patterns) for on-demand retrieval.
 *
 * @param blocks - Composed reference blocks
 * @param context - Project context for variable substitution
 * @returns Formatted markdown content
 */
export function renderReference(
  blocks: ReferenceBlock[],
  context: RenderContext,
): string {
  const sections: string[] = [];

  for (const block of blocks) {
    sections.push(renderTemplate(block.content, context));
  }

  return sections.join("\n");
}

/** Dimension display order for review output. */
const DIMENSION_ORDER: readonly ReviewDimension[] = [
  "architecture",
  "code-quality",
  "tests",
  "performance",
] as const;

/** Human-readable titles for review dimensions. */
const DIMENSION_TITLES: Record<ReviewDimension, string> = {
  architecture: "Architecture Review",
  "code-quality": "Code Quality Review",
  tests: "Test Review",
  performance: "Performance Review",
};

/**
 * Render review checklist blocks grouped by dimension.
 *
 * @param blocks - Composed review blocks from all active tags.
 * @param scope  - "comprehensive" renders all items; "focused" limits to critical items.
 * @returns Formatted markdown review checklist.
 */
export function renderReviewChecklist(
  blocks: ReviewBlock[],
  scope: "comprehensive" | "focused",
): string {
  const sections: string[] = [];

  // Group blocks by dimension
  const byDimension = new Map<ReviewDimension, ReviewBlock[]>();
  for (const block of blocks) {
    const existing = byDimension.get(block.dimension) ?? [];
    existing.push(block);
    byDimension.set(block.dimension, existing);
  }

  for (const dimension of DIMENSION_ORDER) {
    const dimensionBlocks = byDimension.get(dimension);
    if (!dimensionBlocks || dimensionBlocks.length === 0) continue;

    sections.push(`## ${DIMENSION_TITLES[dimension]}`);
    sections.push("");

    for (const block of dimensionBlocks) {
      sections.push(`### ${block.title}`);
      sections.push(block.description.trim());
      sections.push("");

      const items =
        scope === "focused"
          ? block.checklist.filter((item) => item.severity === "critical")
          : block.checklist;

      for (const item of items) {
        const icon =
          item.severity === "critical"
            ? "🔴"
            : item.severity === "important"
              ? "🟡"
              : "🟢";
        sections.push(`- ${icon} **[${item.severity.toUpperCase()}]** ${item.description}`);
      }
      sections.push("");
    }
  }

  // Add the per-issue output format guidance
  sections.push("---");
  sections.push("");
  sections.push("## Per-Issue Output Format");
  sections.push("");
  sections.push("For every issue found, provide:");
  sections.push("1. **Problem**: Describe concretely, with file and line references.");
  sections.push("2. **Options**: Present 2-3 options (including \"do nothing\" where reasonable).");
  sections.push("3. **For each option**: implementation effort, risk, impact on other code, maintenance burden.");
  sections.push("4. **Recommendation**: Your preferred option with rationale.");
  sections.push("5. **Confirmation**: Ask whether to proceed or choose a different direction.");
  sections.push("");

  return sections.join("\n");
}

/**
 * Render a Status.md skeleton with project info.
 */
export function renderStatusMd(context: RenderContext): string {
  return `# Status.md

## Last Updated: ${new Date().toISOString().split("T")[0]}
## Session Summary
Project initialized with ForgeCraft. Tags: ${context.tags.join(", ")}.

## Project Structure
\`\`\`
[Run 'tree -L 3 --dirsfirst' to populate]
\`\`\`

## Feature Tracker
| Feature | Status | Branch | Notes |
|---------|--------|--------|-------|
| | ⬚ Not Started | | |

## Known Bugs
| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Technical Debt
| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| | | | |

## Current Context
- Working on:
- Blocked by:
- Decisions pending:
- Next steps:

## Architecture Decision Log
| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| | | | |
`;
}

/**
 * Render a PRD skeleton.
 */
export function renderPrdSkeleton(context: RenderContext): string {
  return `# PRD: ${context.projectName}

## Background & Context
[Why this project exists, what problem it solves]

## Stakeholders
[Who owns it, who uses it, who's affected]

## User Stories
[Organized by feature area]
- US-001: As a [type], I want [action] so that [benefit]

## Requirements
### Functional Requirements
- FR-001: [requirement]

### Non-Functional Requirements
[Generated from active tags: ${context.tags.join(", ")}]

## Out of Scope
[Explicitly list what this project does NOT do]

## Success Metrics
[How do we know this project succeeded?]

## Open Questions
[Unresolved decisions]
`;
}

/**
 * Render a Tech Spec skeleton.
 */
export function renderTechSpecSkeleton(context: RenderContext): string {
  return `# Tech Spec: ${context.projectName}

## Overview
[One paragraph translating PRD to technical approach]

## Architecture
### System Diagram
[Mermaid diagram or description of components]

### Tech Stack
- Runtime: ${context.language}
- Framework: ${context.framework ?? "[TBD]"}

### Data Flow
[How data moves through the system]

## API Contracts
[Key endpoints, request/response shapes]

## Security & Compliance
[Auth approach, encryption, audit logging]

## Dependencies
[External services, APIs, libraries with version pins]

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| | H/M/L | H/M/L | |
`;
}

/**
 * Render a template string by substituting {{variable}} placeholders.
 * Supports {{variable | default: value}} syntax.
 */
export function renderTemplate(
  template: string,
  context: RenderContext,
): string {
  return template.replace(
    /\{\{(\s*[\w.]+\s*(?:\|\s*default:\s*[^}]+)?)\}\}/g,
    (_match, expression: string) => {
      const parts = expression.split("|").map((p) => p.trim());
      const varName = parts[0] as string;

      // Look up variable in context
      const value = resolveVariable(varName, context);

      if (value !== undefined && value !== null && value !== "") {
        return String(value);
      }

      // Check for default value
      if (parts.length > 1) {
        const defaultPart = parts[1] as string;
        const defaultMatch = defaultPart.match(/^default:\s*(.+)$/);
        if (defaultMatch) {
          return (defaultMatch[1] as string).trim();
        }
      }

      // Return the original placeholder if no value and no default
      return `{{${varName}}}`;
    },
  );
}

/**
 * Resolve a dotted variable name from the context.
 */
function resolveVariable(name: string, context: RenderContext): unknown {
  // Handle special case: tags as comma-separated string
  if (name === "tags") {
    return context.tags.map((t) => `\`[${t}]\``).join(" ");
  }

  // Handle snake_case to camelCase mapping
  const camelName = name.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );

  if (camelName in context) {
    return context[camelName];
  }

  if (name in context) {
    return context[name];
  }

  logger.debug("Unresolved template variable", { variable: name });
  return undefined;
}
