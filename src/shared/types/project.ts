/**
 * Project-level type definitions: tags, project config, scaffold, audit, hooks,
 * output targets, and content tiers.
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
  "DOCS",
  "DATABASE",
  "AUTH",
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

/**
 * Language-agnostic tool command configuration.
 * Each field is the shell command to run for that gate.
 * If absent, the corresponding hook warns but does not block.
 */
export interface ProjectToolsConfig {
  /** Run the test suite. e.g. "npm test", "pytest", "go test ./...", "cargo test" */
  readonly test?: string;
  /** Type check / compile. e.g. "npx tsc --noEmit", "mypy src/", "go build ./...", "cargo check" */
  readonly typecheck?: string;
  /** Lint. e.g. "npm run lint", "ruff check .", "golangci-lint run", "clippy" */
  readonly lint?: string;
  /** Mutation testing. e.g. "npx stryker run", "mutmut run", "pitest", "gremlins.io" */
  readonly mutation?: string;
  /** Dependency audit. e.g. "npm audit --audit-level=high", "pip-audit", "govulncheck ./...", "cargo audit" */
  readonly audit?: string;
  /** Layer boundary check. e.g. "npx madge --circular src/" or language-equivalent */
  readonly layercheck?: string;
}

/**
 * Deployment environment configuration for a single environment.
 */
export interface DeploymentEnvironmentConfig {
  /** Provider name. e.g. "railway", "fly", "render", "aws-ecs", "k8s", "custom" */
  readonly provider: string;
  /** Base URL of the deployed service. e.g. "https://myapp.railway.app" */
  readonly url?: string;
  /** Health check endpoint path. Defaults to "/health". */
  readonly health?: string;
}

/**
 * Load test parameters — stated before the test runs, not after.
 */
export interface LoadTestConfig {
  /** Tool to use. e.g. "k6", "artillery", "locust", "custom" */
  readonly tool?: string;
  /** Target concurrent users / virtual users */
  readonly concurrentUsers?: number;
  /** Target requests per second */
  readonly targetRps?: number;
  /** p99 latency ceiling in milliseconds */
  readonly p99CeilingMs?: number;
  /** Test duration in seconds. Defaults to 600 (10 min). */
  readonly durationSeconds?: number;
}

/**
 * Deployment and full-cycle testing configuration.
 * When present, scaffold generates smoke/load test stubs and a deployment domain in sentinel.
 */
export interface ProjectDeploymentConfig {
  readonly environments?: Record<string, DeploymentEnvironmentConfig>;
  readonly testing?: {
    /** Smoke test tool. e.g. "newman", "hurl", "k6", "custom" */
    readonly smokeTool?: string;
    readonly load?: LoadTestConfig;
    readonly syntheticData?: {
      readonly enabled: boolean;
      /** Path to synthetic data spec. e.g. "docs/synthetic-data-spec.md" */
      readonly specPath?: string;
    };
  };
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
  readonly trigger: "pre-commit" | "pre-exec" | "pre-push" | "commit-msg";
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
export const CONTENT_TIERS: readonly ContentTier[] = [
  "core",
  "recommended",
  "optional",
] as const;

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
export function resolveOutputPath(
  projectDir: string,
  target: OutputTarget,
): string {
  const config = OUTPUT_TARGET_CONFIGS[target];
  if (config.directory) {
    return `${projectDir}/${config.directory}/${config.filename}`;
  }
  return `${projectDir}/${config.filename}`;
}
