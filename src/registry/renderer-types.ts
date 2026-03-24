/**
 * Renderer type definitions.
 *
 * Shared interfaces for the template rendering pipeline.
 * Extracted to avoid circular imports between renderer sub-modules.
 */

import type { Tag } from "../shared/types.js";

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
