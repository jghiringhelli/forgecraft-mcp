/**
 * Template composer.
 *
 * Given a set of active tags, composes CLAUDE.md blocks, folder structures,
 * hooks, and NFRs from all matching templates into unified outputs.
 * Handles merge, deduplication, ordering, and tier-based filtering.
 */

import { createLogger } from "../shared/logger/index.js";
import type {
  Tag,
  TagTemplateSet,
  InstructionBlock,
  StructureEntry,
  NfrBlock,
  HookTemplate,
  SkillTemplate,
  ReviewBlock,
  ReferenceBlock,
  PlaybookTemplate,
  VerificationStrategy,
  ForgeCraftConfig,
} from "../shared/types.js";
import {
  TIER_HIERARCHY,
  DEFAULT_TIER,
  isTierAllowed,
  isBlockAllowed,
  normalizeTagOrder,
} from "./composer-helpers.js";

const logger = createLogger("registry/composer");

/** Composed output for a set of active tags. */
export interface ComposedTemplates {
  readonly instructionBlocks: InstructionBlock[];
  readonly structureEntries: StructureEntry[];
  readonly nfrBlocks: NfrBlock[];
  readonly hooks: HookTemplate[];
  readonly skills: SkillTemplate[];
  readonly reviewBlocks: ReviewBlock[];
  readonly referenceBlocks: ReferenceBlock[];
  /** Playbooks for each active tag that has one. On-demand expert workflow sequences. */
  readonly playbooks: PlaybookTemplate[];
  /** Verification strategies for each active tag that has one. On-demand uncertainty-aware verification plans. */
  readonly verificationStrategies: VerificationStrategy[];
  /**
   * @deprecated Use `instructionBlocks` instead. Alias for backward compatibility.
   */
  readonly claudeMdBlocks: InstructionBlock[];
}

/** Options for controlling template composition. */
export interface ComposeOptions {
  /** ForgeCraft project config with tier preferences and include/exclude. */
  readonly config?: ForgeCraftConfig;
}

/**
 * Compose templates for a given set of active tags.
 * UNIVERSAL is always included first regardless of whether it's in the tags list.
 *
 * @param activeTags - Tags to compose for
 * @param allTemplates - Full template map from the loader
 * @param options - Optional composition config (tier filtering, include/exclude)
 * @returns Composed and filtered templates
 */
export function composeTemplates(
  activeTags: Tag[],
  allTemplates: Map<Tag, TagTemplateSet>,
  options?: ComposeOptions,
): ComposedTemplates {
  const config = options?.config;
  const tierLevel = config?.tier ?? DEFAULT_TIER;
  const allowedTiers = new Set(TIER_HIERARCHY[tierLevel]);
  const includeList = config?.include;
  const excludeList = config?.exclude;

  // Ensure UNIVERSAL is first and present
  const orderedTags = normalizeTagOrder(activeTags);

  const instructionBlocks: InstructionBlock[] = [];
  const structureEntries: StructureEntry[] = [];
  const nfrBlocks: NfrBlock[] = [];
  const hooks: HookTemplate[] = [];
  const skills: SkillTemplate[] = [];
  const reviewBlocks: ReviewBlock[] = [];
  const referenceBlocks: ReferenceBlock[] = [];
  const playbooks: PlaybookTemplate[] = [];
  const verificationStrategies: VerificationStrategy[] = [];

  const seenBlockIds = new Set<string>();
  const seenPaths = new Set<string>();
  const seenHookNames = new Set<string>();
  const seenSkillIds = new Set<string>();
  const seenNfrIds = new Set<string>();
  const seenReviewIds = new Set<string>();
  const seenReferenceIds = new Set<string>();

  for (const tag of orderedTags) {
    const templateSet = allTemplates.get(tag);
    if (!templateSet) {
      logger.warn("No templates found for tag", { tag });
      continue;
    }

    // Compose instruction blocks (deduplicate by id, filter by tier)
    const instrSource = templateSet.instructions ?? templateSet.claudeMd;
    if (instrSource?.blocks) {
      for (const block of instrSource.blocks) {
        if (
          !seenBlockIds.has(block.id) &&
          isTierAllowed(block.tier, allowedTiers) &&
          isBlockAllowed(block.id, includeList, excludeList)
        ) {
          seenBlockIds.add(block.id);
          instructionBlocks.push(block);
        }
      }
    }

    // Compose structure entries (deduplicate by path — not tier-filtered)
    if (templateSet.structure?.entries) {
      for (const entry of templateSet.structure.entries) {
        if (!seenPaths.has(entry.path)) {
          seenPaths.add(entry.path);
          structureEntries.push(entry);
        }
      }
    }

    // Compose NFR blocks (deduplicate by id, filter by tier)
    if (templateSet.nfr?.blocks) {
      for (const block of templateSet.nfr.blocks) {
        if (
          !seenNfrIds.has(block.id) &&
          isTierAllowed(block.tier, allowedTiers) &&
          isBlockAllowed(block.id, includeList, excludeList)
        ) {
          seenNfrIds.add(block.id);
          nfrBlocks.push(block);
        }
      }
    }

    // Compose hooks (deduplicate by name — not tier-filtered)
    if (templateSet.hooks) {
      for (const hook of templateSet.hooks) {
        if (!seenHookNames.has(hook.name)) {
          seenHookNames.add(hook.name);
          hooks.push(hook);
        }
      }
    }

    // Compose skills (deduplicate by id, filter by tier)
    if (templateSet.skills) {
      for (const skill of templateSet.skills) {
        if (
          !seenSkillIds.has(skill.id) &&
          isTierAllowed(skill.tier, allowedTiers) &&
          isBlockAllowed(skill.id, includeList, excludeList)
        ) {
          seenSkillIds.add(skill.id);
          skills.push(skill);
        }
      }
    }

    // Compose review blocks (deduplicate by id, filter by tier)
    if (templateSet.review?.blocks) {
      for (const block of templateSet.review.blocks) {
        if (
          !seenReviewIds.has(block.id) &&
          isTierAllowed(block.tier, allowedTiers) &&
          isBlockAllowed(block.id, includeList, excludeList)
        ) {
          seenReviewIds.add(block.id);
          reviewBlocks.push(block);
        }
      }
    }

    // Compose reference blocks (deduplicate by id — no tier filtering, always available on demand)
    if (templateSet.reference?.blocks) {
      for (const block of templateSet.reference.blocks) {
        if (!seenReferenceIds.has(block.id)) {
          seenReferenceIds.add(block.id);
          referenceBlocks.push(block);
        }
      }
    }

    // Collect playbooks (one per tag, on-demand — no deduplication needed)
    if (templateSet.playbook) {
      playbooks.push(templateSet.playbook);
    }

    // Collect verification strategies (one per tag, on-demand — no deduplication needed)
    if (templateSet.verification) {
      verificationStrategies.push(templateSet.verification);
    }
  }

  logger.info("Templates composed", {
    tags: orderedTags,
    tier: tierLevel,
    instructionBlocks: instructionBlocks.length,
    structureEntries: structureEntries.length,
    nfrBlocks: nfrBlocks.length,
    hooks: hooks.length,
    skills: skills.length,
    reviewBlocks: reviewBlocks.length,
    referenceBlocks: referenceBlocks.length,
    playbooks: playbooks.length,
    verificationStrategies: verificationStrategies.length,
  });

  return {
    instructionBlocks,
    structureEntries,
    nfrBlocks,
    hooks,
    skills,
    reviewBlocks,
    referenceBlocks,
    playbooks,
    verificationStrategies,
    // Backward-compat alias
    claudeMdBlocks: instructionBlocks,
  };
}
