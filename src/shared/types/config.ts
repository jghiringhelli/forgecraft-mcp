/**
 * Project configuration types: ForgeCraftConfig, cascade decisions, and experiment config.
 */

import type {
  Tag,
  ContentTier,
  OutputTarget,
  ProjectDeploymentConfig,
  ProjectToolsConfig,
} from "./project.js";
import type { McpServerConfig } from "./mcp.js";

/**
 * Configuration for an active experiment run (e.g. a DX workshop cohort).
 * When present in forgecraft.yaml, close_cycle auto-contributes gates and
 * labels them with the experiment id.
 */
export interface ExperimentConfig {
  /** Short identifier for this experiment run, e.g. "dx-2026-vaquita". Used as label on gate contributions. */
  readonly id: string;
  /** Project type being tested */
  readonly type: "greenfield" | "brownfield" | "takeover" | "migration";
  /** Which group this participant is in */
  readonly group: "gs" | "control";
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
  /**
   * When true, apply compact post-processing to all generated instruction files:
   * strips explanatory tail clauses from bullet points and deduplicates identical lines.
   * Reduces token count by ~20-40%. Recommended for projects with 3+ tags.
   */
  readonly compact?: boolean;
  /**
   * Current release cycle phase. Controls which test gates are shown as required
   * vs. advisory in generated instruction files.
   * Options: development (default), pre-release, release-candidate, production.
   */
  readonly releasePhase?:
    | "development"
    | "pre-release"
    | "release-candidate"
    | "production";
  /** Language-agnostic tool commands. Used by hooks to avoid hardcoding npm/npx. */
  readonly tools?: ProjectToolsConfig;
  /** Deployment environments and full-cycle testing config. When present, scaffold generates test stubs. */
  readonly deployment?: ProjectDeploymentConfig;
  /** If true, gates marked generalizable: true are queued for community contribution. */
  readonly contribute_gates?: boolean;
  /** URL for the remote quality-gates registry. Defaults to the public genspec-dev registry. */
  readonly gates_registry_url?: string;
  /** URL for the forgecraft-server API. Used by contribute-gate tool. */
  readonly server_url?: string;
  /** AI-assessed cascade decisions — which spec artifacts are required for this project. */
  readonly cascade?: {
    readonly steps: CascadeDecision[];
  };
  /** Optional experiment metadata. When present, close_cycle auto-contributes gates with this id as label. */
  readonly experiment?: ExperimentConfig;
  /**
   * When true, the project was detected as brownfield (existing source code, no substantial spec).
   * setup_project writes this flag and uses brownfield calibration questions.
   */
  readonly brownfield?: boolean;
}

// ── Cascade Decisions ────────────────────────────────────────────────

/**
 * The canonical step names for the five GS initialization cascade steps.
 * Maps to the five artifact checks in check-cascade.ts.
 */
export type CascadeStepName =
  | "functional_spec"
  | "architecture_diagrams"
  | "constitution"
  | "adrs"
  | "behavioral_contracts";

/**
 * A per-step decision: required or optional, with rationale and provenance.
 * Written to forgecraft.yaml under cascade.steps by scaffold or set_cascade_requirement.
 * The AI is the brain — it decides; the tool enforces only what was decided.
 */
export interface CascadeDecision {
  /** Which cascade step this decision applies to. */
  readonly step: CascadeStepName;
  /** Whether this step must pass before implementation begins. */
  readonly required: boolean;
  /** Human-readable rationale for the decision. */
  readonly rationale: string;
  /** ISO 8601 date when this decision was recorded. */
  readonly decidedAt: string;
  /** Who made this decision. */
  readonly decidedBy: "scaffold" | "assistant" | "user";
}
