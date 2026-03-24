/**
 * Tag-level template loading helpers.
 *
 * Handles per-tag template directory loading, YAML file parsing,
 * and tag name ↔ directory name conversion.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { TemplateParseError } from "../shared/errors/index.js";
import type {
  Tag,
  TagTemplateSet,
  InstructionTemplate,
  NfrTemplate,
  StructureTemplate,
  HookTemplate,
  SkillTemplate,
  ReviewTemplate,
  McpServersTemplate,
  ReferenceTemplate,
  PlaybookTemplate,
  VerificationStrategy,
} from "../shared/types.js";

/** Parsed hooks YAML file structure. */
interface HooksYamlFile {
  tag: string;
  section: "hooks";
  hooks: HookTemplate[];
}

/** Parsed skills YAML file structure. */
interface SkillsYamlFile {
  tag: string;
  section: "skills";
  skills: SkillTemplate[];
}

/**
 * Load a single tag's template set from its directory.
 *
 * @param tag - The tag being loaded
 * @param tagDir - Absolute path to the tag directory
 * @returns Assembled TagTemplateSet
 */
export function loadTagTemplateSet(tag: Tag, tagDir: string): TagTemplateSet {
  let instructions: InstructionTemplate | undefined;
  let nfr: NfrTemplate | undefined;
  let structure: StructureTemplate | undefined;
  let hooks: HookTemplate[] | undefined;
  let skills: SkillTemplate[] | undefined;
  let review: ReviewTemplate | undefined;
  let mcpServers: McpServersTemplate | undefined;
  let reference: ReferenceTemplate | undefined;
  let playbook: PlaybookTemplate | undefined;
  let verification: VerificationStrategy | undefined;

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

  // Load skills.yaml
  const skillsPath = join(tagDir, "skills.yaml");
  if (existsSync(skillsPath)) {
    const skillsFile = loadYamlFile<SkillsYamlFile>(skillsPath);
    skills = skillsFile.skills;
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

  // Load reference.yaml (on-demand design patterns)
  const referencePath = join(tagDir, "reference.yaml");
  if (existsSync(referencePath)) {
    reference = loadYamlFile<ReferenceTemplate>(referencePath);
  }

  // Load playbook.yaml (on-demand expert workflow sequences)
  const playbookPath = join(tagDir, "playbook.yaml");
  if (existsSync(playbookPath)) {
    playbook = loadYamlFile<PlaybookTemplate>(playbookPath);
  }

  // Load verification.yaml (on-demand uncertainty-aware verification strategy)
  const verificationPath = join(tagDir, "verification.yaml");
  if (existsSync(verificationPath)) {
    verification = loadYamlFile<VerificationStrategy>(verificationPath);
  }

  return {
    tag,
    instructions,
    nfr,
    structure,
    hooks,
    skills,
    review,
    mcpServers,
    reference,
    playbook,
    verification,
  };
}

/**
 * Load and parse a single YAML template file.
 *
 * @param filePath - Absolute path to the YAML file
 * @returns Parsed and typed YAML content
 */
export function loadYamlFile<T>(filePath: string): T {
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
 *
 * @param dirName - Lowercase-kebab directory name
 * @returns Corresponding Tag, or null if unrecognized
 */
export function tagDirNameToTag(dirName: string): Tag | null {
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
 *
 * @param tag - The tag to convert
 * @returns Lowercase-kebab directory name
 */
export function tagToDirName(tag: Tag): string {
  return tag.toLowerCase();
}
