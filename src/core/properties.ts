/**
 * Generative Specification — core property interfaces.
 *
 * Each interface represents one of the six mandatory properties that a
 * well-formed Generative Specification must satisfy. A spec that cannot be
 * described by all six properties is under-specified and will produce drift.
 *
 * Theoretical basis:
 *   - Chomsky hierarchy: specs are formal grammars constraining LLM generation.
 *   - Firth's distributional hypothesis: a symbol's meaning is its valid context;
 *     a spec's meaning is the set of correct implementations it permits.
 */

// ── 1. Self-describing ────────────────────────────────────────────────────────

/**
 * The spec explains its own purpose and boundaries without external context.
 * An agent reading only this artifact knows what it governs and why.
 */
export interface SelfDescribingSpec {
  /** Human-readable name uniquely identifying this specification. */
  readonly name: string;

  /** One-sentence declarative statement of what this spec governs. */
  readonly purpose: string;

  /**
   * What this spec covers — the positive scope.
   * Each entry is a falsifiable boundary condition.
   */
  readonly covers: ReadonlyArray<string>;

  /**
   * Explicit out-of-scope declarations.
   * Prevents scope creep and ambiguous implementation.
   */
  readonly excludes: ReadonlyArray<string>;
}

// ── 2. Bounded ────────────────────────────────────────────────────────────────

/**
 * The spec has finite, unambiguous scope — everything is either in or out.
 * An unbounded spec generates unbounded implementations.
 */
export interface BoundedSpec {
  /**
   * Version of this spec. Semantic versioning: incompatible changes = MAJOR bump.
   * Consuming agents must reject specs with an incompatible version.
   */
  readonly version: string;

  /**
   * Stable identifier for this spec across versions.
   * Used to track lineage in audits.
   */
  readonly specId: string;

  /**
   * The boundary condition: a predicate that determines whether a given
   * implementation artifact is within scope of this spec.
   *
   * @param artifactPath - Path or identifier of the artifact being checked
   * @returns true if the artifact is within this spec's scope
   */
  isInScope(artifactPath: string): boolean;
}

// ── 3. Verifiable ─────────────────────────────────────────────────────────────

/** Outcome of a verifiable gate at a module boundary. */
export interface VerificationResult {
  readonly passed: boolean;
  readonly criterion: string;
  readonly detail?: string;
}

/**
 * The spec has objective pass/fail criteria at the boundary of every module.
 * "Objective" means a machine can determine pass/fail without human judgment.
 */
export interface VerifiableSpec {
  /**
   * Run all verification criteria for this spec against a target path.
   * Each criterion must be independently falsifiable.
   *
   * @param targetPath - The module or file boundary to verify
   * @returns Array of individual criterion results
   */
  verify(targetPath: string): Promise<ReadonlyArray<VerificationResult>>;
}

// ── 4. Defended ───────────────────────────────────────────────────────────────

/** A quality gate that rejects non-conforming output before it enters the repo. */
export interface QualityGate {
  readonly id: string;
  readonly description: string;
  readonly phase: "pre-commit" | "pre-push" | "ci" | "pre-merge";

  /**
   * Execute this gate.
   * @returns Exit code — 0 means pass, non-zero means block with message.
   */
  run(): Promise<{ exitCode: number; message: string }>;
}

/**
 * The spec is enforced by automated gates that reject non-conforming output.
 * Enforcement is not optional — defended specs cannot be bypassed silently.
 */
export interface DefendedSpec {
  /** All gates that enforce this spec's constraints. */
  readonly gates: ReadonlyArray<QualityGate>;

  /**
   * Run all gates and return aggregate result.
   * A defender spec fails if ANY gate fails.
   */
  defend(): Promise<{
    allPassed: boolean;
    results: ReadonlyArray<{
      gate: QualityGate;
      exitCode: number;
      message: string;
    }>;
  }>;
}

// ── 5. Auditable ──────────────────────────────────────────────────────────────

/** An immutable record of a structural decision and its rationale. */
export interface ArchDecision {
  readonly id: string; // ADR-NNNN
  readonly date: string; // ISO 8601
  readonly title: string;
  readonly status: "proposed" | "accepted" | "deprecated" | "superseded";
  readonly context: string;
  readonly decision: string;
  readonly consequences: string;
  readonly supersededBy?: string; // ADR-NNNN if status === 'superseded'
}

/** A recorded change to this spec — forms the spec's change history. */
export interface SpecChange {
  readonly timestamp: string; // ISO 8601
  readonly author: string;
  readonly description: string;
  readonly specVersionBefore: string;
  readonly specVersionAfter: string;
}

/**
 * Every structural decision is recorded with rationale.
 * A spec without an audit trail cannot be reproduced or defended to new agents.
 */
export interface AuditableSpec {
  readonly decisions: ReadonlyArray<ArchDecision>;
  readonly changeHistory: ReadonlyArray<SpecChange>;

  /**
   * Return the decision that justifies a given implementation choice.
   * Returns undefined if no ADR covers this area — a signal that a decision
   * should be documented before implementation proceeds.
   *
   * @param topic - A keyword or module area (e.g. "authentication", "caching")
   */
  findDecision(topic: string): ArchDecision | undefined;
}

// ── 6. Composable ─────────────────────────────────────────────────────────────

/** Conflict detected when two specs cannot be composed. */
export interface CompositionConflict {
  readonly specA: string;
  readonly specB: string;
  readonly conflictingProperty: string;
  readonly description: string;
}

/**
 * Specs combine without conflict — the composed system is acyclic.
 * Non-composable specs create architectural coupling and unpredictable generation.
 */
export interface ComposableSpec {
  /**
   * The set of spec IDs this spec explicitly depends on.
   * Must form an acyclic directed graph with all other composed specs.
   */
  readonly dependsOn: ReadonlyArray<string>;

  /**
   * Attempt to compose this spec with another.
   * Returns conflicts if the composition would produce ambiguous constraints.
   *
   * @param other - The spec to compose with
   * @returns Empty array if composable, conflict list otherwise
   */
  composeWith(
    other: ComposableSpec & BoundedSpec,
  ): ReadonlyArray<CompositionConflict>;
}

// ── 7. Executable ─────────────────────────────────────────────────────────────

/** Result of executing generated output against its runtime specification. */
export interface ExecutableResult {
  readonly passed: boolean;
  readonly passedCount: number;
  readonly totalCount: number;
  /** The environment the output was executed against (e.g. "postgresql", "browser", "node"). */
  readonly executionEnvironment: string;
  readonly detail?: string;
}

/**
 * The generated output satisfies its behavioral contracts when exercised
 * against a real execution environment — not merely compiles or passes
 * static analysis, but runs correctly against a live database, external API,
 * or runtime target.
 *
 * Verifiable establishes that correctness checks exist and are structurally
 * enforced. Executable establishes that the implementation actually passes
 * them at runtime.
 *
 * Scored conditional on specification availability: a formal contract
 * (Hurl suite, OpenAPI diff, HL7 FHIR runner) enables automated measurement;
 * goal-directed programs require human acceptance criteria and are scored N/A.
 */
export interface ExecutableSpec {
  /**
   * Execute the generated output against its runtime specification.
   *
   * Optional: artifacts that represent meta-level content (ADRs, instructions)
   * need not implement this — the scorer measures Executable from the outside via
   * test-suite results and CI evidence. Implementation artifacts (generated code,
   * API specs) should provide this for automated contract verification.
   *
   * @param targetPath - Path to the artifact under test
   * @param contractPath - Path to the formal contract (Hurl file, OpenAPI spec, etc.)
   * @returns Execution result with pass/fail counts and environment context
   */
  execute?(
    targetPath: string,
    contractPath?: string,
  ): Promise<ExecutableResult>;
}
