/**
 * Shared type definitions for the ForgeCraft MCP server.
 *
 * All tags, project configuration, tool inputs/outputs, and template
 * structures are defined here as the single source of truth.
 */

/** All supported project classification tags. */
export const ALL_TAGS = [
  "UNIVERSAL",
  "WEB-REACT",
  "WEB-STATIC",
  "API",
  "DATA-PIPELINE",
  "ML",
  "HEALTHCARE",
  "FINTECH",
  "WEB3",
  "REALTIME",
  "STATE-MACHINE",
  "GAME",
  "SOCIAL",
  "CLI",
  "LIBRARY",
  "INFRA",
  "MOBILE",
  "ANALYTICS",
  "HIPAA",
  "SOC2",
  "DATA-LINEAGE",
  "OBSERVABILITY-XRAY",
  "MEDALLION-ARCHITECTURE",
  "ZERO-TRUST",
] as const;

export type Tag = (typeof ALL_TAGS)[number];

/** Description metadata for a single tag. */
export interface TagInfo {
  readonly tag: Tag;
  readonly description: string;
  readonly appliesWhen: string;
}

/** Result of project classification analysis. */
export interface ClassifyResult {
  readonly suggestedTags: Tag[];
  readonly detectedFromCode: Record<
    string,
    { confidence: number; evidence: string[] }
  >;
  readonly detectedFromDescription: Record<
    string,
    { confidence: number; evidence: string[] }
  >;
  readonly availableTags: readonly Tag[];
  readonly requiresConfirmation: boolean;
}

/** Configuration for scaffolding a project. */
export interface ScaffoldOptions {
  readonly tags: Tag[];
  readonly language: "typescript" | "python";
  readonly projectName: string;
  readonly includeMcpConfig?: boolean;
  readonly includeCiCd?: "github-actions" | "none";
  readonly includeDocker?: boolean;
}

/** Result of a scaffold operation. */
export interface ScaffoldResult {
  readonly filesCreated: string[];
  readonly mcpServersConfigured: string[];
  readonly nextSteps: string[];
  readonly restartRequired: boolean;
}

/** Result of a project audit. */
export interface AuditResult {
  readonly score: number;
  readonly passing: AuditCheck[];
  readonly failing: AuditCheck[];
  readonly recommendations: string[];
}

/** A single audit check result. */
export interface AuditCheck {
  readonly check: string;
  readonly message: string;
  readonly severity?: "error" | "warning" | "info";
}

/** Information about an available hook. */
export interface HookInfo {
  readonly name: string;
  readonly tag: Tag;
  readonly trigger: "pre-commit" | "pre-exec" | "pre-push";
  readonly description: string;
  readonly filename: string;
}

/**
 * Content tier controlling automatic inclusion behavior.
 * - core: Always included. Non-negotiable engineering standards.
 * - recommended: Included by default. User can opt out via config.
 * - optional: Only included when user explicitly opts in.
 */
export type ContentTier = "core" | "recommended" | "optional";

/** All valid content tiers as a constant array for schema validation. */
export const CONTENT_TIERS: readonly ContentTier[] = ["core", "recommended", "optional"] as const;

// ── Output Targets ───────────────────────────────────────────────────

/**
 * Supported AI assistant output targets.
 * Each target maps to a specific instruction file format.
 */
export const ALL_OUTPUT_TARGETS = [
  "claude",
  "cursor",
  "copilot",
  "windsurf",
  "cline",
  "aider",
] as const;

export type OutputTarget = (typeof ALL_OUTPUT_TARGETS)[number];

/** Configuration for a specific output target. */
export interface OutputTargetConfig {
  /** Target identifier. */
  readonly target: OutputTarget;
  /** Output filename (e.g., "CLAUDE.md", ".cursorrules"). */
  readonly filename: string;
  /** Subdirectory relative to project root, if any (e.g., ".github" for copilot, ".cursor/rules" for cursor). */
  readonly directory?: string;
  /** Heading used at the top of the generated file. */
  readonly heading: string;
  /** Human-readable display name for the AI tool. */
  readonly displayName: string;
  /** Whether the target uses frontmatter metadata (e.g., Cursor .mdc files). */
  readonly usesFrontmatter?: boolean;
}

/** Registry of all supported output target configurations. */
export const OUTPUT_TARGET_CONFIGS: Record<OutputTarget, OutputTargetConfig> = {
  claude: {
    target: "claude",
    filename: "CLAUDE.md",
    heading: "# CLAUDE.md",
    displayName: "Claude Code",
  },
  cursor: {
    target: "cursor",
    filename: "project-standards.mdc",
    directory: ".cursor/rules",
    heading: "# Project Standards",
    displayName: "Cursor",
    usesFrontmatter: true,
  },
  copilot: {
    target: "copilot",
    filename: "copilot-instructions.md",
    directory: ".github",
    heading: "# Copilot Instructions",
    displayName: "GitHub Copilot",
  },
  windsurf: {
    target: "windsurf",
    filename: ".windsurfrules",
    heading: "# Windsurf Rules",
    displayName: "Windsurf",
  },
  cline: {
    target: "cline",
    filename: ".clinerules",
    heading: "# Cline Rules",
    displayName: "Cline",
  },
  aider: {
    target: "aider",
    filename: "CONVENTIONS.md",
    heading: "# CONVENTIONS.md",
    displayName: "Aider",
  },
};

/** Default output target when none specified. */
export const DEFAULT_OUTPUT_TARGET: OutputTarget = "claude";

/**
 * Resolve the full output file path for a target relative to project root.
 *
 * @param projectDir - Absolute path to project root
 * @param target - The output target
 * @returns Absolute path to the instruction file
 */
export function resolveOutputPath(projectDir: string, target: OutputTarget): string {
  const config = OUTPUT_TARGET_CONFIGS[target];
  if (config.directory) {
    return `${projectDir}/${config.directory}/${config.filename}`;
  }
  return `${projectDir}/${config.filename}`;
}

// ── Instruction Blocks (formerly ClaudeMdBlock) ──────────────────────

/** An instruction content block from a template. */
export interface InstructionBlock {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tier?: ContentTier;
}

/** A template YAML file structure for instruction content. */
export interface InstructionTemplate {
  readonly tag: Tag;
  readonly section: "instructions";
  readonly blocks: InstructionBlock[];
}

/**
 * @deprecated Use InstructionBlock instead. Alias kept for backward compatibility.
 */
export type ClaudeMdBlock = InstructionBlock;

/**
 * @deprecated Use InstructionTemplate instead. Alias kept for backward compatibility.
 */
export type ClaudeMdTemplate = InstructionTemplate;

/** A folder/file entry in a structure template. */
export interface StructureEntry {
  readonly path: string;
  readonly type: "directory" | "file";
  readonly description?: string;
  readonly template?: string;
}

/** A structure template for a tag. */
export interface StructureTemplate {
  readonly tag: Tag;
  readonly section: "structure";
  readonly language?: "typescript" | "python" | "both";
  readonly entries: StructureEntry[];
}

/** An NFR (Non-Functional Requirement) block. */
export interface NfrBlock {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tier?: ContentTier;
}

/** An NFR template for a tag. */
export interface NfrTemplate {
  readonly tag: Tag;
  readonly section: "nfr";
  readonly blocks: NfrBlock[];
}

/** A design reference block (DDD, CQRS, GoF patterns) served on demand, not in instruction files. */
export interface ReferenceBlock {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

/** A reference template for a tag. */
export interface ReferenceTemplate {
  readonly tag: Tag;
  readonly section: "reference";
  readonly blocks: ReferenceBlock[];
}

/** Hook template definition. */
export interface HookTemplate {
  readonly name: string;
  readonly trigger: "pre-commit" | "pre-exec" | "pre-push";
  readonly description: string;
  readonly filename: string;
  readonly script: string;
}

/** Review dimension (section) within a review template. */
export type ReviewDimension =
  | "architecture"
  | "code-quality"
  | "tests"
  | "performance";

/** A single checklist item within a review block. */
export interface ReviewChecklistItem {
  readonly id: string;
  readonly description: string;
  readonly severity: "critical" | "important" | "nice-to-have";
}

/** A review block — one dimension of a code review. */
export interface ReviewBlock {
  readonly id: string;
  readonly dimension: ReviewDimension;
  readonly title: string;
  readonly description: string;
  readonly checklist: ReviewChecklistItem[];
  readonly tier?: ContentTier;
}

/** A review template for a tag. */
export interface ReviewTemplate {
  readonly tag: Tag;
  readonly section: "review";
  readonly blocks: ReviewBlock[];
}

/** Result of a review_project tool call. */
export interface ReviewResult {
  readonly tags: Tag[];
  readonly scope: "comprehensive" | "focused";
  readonly dimensions: ReviewDimensionOutput[];
  readonly issueFormat: string;
}

/** Output for a single review dimension. */
export interface ReviewDimensionOutput {
  readonly dimension: ReviewDimension;
  readonly title: string;
  readonly checklist: ReviewChecklistItem[];
}

/** Complete template set for a tag. */
export interface TagTemplateSet {
  readonly tag: Tag;
  readonly instructions?: InstructionTemplate;
  readonly nfr?: NfrTemplate;
  readonly structure?: StructureTemplate;
  readonly hooks?: HookTemplate[];
  readonly review?: ReviewTemplate;
  readonly mcpServers?: McpServersTemplate;
  readonly reference?: ReferenceTemplate;
  /**
   * @deprecated Use `instructions` instead. Alias kept for backward compatibility.
   */
  readonly claudeMd?: InstructionTemplate;
}

/** Module scaffold configuration. */
export interface ModuleConfig {
  readonly moduleName: string;
  readonly tags: Tag[];
  readonly language: "typescript" | "python";
}

/** MCP server configuration for .claude/settings.json. */
export interface McpServerConfig {
  readonly command: string;
  readonly args: string[];
  readonly env?: Record<string, string>;
}

// ── MCP Server Discovery Types ───────────────────────────────────────

/** Category grouping for MCP server recommendations. */
export type McpServerCategory =
  | "scaffolding"
  | "code-search"
  | "testing"
  | "debugging"
  | "devtools"
  | "deployment"
  | "database"
  | "documentation"
  | "game-engine"
  | "ai-ml"
  | "monitoring"
  | "general";

/** An MCP server entry in a curated registry YAML file. */
export interface McpServerEntry {
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: string[];
  readonly env?: Record<string, string>;
  readonly tags: Tag[];
  readonly category: McpServerCategory;
  readonly url?: string;
  /** Content tier for token budget control. Defaults to "recommended" if omitted. */
  readonly tier?: ContentTier;
}

/** Shape of the mcp-servers.yaml template file. */
export interface McpServersTemplate {
  readonly tag: Tag;
  readonly section: "mcp-servers";
  readonly servers: McpServerEntry[];
}

/** Source of a discovered MCP server recommendation. */
export type McpServerSource = "built-in" | "community" | "remote";

/** A recommended MCP server with discovery metadata. */
export interface McpServerRecommendation {
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: string[];
  readonly env?: Record<string, string>;
  readonly relevantTags: Tag[];
  readonly category: McpServerCategory;
  readonly url?: string;
  readonly source: McpServerSource;
  /** Content tier for token budget control. Defaults to "recommended" if omitted. */
  readonly tier?: ContentTier;
}

/** Options for controlling MCP server discovery behavior. */
export interface McpDiscoveryOptions {
  /** Whether to also fetch from a remote registry. Defaults to false. */
  readonly includeRemote?: boolean;
  /** Override the default remote registry URL. */
  readonly remoteRegistryUrl?: string;
  /** Request timeout in milliseconds for remote fetches. Defaults to 5000. */
  readonly remoteTimeoutMs?: number;
}

/** User override configuration from forgecraft.yaml / .forgecraft.json. */
export interface ForgeCraftConfig {
  /** Human-readable project name. */
  readonly projectName?: string;
  /** Active project tags. */
  readonly tags?: Tag[];
  /** Content tier preference: which tiers to auto-include. */
  readonly tier?: ContentTier;
  /** Output targets: which AI assistant instruction files to generate. Defaults to ['claude']. */
  readonly outputTargets?: OutputTarget[];
  /** Specific block IDs to always include regardless of tier. */
  readonly include?: string[];
  /** Specific block IDs to always exclude regardless of tier. */
  readonly exclude?: string[];
  /** Additional template directories (community packs, local overrides). */
  readonly templateDirs?: string[];
  /** Variable overrides for template rendering. */
  readonly variables?: Record<string, string | number | boolean>;
  /** Override or extend configuration per block ID. */
  readonly overrides?: Record<string, Record<string, unknown>>;
  /** Custom hooks to add beyond template-provided ones. */
  readonly customHooks?: Array<{
    name: string;
    trigger: string;
    script: string;
  }>;
  /** Custom MCP servers to configure. */
  readonly customMcpServers?: Record<string, McpServerConfig>;
  /** Hooks to disable by name. */
  readonly disabledHooks?: string[];
  /** Additional tags beyond auto-detected ones. */
  readonly additionalTags?: Tag[];
}
