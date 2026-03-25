/**
 * refresh-analyzer: Drift analysis helpers for refresh_project.
 *
 * Detects tag drift, tier changes, and completeness gaps.
 */

import {
  ALL_TAGS,
} from "../shared/types.js";
import type {
  Tag,
  ContentTier,
  ForgeCraftConfig,
} from "../shared/types.js";
import { analyzeProject } from "../analyzers/package-json.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import {
  loadAllTemplatesWithExtras,
} from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import type { z } from "zod";
import type { refreshProjectSchema } from "./refresh-project.js";

/** Minimum confidence to suggest a new tag. */
const SUGGEST_THRESHOLD = 0.5;

// ── Types ────────────────────────────────────────────────────────────

export interface DriftReport {
  readonly currentTags: Tag[];
  readonly newTagSuggestions: Array<{
    tag: Tag;
    confidence: number;
    evidence: string[];
  }>;
  readonly droppedTagCandidates: Tag[];
  readonly completenessGaps: string[];
  readonly completenessFixed: string[];
  readonly tierChange: { from: ContentTier; to: ContentTier } | null;
  readonly blockCountDelta: { before: number; after: number };
}

// ── Drift Analysis ───────────────────────────────────────────────────

/**
 * Analyze how the project has drifted from its current config.
 *
 * @param projectDir - Absolute project root
 * @param config - Current ForgeCraft config
 * @param args - Refresh args (tier, add_tags, remove_tags)
 * @returns Drift report with tag suggestions and completeness info
 */
export function analyzeDrift(
  projectDir: string,
  config: ForgeCraftConfig,
  args: z.infer<typeof refreshProjectSchema>,
): DriftReport {
  const currentTags: Tag[] = config.tags ?? ["UNIVERSAL"];
  const currentTier: ContentTier = (config.tier ?? "recommended") as ContentTier;
  const requestedTier = (args.tier ?? currentTier) as ContentTier;

  const detections = analyzeProject(projectDir);
  const newTagSuggestions: Array<{ tag: Tag; confidence: number; evidence: string[] }> = [];
  const detectedTagSet = new Set<Tag>();

  for (const d of detections) {
    detectedTagSet.add(d.tag);
    if (d.confidence >= SUGGEST_THRESHOLD && !currentTags.includes(d.tag)) {
      newTagSuggestions.push({ tag: d.tag, confidence: d.confidence, evidence: d.evidence });
    }
  }

  const droppedTagCandidates = currentTags.filter(
    (t) => t !== "UNIVERSAL" && !detectedTagSet.has(t),
  );

  const completeness = checkCompleteness(projectDir, currentTags);
  const completenessGaps = completeness.failing.map((f) => f.check);
  const completenessFixed = completeness.passing.map((p) => p.check);

  const tierChange = requestedTier !== currentTier
    ? { from: currentTier, to: requestedTier }
    : null;

  const allTemplates = loadAllTemplatesWithExtras(undefined, config.templateDirs);
  const beforeComposed = composeTemplates(currentTags, allTemplates, { config });
  const proposedTags = computeUpdatedTags(
    currentTags,
    newTagSuggestions,
    args.add_tags as Tag[] | undefined,
    args.remove_tags as Tag[] | undefined,
  );
  const afterConfig = { ...config, tags: proposedTags, tier: requestedTier };
  const afterComposed = composeTemplates(proposedTags, allTemplates, { config: afterConfig });

  return {
    currentTags,
    newTagSuggestions,
    droppedTagCandidates,
    completenessGaps,
    completenessFixed,
    tierChange,
    blockCountDelta: {
      before: beforeComposed.claudeMdBlocks.length,
      after: afterComposed.claudeMdBlocks.length,
    },
  };
}

// ── Tag Computation ──────────────────────────────────────────────────

/**
 * Compute the updated tag set from current tags, suggestions, and explicit adds/removes.
 *
 * @param currentTags - Current tags in config
 * @param suggestions - Detected tag suggestions with confidence scores
 * @param addTags - Explicit tags to add
 * @param removeTags - Explicit tags to remove
 * @returns Updated tag array (always includes UNIVERSAL)
 */
export function computeUpdatedTags(
  currentTags: Tag[],
  suggestions: Array<{ tag: Tag; confidence: number }>,
  addTags?: Tag[],
  removeTags?: Tag[],
): Tag[] {
  const tagSet = new Set<Tag>(currentTags);

  for (const s of suggestions) {
    if (s.confidence >= 0.6) tagSet.add(s.tag);
  }

  if (addTags) {
    for (const t of addTags) tagSet.add(t);
  }

  if (removeTags) {
    for (const t of removeTags) {
      if (t !== "UNIVERSAL") tagSet.delete(t);
    }
  }

  tagSet.add("UNIVERSAL");
  return Array.from(tagSet);
}

/**
 * Infer project name from directory path.
 *
 * @param projectDir - Absolute path to project root
 * @returns Inferred project name
 */
export function inferProjectName(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

// Suppress unused import warning — ALL_TAGS is referenced by consuming files
void ALL_TAGS;
