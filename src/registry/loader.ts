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
import { TemplateNotFoundError, TemplateParseError } from "../shared/errors/index.js";
import type {
  Tag,
  TagTemplateSet,
  InstructionTemplate,
  NfrTemplate,
  StructureTemplate,
  HookTemplate,
  ReviewTemplate,
  McpServersTemplate,
  ForgeCraftConfig,
} from "../shared/types.js";

const logger = createLogger("registry/loader");

/** Parsed hooks YAML file structure. */
interface HooksYamlFile {
  tag: string;
  section: "hooks";
  hooks: HookTemplate[];
}

/**
 * Resolve the templates directory path.
 * Uses FORGECRAFT_TEMPLATE_DIR env var if set, otherwise the package's built-in templates.
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

  throw new TemplateNotFoundError("templates", "Could not locate templates directory");
}

/**
 * Load all template sets from the templates directory.
 * Returns a map of tag → TagTemplateSet.
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
 * Load a single tag's template set from its directory.
 */
function loadTagTemplateSet(tag: Tag, tagDir: string): TagTemplateSet {
  let instructions: InstructionTemplate | undefined;
  let nfr: NfrTemplate | undefined;
  let structure: StructureTemplate | undefined;
  let hooks: HookTemplate[] | undefined;
  let review: ReviewTemplate | undefined;
  let mcpServers: McpServersTemplate | undefined;

  // Load instructions.yaml (formerly claude-md.yaml)
  const instructionsPath = join(tagDir, "instructions.yaml");
  if (existsSync(instructionsPath)) {
    instructions = loadYamlFile<InstructionTemplate>(instructionsPath);
  }

  // Backward compat: try claude-md.yaml if instructions.yaml not found
  if (!instructions) {
    const legacyPath = join(tagDir, "claude-md.yaml");
    if (existsSync(legacyPath)) {
      instructions = loadYamlFile<InstructionTemplate>(legacyPath);
    }
  }

  // Load nfr.yaml
  const nfrPath = join(tagDir, "nfr.yaml");
  if (existsSync(nfrPath)) {
    nfr = loadYamlFile<NfrTemplate>(nfrPath);
  }

  // Load structure.yaml
  const structurePath = join(tagDir, "structure.yaml");
  if (existsSync(structurePath)) {
    structure = loadYamlFile<StructureTemplate>(structurePath);
  }

  // Load hooks.yaml
  const hooksPath = join(tagDir, "hooks.yaml");
  if (existsSync(hooksPath)) {
    const hooksFile = loadYamlFile<HooksYamlFile>(hooksPath);
    hooks = hooksFile.hooks;
  }

  // Load review.yaml
  const reviewPath = join(tagDir, "review.yaml");
  if (existsSync(reviewPath)) {
    review = loadYamlFile<ReviewTemplate>(reviewPath);
  }

  // Load mcp-servers.yaml
  const mcpServersPath = join(tagDir, "mcp-servers.yaml");
  if (existsSync(mcpServersPath)) {
    mcpServers = loadYamlFile<McpServersTemplate>(mcpServersPath);
  }

  return { tag, instructions, nfr, structure, hooks, review, mcpServers };
}

/**
 * Load and parse a single YAML template file.
 */
function loadYamlFile<T>(filePath: string): T {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = yaml.load(content) as T;
    if (!parsed) {
      throw new TemplateParseError(filePath, "YAML parsed to null/undefined");
    }
    return parsed;
  } catch (error) {
    if (error instanceof TemplateParseError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new TemplateParseError(filePath, message);
  }
}

/**
 * Convert a directory name to a Tag enum value.
 * Directory names use lowercase-kebab (e.g., "web-react"), tags use UPPER-KEBAB.
 */
function tagDirNameToTag(dirName: string): Tag | null {
  const mapping: Record<string, Tag> = {
    universal: "UNIVERSAL",
    "web-react": "WEB-REACT",
    "web-static": "WEB-STATIC",
    api: "API",
    "data-pipeline": "DATA-PIPELINE",
    ml: "ML",
    healthcare: "HEALTHCARE",
    fintech: "FINTECH",
    web3: "WEB3",
    realtime: "REALTIME",
    "state-machine": "STATE-MACHINE",
    game: "GAME",
    social: "SOCIAL",
    cli: "CLI",
    library: "LIBRARY",
    infra: "INFRA",
    mobile: "MOBILE",
    analytics: "ANALYTICS",
    hipaa: "HIPAA",
    soc2: "SOC2",
    "data-lineage": "DATA-LINEAGE",
    "observability-xray": "OBSERVABILITY-XRAY",
    "medallion-architecture": "MEDALLION-ARCHITECTURE",
    "zero-trust": "ZERO-TRUST",
  };
  return mapping[dirName] ?? null;
}

/**
 * Convert a Tag to its directory name.
 */
export function tagToDirName(tag: Tag): string {
  return tag.toLowerCase();
}

/**
 * Load user overrides from forgecraft.yaml or .forgecraft.json in the project directory.
 * Prefers forgecraft.yaml over .forgecraft.json.
 * Returns null if no config file exists.
 */
export function loadUserOverrides(
  projectDir: string,
): ForgeCraftConfig | null {
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
      logger.warn("Community template directory not found, skipping", { dir: resolvedDir });
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

      // Merge each template section additively
      const merged: TagTemplateSet = {
        tag,
        instructions: mergeInstructionTemplates(baseSet.instructions, extraSet.instructions),
        nfr: mergeNfrTemplates(baseSet.nfr, extraSet.nfr),
        structure: extraSet.structure ?? baseSet.structure,
        hooks: mergeHookTemplates(baseSet.hooks, extraSet.hooks),
        review: mergeReviewTemplates(baseSet.review, extraSet.review),
        mcpServers: mergeMcpServersTemplates(baseSet.mcpServers, extraSet.mcpServers),
      };
      base.set(tag, merged);
    }
  }

  return base;
}

/**
 * Merge two InstructionTemplates, appending non-duplicate blocks from the extra template.
 */
function mergeInstructionTemplates(
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
 */
function mergeNfrTemplates(
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
 */
function mergeHookTemplates(
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
 * Merge two ReviewTemplates, appending non-duplicate blocks.
 */
function mergeReviewTemplates(
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
 * Merge two McpServersTemplates, appending non-duplicate servers by name.
 */
function mergeMcpServersTemplates(
  base: McpServersTemplate | undefined,
  extra: McpServersTemplate | undefined,
): McpServersTemplate | undefined {
  if (!extra) return base;
  if (!base) return extra;
  const seenNames = new Set(base.servers.map((s) => s.name));
  const newServers = extra.servers.filter((s) => !seenNames.has(s.name));
  return { ...base, servers: [...base.servers, ...newServers] };
}
