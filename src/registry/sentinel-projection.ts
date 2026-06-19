/**
 * Multi-agent sentinel projection (PT-2).
 *
 * The single source of truth for cross-agent instruction files is ONE canonical
 * body — the self-contained monolith of composed instruction blocks (the same
 * content `renderInstructionFile` produces for a flat target, minus the date).
 * Every other agent target (copilot, cline, windsurf, cursor, AGENTS.md) is a
 * PURE PROJECTION of that body: a known path plus a deterministic transform.
 *
 * CRITICAL — determinism: `renderInstructionFile` embeds `new Date()` in its
 * header via `buildHeader`, which would make generation and the drift check
 * disagree on the date line. The canonical body here uses a DATE-FREE provenance
 * comment so generate and check produce byte-identical output. The drift
 * evaluator additionally normalizes (strips) any provenance/date line as a
 * belt-and-suspenders guard, but the canonical body itself must already be
 * deterministic.
 *
 * This module is pure: no file I/O, no process side effects.
 */

import type { InstructionBlock } from "../shared/types.js";
import type { RenderContext, RenderOptions } from "./renderer-types.js";
import {
  renderTemplate,
  compactifyContent,
  buildCursorFrontmatter,
} from "./renderer.js";

/**
 * Deterministic provenance line for the canonical sentinel body. Unlike
 * `buildHeader`, it embeds NO date — so the same blocks+context always render
 * byte-identical output, which is what makes the drift check sound.
 */
const CANONICAL_PROVENANCE =
  "<!-- ForgeCraft sentinel (canonical) | npx forgecraft-mcp refresh . to update -->";

/**
 * Render the canonical sentinel body from composed instruction blocks.
 *
 * Deterministic: identical (blocks, context) always yields identical bytes —
 * no `new Date()`. This body IS the AGENTS.md content and the source every
 * other projection derives from.
 *
 * @param blocks - Composed instruction blocks
 * @param context - Project render context for variable substitution
 * @param options - Render options (compact mode)
 * @returns The canonical body string (no target frontmatter)
 */
export function renderCanonicalSentinel(
  blocks: InstructionBlock[],
  context: RenderContext,
  options: RenderOptions = {},
): string {
  const sections: string[] = [];
  sections.push("# AGENTS.md\n");
  sections.push(`${CANONICAL_PROVENANCE}\n`);

  for (const block of blocks) {
    sections.push(renderTemplate(block.content, context));
  }

  const assembled = sections.join("\n");
  return options.compact ? compactifyContent(assembled) : assembled;
}

/** A single per-target projection: output path + body transform. */
export interface SentinelProjection {
  /** Copy target identifier (matches sentinel.targets entries). */
  readonly target: string;
  /** Output path relative to project root (POSIX separators). */
  readonly path: string;
  /** Pure transform from the canonical body to this target's file content. */
  readonly transform: (body: string, context: RenderContext) => string;
}

/** Identity transform — a pure copy of the canonical body. */
const copyBody = (body: string): string => body;

/**
 * Registry of supported sentinel copy targets and their projections.
 * Keyed by copy-target id. CLAUDE.md / the CNT tree are intentionally absent —
 * they are routing-special and generated via their existing path, never copied.
 *
 * - agents-md / copilot / cline / windsurf: pure copy of the canonical body.
 * - cursor: canonical body prefixed with MDC frontmatter (reuses
 *   buildCursorFrontmatter so cursor `.mdc` files stay valid).
 */
export const SENTINEL_PROJECTIONS: Readonly<
  Record<string, SentinelProjection>
> = {
  "agents-md": {
    target: "agents-md",
    path: "AGENTS.md",
    transform: copyBody,
  },
  copilot: {
    target: "copilot",
    path: ".github/copilot-instructions.md",
    transform: copyBody,
  },
  cline: {
    target: "cline",
    path: ".clinerules",
    transform: copyBody,
  },
  windsurf: {
    target: "windsurf",
    path: ".windsurf/rules/agents.md",
    transform: copyBody,
  },
  cursor: {
    target: "cursor",
    path: ".cursor/rules/agents.mdc",
    transform: (body, context) => `${buildCursorFrontmatter(context)}${body}`,
  },
};

/** All recognized sentinel copy-target ids. */
export const SENTINEL_COPY_TARGETS: readonly string[] =
  Object.keys(SENTINEL_PROJECTIONS);

/**
 * Project the canonical body to a specific target's file content.
 *
 * @param target - Copy target id (must exist in SENTINEL_PROJECTIONS)
 * @param body - The canonical sentinel body
 * @param context - Render context (used by transforms that need it, e.g. cursor)
 * @returns Projected file content, or null when the target is unrecognized
 */
export function projectSentinel(
  target: string,
  body: string,
  context: RenderContext,
): string | null {
  const projection = SENTINEL_PROJECTIONS[target];
  if (!projection) return null;
  return projection.transform(body, context);
}
