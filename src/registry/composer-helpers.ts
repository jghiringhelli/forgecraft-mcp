/**
 * Pure helper functions and constants for template composition.
 */

import type { Tag, ContentTier } from "../shared/types.js";

/**
 * Tier inclusion hierarchy.
 * "core" → includes only core blocks.
 * "recommended" → includes core + recommended.
 * "optional" → includes core + recommended + optional.
 * Blocks without a tier field are treated as "core" (always included).
 */
export const TIER_HIERARCHY: Record<ContentTier, ContentTier[]> = {
  core: ["core"],
  recommended: ["core", "recommended"],
  optional: ["core", "recommended", "optional"],
};

/** Default tier when none is specified in config. */
export const DEFAULT_TIER: ContentTier = "recommended";

/**
 * Check if a block should be included based on the tier filter.
 * Blocks without a tier are treated as "core" (always included).
 *
 * @param blockTier - The tier of the block (undefined = core)
 * @param allowedTiers - The set of allowed tiers
 * @returns true if the block should be included
 */
export function isTierAllowed(
  blockTier: ContentTier | undefined,
  allowedTiers: Set<ContentTier>,
): boolean {
  const effective = blockTier ?? "core";
  return allowedTiers.has(effective);
}

/**
 * Check if a block ID is included/excluded by the config lists.
 *
 * @param blockId - The block identifier
 * @param include - Explicit include list (if set, only these are included)
 * @param exclude - Explicit exclude list (always excluded)
 * @returns true if the block should be included
 */
export function isBlockAllowed(
  blockId: string,
  include?: string[],
  exclude?: string[],
): boolean {
  if (exclude?.includes(blockId)) {
    return false;
  }
  if (include && include.length > 0) {
    return include.includes(blockId);
  }
  return true;
}

/**
 * Ensure UNIVERSAL is always first in the tag list.
 * Remove duplicates. Preserve user order for other tags.
 *
 * @param tags - Raw tag list from config
 * @returns Normalized tag list with UNIVERSAL first
 */
export function normalizeTagOrder(tags: Tag[]): Tag[] {
  const seen = new Set<Tag>();
  const result: Tag[] = [];

  if (!tags.includes("UNIVERSAL")) {
    result.push("UNIVERSAL");
    seen.add("UNIVERSAL");
  }

  for (const tag of tags) {
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result;
}
