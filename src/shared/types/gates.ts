/**
 * Quality gate type definitions: tool requirements, gate schema, and gate state.
 */

/**
 * A language-specific tool alternative for a quality gate.
 * When the project language matches, this tool is preferred.
 */
export interface ToolVariant {
  /** Language(s) this variant applies to. Lowercase: "python", "typescript", "go", "java", "rust" */
  readonly languages: readonly string[];
  /** The tool to use for these languages */
  readonly tool: ToolRequirement;
  /** Optional link to tool documentation or configuration guide */
  readonly documentationUrl?: string;
}

/**
 * Self-assessment of a quality gate against the five community convergence attributes
 * described in GS White Paper §10.2. Required for generalizable gates before
 * they can be merged into the community registry.
 *
 * The five attributes form the ratchet: a discipline that is prescriptive,
 * agnostic, validated, versioned, and quality-gated cannot regress.
 */
export interface ConvergenceAttributeCheck {
  /**
   * Gate gives clear, actionable instructions that narrow the specification space.
   * Advisory language ("consider", "may", "if applicable") is not prescriptive.
   * True when: the check produces a binary pass/fail with no human judgment required.
   */
  readonly prescriptive: boolean;
  /**
   * Gate is model-agnostic (works with Claude, GPT, Gemini, Cursor, etc.)
   * and is domain-agnostic (or correctly scoped if intentionally domain-specific).
   * True when: the gate does not reference a specific AI model or assume a domain
   * the project type doesn't declare.
   */
  readonly agnostic: boolean;
  /**
   * Gate's check and passCriterion are unambiguous and machine-evaluable.
   * True when: an automated runner can evaluate pass/fail without reading prose.
   * False when: the check says "review the output" with no concrete criterion.
   */
  readonly promptHealthy: boolean;
  /**
   * Gate produces consistent, idempotent results on re-run.
   * True when: running the gate twice on the same codebase returns the same result.
   * False when: the gate depends on timing, randomness, or external state.
   */
  readonly deterministic: boolean;
  /**
   * Applying this gate raises S_realized (closes a real specification gap).
   * True when: the gate enforces a constraint that, if absent, would cause a known class of defects.
   * False when: the gate is duplicated by an existing registry gate.
   */
  readonly convergent: boolean;
}

/**
 * A tool required by a quality gate to perform its check.
 */
export interface ToolRequirement {
  /** Tool name, e.g. "bandit", "eslint", "playwright" */
  readonly name: string;
  /** What this tool does in the context of this gate */
  readonly purpose: string;
  /** Install command, e.g. "pip install bandit" or "npm install --save-dev eslint-plugin-security" */
  readonly installCommand?: string;
  /** Package manager category */
  readonly category: "npm" | "pip" | "binary" | "mcp" | "cli";
  /** If false, gate can run without this tool at reduced coverage */
  readonly required: boolean;
}

/**
 * How a quality gate applies at a specific GS abstraction layer.
 * Mirrors the MCP tool description model: tells the AI when to activate this
 * gate and what it contributes to that layer's completeness.
 */
export interface GateLayerApplication {
  /** GS abstraction layer. L1=Blueprint, L2=Harness, L3=Environment, L4=Monitoring */
  readonly layer: "L1" | "L2" | "L3" | "L4";
  /**
   * How this gate applies at this layer — the enforcement mechanism.
   * What it contributes to the layer's completeness when it passes.
   * What it reveals as a gap when it fires.
   */
  readonly description: string;
  /**
   * Trigger condition at this layer — when the gate becomes relevant.
   * What must be true for this gate to fire or be meaningful here.
   */
  readonly when: string;
}

/**
 * A quality gate -- a named, evidence-backed check that defends a GS property.
 * Gates live in .forgecraft/gates/project/active|promoted|retired/ or .forgecraft/gates/registry/{tag}/.
 * One gate per YAML file, filename = gate ID.
 */
export interface ProjectGate {
  // ── Identity ─────────────────────────────────────────────────────────────
  /** Unique identifier. e.g. "check-engine-sha". Used as filename: {id}.yaml */
  readonly id: string;
  /** Human-readable title */
  readonly title: string;
  /** What this gate checks and why it matters */
  readonly description: string;

  // ── Classification ────────────────────────────────────────────────────────
  /**
   * Domain area this gate defends.
   * e.g. "simulation-integrity", "financial-invariants", "security",
   * "data-lineage", "api-contract", "test-quality", "dependency-health",
   * "environment-hygiene", "state-machine", "concurrency"
   */
  readonly domain: string;
  /**
   * GS abstraction layers this gate applies to, with per-layer context.
   * Absent means the gate is layer-agnostic.
   * Like MCP tool descriptions: tells the AI when and how to use this gate
   * at each layer of the automation ladder (L1 Blueprint → L2 Harness →
   * L3 Environment → L4 Monitoring).
   */
  readonly layers?: readonly GateLayerApplication[];
  /**
   * How this gate is implemented:
   * - logic: pure invariant check, no external tools
   * - process: workflow/procedure check
   * - tooled: requires installed tools (eslint, pytest, bandit)
   * - mcp: requires an MCP tool at runtime (playwright, codeseeker)
   * - cli: uses CLI commands (git, docker, code)
   */
  readonly implementation: "logic" | "process" | "tooled" | "mcp" | "cli";
  /**
   * Which GS property this gate defends.
   * One of: self-describing, bounded, verifiable, defended, auditable, composable, executable
   */
  readonly gsProperty: string;

  // ── Execution ─────────────────────────────────────────────────────────────
  /**
   * When this gate runs.
   * development: every commit; pre-release: before env promotion;
   * rc: release candidate gate; deployment: production gate; continuous: ongoing monitoring
   */
  readonly phase:
    | "development"
    | "pre-release"
    | "rc"
    | "deployment"
    | "continuous";
  /** Hook trigger: pre-commit, post-run, pre-push, pr, release, scheduled, close-cycle */
  readonly hook: string;
  /** OS scope. Defaults to cross-platform */
  readonly os: "windows" | "unix" | "cross-platform";
  /**
   * The check to perform. Language-agnostic description.
   * May include pseudocode, specific commands, or prose instructions.
   */
  readonly check: string;
  /** Positive assertion: what constitutes a pass */
  readonly passCriterion: string;
  /** Message shown to the developer/AI when this gate fires (failure case) */
  readonly failureMessage?: string;
  /** One-line remediation hint shown on failure */
  readonly fixHint?: string;
  /** Tools required to run this gate. Only for implementation: tooled | mcp | cli */
  readonly tools?: readonly ToolRequirement[];
  /**
   * Language-specific tool alternatives.
   * When the project's primary language matches one of the language entries,
   * the associated tool is preferred over the generic tools list for that gate.
   */
  readonly toolVariants?: readonly ToolVariant[];
  /**
   * File path patterns this gate applies to.
   * Absent means all files.
   */
  readonly paths?: {
    readonly include?: readonly string[];
    readonly exclude?: readonly string[];
  };
  /**
   * Configurable parameters with default values.
   * Projects can override defaults in their forgecraft.yaml.
   * e.g. { "threshold": "80", "max_lines": "50" }
   */
  readonly parameters?: Readonly<Record<string, string>>;

  // ── Scope ─────────────────────────────────────────────────────────────────
  /**
   * Project tags this gate applies to. e.g. ["FINTECH", "SIMULATION"]
   * Absent or empty means UNIVERSAL.
   */
  readonly tags?: readonly string[];
  /**
   * Language(s) this gate is specific to. e.g. "typescript", "python", ["typescript", "javascript"]
   * Absent means language-agnostic.
   */
  readonly language?: string | readonly string[];
  /**
   * Community-voted priority.
   * P0: blocking (fail = no deploy), P1: warning (fail = PR comment), P2: advisory
   */
  readonly priority?: "P0" | "P1" | "P2";
  /** Minimum tool/framework versions this gate requires. e.g. { "react": "18.0.0" } */
  readonly minVersion?: Readonly<Record<string, string>>;
  /** Maximum tool/framework versions this gate applies to (gate obsolete after this) */
  readonly maxVersion?: Readonly<Record<string, string>>;

  // ── Risk assessment ───────────────────────────────────────────────────────
  /** How often this gate fires on real projects */
  readonly likelihood?: "low" | "medium" | "high";
  /** How severe a failure is when this gate fires */
  readonly impact?: "low" | "medium" | "high";
  /** How reliable the detection is (low = more false positives) */
  readonly confidence?: "low" | "medium" | "high";

  // ── Standards references ──────────────────────────────────────────────────
  /** CWE identifiers. e.g. ["CWE-798: Hard-coded Credentials"] */
  readonly cwe?: readonly string[];
  /** OWASP Top 10 references. e.g. ["A07:2021 - Identification and Authentication Failures"] */
  readonly owasp?: readonly string[];
  /** Documentation URLs, CVEs, blog posts, tool docs */
  readonly references?: readonly string[];

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Lifecycle status. New gates start as beta, approved gates become ready */
  readonly status: "beta" | "ready" | "deprecated";
  /** ID of the gate that supersedes this one (when status: deprecated) */
  readonly deprecatedBy?: string;

  // ── Provenance ────────────────────────────────────────────────────────────
  /**
   * Whether this gate is useful to other projects and should be contributed to the community registry.
   * Requires opt-in contribute_gates setting in forgecraft.yaml.
   */
  readonly generalizable?: boolean;
  /**
   * Real-world evidence: the bug, incident, or near-miss this gate would have caught.
   * Required if generalizable: true. Makes the gate credible to reviewers.
   */
  readonly evidence?: string;
  /** Where this gate came from */
  readonly source: "registry" | "project";
  /** Who discovered this gate */
  readonly discoveredBy?: "ai" | "user";
  /** ISO timestamp when added */
  readonly addedAt: string;

  // ── Community flywheel admission ─────────────────────────────────────────
  /**
   * Self-assessment against the five community convergence attributes (GS White Paper §10.2).
   * Required for gates marked generalizable: true. Reviewed by maintainers before registry merge.
   */
  readonly convergenceAttributes?: ConvergenceAttributeCheck;
}

/** Gate filesystem state -- determined by which folder the gate file lives in */
export type GateState = "active" | "promoted" | "retired" | "registry";

/** Result of evaluating a single gate */
export interface GateEvaluationResult {
  readonly gateId: string;
  readonly state: "pass" | "fail" | "skip" | "error";
  readonly message?: string;
  readonly fixHint?: string;
}

/** The .forgecraft/project-gates.yaml file schema. */
export interface ProjectGatesFile {
  readonly version: "1";
  readonly projectName?: string;
  readonly gates: ProjectGate[];
}
