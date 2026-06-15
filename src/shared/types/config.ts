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
   * Tags the user explicitly removed via `refresh --remove-tags`. Tag inference
   * will NOT re-add these on subsequent refreshes (even if their dependency
   * signal is still present), so a deliberate removal stays removed. Re-adding a
   * tag via `refresh --add-tags` clears it from this list.
   */
  readonly rejectedTags?: Tag[];
  /**
   * Practitioner experience level. Controls verbosity of generated session prompts.
   * - `novice` (default): full methodology explanations, step-by-step instructions
   * - `experienced`: compact output — just commit sequence and test command; no methodology teaching
   */
  readonly practitioner_level?: "novice" | "experienced";
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
  /** URL for the remote quality-gates registry. Defaults to the public quality-gates registry. */
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
   * Generative-execution gate (FC-1) configuration. Auditable, file-based overrides
   * that allow a non-green UC to NOT block close_cycle, with a mandatory rationale.
   */
  readonly generative_execution?: {
    /** Per-UC overrides. An override with an empty/missing rationale is NOT valid. */
    readonly overrides?: ReadonlyArray<{
      /** Use-case id this override applies to, e.g. "UC-001". */
      readonly uc: string;
      /** Mandatory justification for why a non-green UC may pass the gate. */
      readonly rationale: string;
    }>;
  };
  /**
   * Static-analyzer gate (FC-2) configuration. Treats a set of static analyzers
   * (eslint, tsc, complexity, audit by default) as ONE structural-discipline
   * signal, evaluated at close_cycle. Green raises the probability of
   * structural-discipline conformance; it does not prove it — one signal
   * alongside the harness. Sonar/CodeClimate are optional config-gated plug-ins:
   * absent → skipped (never blocks). Analyzer commands resolve from `tools:`.
   */
  readonly static_analysis?: {
    /**
     * Analyzers to treat as the gate signal. Defaults (when omitted) to
     * ["eslint", "tsc", "complexity", "audit"].
     */
    readonly analyzers?: ReadonlyArray<string>;
    /** Threshold knobs surfaced to the analyzer hooks. */
    readonly thresholds?: {
      /** Maximum cyclomatic complexity per function. Default 10. */
      readonly complexity_max?: number;
      /** Minimum audit severity that blocks. Default "high". */
      readonly audit_level?: "low" | "moderate" | "high" | "critical";
    };
    /**
     * Per-analyzer overrides. An override with an empty/missing rationale is NOT
     * valid (mirrors generative_execution.overrides).
     */
    readonly overrides?: ReadonlyArray<{
      /** Analyzer this override excuses, e.g. "complexity". */
      readonly analyzer: string;
      /** Mandatory justification for why a failing analyzer may pass the gate. */
      readonly rationale: string;
    }>;
    /**
     * Optional SonarQube plug-in seam (DEFERRED). When this block is absent the
     * analyzer is skipped and never blocks. Real scanner invocation is a
     * documented extension point — the MVP only wires the absent → skip path.
     */
    readonly sonar?: Record<string, unknown>;
    /**
     * Optional Code Climate plug-in seam (DEFERRED). Same skip-if-absent
     * semantics as `sonar`.
     */
    readonly code_climate?: Record<string, unknown>;
  };
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
