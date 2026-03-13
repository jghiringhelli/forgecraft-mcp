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
  readonly releasePhase?: string;
  readonly tags: Tag[];
  readonly [key: string]: unknown;
}

/** Options for instruction file rendering. */
export interface RenderOptions {
  /**
   * Strip explanatory tail clauses from bullet points and deduplicate identical
   * lines, reducing token count by ~20-40% at the cost of some explanatory prose.
   * Recommended for projects with 3+ tags. Defaults to false.
   */
  readonly compact?: boolean;
}

/**
 * Render an instruction file from composed blocks and project context.
 * Supports all output targets (Claude, Cursor, Copilot, Windsurf, Cline, Aider).
 *
 * @param blocks - Composed instruction blocks
 * @param context - Project context for variable substitution
 * @param target - Output target (defaults to "claude")
 * @param options - Rendering options (compact mode, etc.)
 * @returns Full instruction file content as a string
 */
export function renderInstructionFile(
  blocks: InstructionBlock[],
  context: RenderContext,
  target: OutputTarget = DEFAULT_OUTPUT_TARGET,
  options: RenderOptions = {},
): string {
  const targetConfig = OUTPUT_TARGET_CONFIGS[target];
  const header = buildHeader(context);
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

  const assembled = sections.join("\n");
  return options.compact ? compactifyContent(assembled) : assembled;
}

/** Patterns that introduce explanatory clauses in bullet point lines. */
const EXPLANATORY_TAIL_RE = /\.\s+(?:This|It\b|Because|These|They|Note:)\b.*$/;

/**
 * Compact post-processor for instruction file content.
 *
 * Strips explanatory tail clauses from bullet lines
 * (e.g. ". This ensures X", ". Because Y", ". It prevents Z"),
 * deduplicates identical bullet lines across the full document,
 * and compresses excessive blank lines.
 *
 * Reduces token count by ~20–40% depending on tag mix.
 *
 * @param content - Full rendered instruction file content
 * @returns Compacted content
 */
export function compactifyContent(content: string): string {
  const seenBullets = new Set<string>();
  const lines = content
    .split("\n")
    .map((line) => {
      if (!line.startsWith("- ")) return line;
      const stripped = line.replace(EXPLANATORY_TAIL_RE, ".");
      if (seenBullets.has(stripped)) return null;
      seenBullets.add(stripped);
      return stripped;
    })
    .filter((line): line is string => line !== null);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
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
 * Intentionally minimal — a single comment line so it does not consume
 * the AI assistant's context window.
 */
function buildHeader(context: RenderContext): string {
  const date = new Date().toISOString().split("T")[0];
  const tagList = context.tags.join(", ");
  return `<!-- ForgeCraft | ${date} | tags: ${tagList} | npx forgecraft-mcp refresh . to update -->\n`;
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

/**
 * Render a skill template's content with project-specific variable substitution.
 * Skills are written as individual `.md` files in `.claude/commands/`.
 *
 * @param content - Raw skill content with {{variable}} placeholders
 * @param context - Project context for variable substitution
 * @returns Rendered skill content ready to write to file
 */
export function renderSkill(
  content: string,
  context: RenderContext,
): string {
  return renderTemplate(content, context);
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
 * Process conditional blocks in template content.
 *
 * Supports `{{#if CONDITION}}...{{/if}}` where CONDITION is evaluated
 * against the render context. Special synthetic variables:
 * - `language_is_typescript` → true when context.language === "typescript"
 * - `language_is_python` → true when context.language === "python"
 *
 * Truthy conditions keep content; falsy conditions strip the block.
 *
 * @param template - Raw template string with conditionals
 * @param context - Render context for condition evaluation
 * @returns Template with conditionals resolved
 */
function processConditionals(
  template: string,
  context: RenderContext,
): string {
  return template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, condition: string, content: string) => {
      const value = resolveCondition(condition, context);
      return value ? content : "";
    },
  );
}

/**
 * Resolve a conditional variable to a boolean value.
 */
function resolveCondition(name: string, context: RenderContext): boolean {
  // Synthetic language conditionals
  if (name === "language_is_typescript") {
    return context.language === "typescript";
  }
  if (name === "language_is_python") {
    return context.language === "python";
  }

  // General context lookup (truthy check)
  const value = resolveVariable(name, context);
  return value !== undefined && value !== null && value !== "" && value !== false;
}

/**
 * Render a template string by substituting {{variable}} placeholders.
 * Supports {{variable | default: value}} syntax and {{#if}}...{{/if}} conditionals.
 */
export function renderTemplate(
  template: string,
  context: RenderContext,
): string {
  // Process conditionals first, then variable substitution
  const withConditionals = processConditionals(template, context);
  return withConditionals.replace(
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
