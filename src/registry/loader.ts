/**
 * Template registry loader.
 *
 * Loads YAML template files from the templates/ directory (shipped with the package)
 * and merges with any user overrides from .forgecraft.json.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createLogger } from "../shared/logger/index.js";
import { TemplateNotFoundError } from "../shared/errors/index.js";
import type { Tag, TagTemplateSet, ForgeCraftConfig } from "../shared/types.js";
import { loadTagTemplateSet, tagDirNameToTag } from "./loader-tag.js";
import {
  mergeInstructionTemplates,
  mergeNfrTemplates,
  mergeHookTemplates,
  mergeSkillTemplates,
  mergeReviewTemplates,
  mergeReferenceTemplates,
  mergeMcpServersTemplates,
} from "./loader-merge.js";

export { tagToDirName } from "./loader-tag.js";

const logger = createLogger("registry/loader");

/**
 * Resolve the templates directory path.
 * Uses FORGECRAFT_TEMPLATE_DIR env var if set, otherwise the package's built-in templates.
 *
 * @returns Absolute path to the templates directory
 */
export function resolveTemplatesDir(): string {
  const envDir = process.env["FORGECRAFT_TEMPLATE_DIR"];
  if (envDir && existsSync(envDir)) {
    return resolve(envDir);
  }

  // Resolve relative to this file's location in the package
  const thisDir = fileURLToPath(new URL(".", import.meta.url));
  // In dist/registry/loader.js → go up 2 levels to package root, then templates/
  const packageRoot = resolve(thisDir, "..", "..");
  const templatesDir = join(packageRoot, "templates");

  if (existsSync(templatesDir)) {
    return templatesDir;
  }

  // Fallback: maybe we're running from src/ during development
  const devTemplatesDir = join(packageRoot, "..", "templates");
  if (existsSync(devTemplatesDir)) {
    return devTemplatesDir;
  }

  throw new TemplateNotFoundError(
    "templates",
    "Could not locate templates directory",
  );
}

/**
 * Load all template sets from the templates directory.
 * Returns a map of tag → TagTemplateSet.
 *
 * @param templatesDir - Optional explicit templates directory path
 * @returns Map of tag to its full template set
 */
export function loadAllTemplates(
  templatesDir?: string,
): Map<Tag, TagTemplateSet> {
  const dir = templatesDir ?? resolveTemplatesDir();
  const result = new Map<Tag, TagTemplateSet>();

  const tagDirs = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const tagDirName of tagDirs) {
    const tag = tagDirNameToTag(tagDirName);
    if (!tag) {
      logger.warn("Unknown tag directory, skipping", { dir: tagDirName });
      continue;
    }

    const tagDir = join(dir, tagDirName);
    const templateSet = loadTagTemplateSet(tag, tagDir);
    result.set(tag, templateSet);
  }

  logger.info("Templates loaded", {
    tagCount: result.size,
    tags: Array.from(result.keys()),
  });

  return result;
}

/**
 * Load user overrides from forgecraft.yaml or .forgecraft.json in the project directory.
 * Prefers forgecraft.yaml over .forgecraft.json.
 * Returns null if no config file exists.
 *
 * @param projectDir - Absolute path to the project directory
 * @returns Parsed config, or null if not found
 */
export function loadUserOverrides(projectDir: string): ForgeCraftConfig | null {
  // Prefer YAML config
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const content = readFileSync(yamlPath, "utf-8");
      return yaml.load(content) as ForgeCraftConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Failed to parse forgecraft.yaml", { error: message });
      return null;
    }
  }

  // Fallback to JSON config
  const configPath = join(projectDir, ".forgecraft.json");
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ForgeCraftConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to parse .forgecraft.json", { error: message });
    return null;
  }
}

/**
 * Load templates from multiple directories and merge them.
 * Later directories override earlier ones (community/local override built-in).
 *
 * @param builtInDir - The built-in templates directory
 * @param extraDirs - Additional template directories from config
 * @returns Merged map of tag → TagTemplateSet
 */
export function loadAllTemplatesWithExtras(
  builtInDir?: string,
  extraDirs?: string[],
): Map<Tag, TagTemplateSet> {
  const base = loadAllTemplates(builtInDir);

  if (!extraDirs || extraDirs.length === 0) {
    return base;
  }

  for (const dir of extraDirs) {
    const resolvedDir = resolve(dir);
    if (!existsSync(resolvedDir)) {
      logger.warn("Community template directory not found, skipping", {
        dir: resolvedDir,
      });
      continue;
    }

    logger.info("Loading community templates", { dir: resolvedDir });
    const extra = loadAllTemplates(resolvedDir);

    // Merge: extra templates extend base templates (additive for blocks)
    for (const [tag, extraSet] of extra) {
      const baseSet = base.get(tag);
      if (!baseSet) {
        base.set(tag, extraSet);
        continue;
      }

      const merged: TagTemplateSet = {
        tag,
        instructions: mergeInstructionTemplates(
          baseSet.instructions,
          extraSet.instructions,
        ),
        nfr: mergeNfrTemplates(baseSet.nfr, extraSet.nfr),
        structure: extraSet.structure ?? baseSet.structure,
        hooks: mergeHookTemplates(baseSet.hooks, extraSet.hooks),
        skills: mergeSkillTemplates(baseSet.skills, extraSet.skills),
        review: mergeReviewTemplates(baseSet.review, extraSet.review),
        mcpServers: mergeMcpServersTemplates(
          baseSet.mcpServers,
          extraSet.mcpServers,
        ),
        reference: mergeReferenceTemplates(
          baseSet.reference,
          extraSet.reference,
        ),
      };
      base.set(tag, merged);
    }
  }

  return base;
}
