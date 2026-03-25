/**
 * Template merge helpers.
 *
 * Additive merge functions for combining built-in and community template sections.
 * Later (community/local) templates extend earlier (built-in) ones without replacing them.
 */

import type {
  InstructionTemplate,
  NfrTemplate,
  HookTemplate,
  SkillTemplate,
  ReviewTemplate,
  ReferenceTemplate,
  McpServersTemplate,
} from "../shared/types.js";

/**
 * Merge two InstructionTemplates, appending non-duplicate blocks from the extra template.
 *
 * @param base - Base template (built-in)
 * @param extra - Extra template (community/local override)
 * @returns Merged template, or the non-null one if the other is undefined
 */
export function mergeInstructionTemplates(
  base: InstructionTemplate | undefined,
  extra: InstructionTemplate | undefined,
): InstructionTemplate | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenIds = new Set(base.blocks.map((b) => b.id));
  const newBlocks = extra.blocks.filter((b) => !seenIds.has(b.id));
  return { ...base, blocks: [...base.blocks, ...newBlocks] };
}

/**
 * Merge two NfrTemplates, appending non-duplicate blocks.
 *
 * @param base - Base template (built-in)
 * @param extra - Extra template (community/local override)
 * @returns Merged template
 */
export function mergeNfrTemplates(
  base: NfrTemplate | undefined,
  extra: NfrTemplate | undefined,
): NfrTemplate | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenIds = new Set(base.blocks.map((b) => b.id));
  const newBlocks = extra.blocks.filter((b) => !seenIds.has(b.id));
  return { ...base, blocks: [...base.blocks, ...newBlocks] };
}

/**
 * Merge two hook template arrays, appending non-duplicate hooks.
 *
 * @param base - Base hooks (built-in)
 * @param extra - Extra hooks (community/local override)
 * @returns Merged hook array
 */
export function mergeHookTemplates(
  base: HookTemplate[] | undefined,
  extra: HookTemplate[] | undefined,
): HookTemplate[] | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenNames = new Set(base.map((h) => h.name));
  const newHooks = extra.filter((h) => !seenNames.has(h.name));
  return [...base, ...newHooks];
}

/**
 * Merge two skill template arrays, appending non-duplicate skills by id.
 *
 * @param base - Base skills (built-in)
 * @param extra - Extra skills (community/local override)
 * @returns Merged skill array
 */
export function mergeSkillTemplates(
  base: SkillTemplate[] | undefined,
  extra: SkillTemplate[] | undefined,
): SkillTemplate[] | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenIds = new Set(base.map((s) => s.id));
  const newSkills = extra.filter((s) => !seenIds.has(s.id));
  return [...base, ...newSkills];
}

/**
 * Merge two ReviewTemplates, appending non-duplicate blocks.
 *
 * @param base - Base template (built-in)
 * @param extra - Extra template (community/local override)
 * @returns Merged template
 */
export function mergeReviewTemplates(
  base: ReviewTemplate | undefined,
  extra: ReviewTemplate | undefined,
): ReviewTemplate | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenIds = new Set(base.blocks.map((b) => b.id));
  const newBlocks = extra.blocks.filter((b) => !seenIds.has(b.id));
  return { ...base, blocks: [...base.blocks, ...newBlocks] };
}

/**
 * Merge two ReferenceTemplates, appending non-duplicate blocks.
 *
 * @param base - Base template (built-in)
 * @param extra - Extra template (community/local override)
 * @returns Merged template
 */
export function mergeReferenceTemplates(
  base: ReferenceTemplate | undefined,
  extra: ReferenceTemplate | undefined,
): ReferenceTemplate | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenIds = new Set(base.blocks.map((b) => b.id));
  const newBlocks = extra.blocks.filter((b) => !seenIds.has(b.id));
  return { ...base, blocks: [...base.blocks, ...newBlocks] };
}

/**
 * Merge two McpServersTemplates, appending non-duplicate servers by name.
 *
 * @param base - Base template (built-in)
 * @param extra - Extra template (community/local override)
 * @returns Merged template
 */
export function mergeMcpServersTemplates(
  base: McpServersTemplate | undefined,
  extra: McpServersTemplate | undefined,
): McpServersTemplate | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenNames = new Set(base.servers.map((s) => s.name));
  const newServers = extra.servers.filter((s) => !seenNames.has(s.name));
  return { ...base, servers: [...base.servers, ...newServers] };
}
