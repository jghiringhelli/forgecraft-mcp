/**
 * GS verification and scoring types: properties, test suite results, and layer violations.
 */

/** GS property name as defined in §4.3 of the experiment design. */
export type GsProperty =
  | "self-describing"
  | "bounded"
  | "verifiable"
  | "defended"
  | "auditable"
  | "composable"
  | "executable";

/**
 * GS maturity tier — five-level adoption model from the Generative Specification white paper.
 *
 * Maps to the 14-point GS scoring scale (7 properties × 0–2):
 *
 *   Tier 1 — Unstructured  (0–3):  Prompting only. No persistent artifacts, no discipline.
 *   Tier 2 — Grounded      (4–6):  Has CLAUDE.md or equivalent ground rules. Basic tests.
 *   Tier 3 — Specified     (7–10): Full spec artifacts — use-cases, ADRs, bounded architecture.
 *   Tier 4 — Verified      (11–13): Executable tests passing, CI, audit trail, all properties partial+.
 *   Tier 5 — Orchestrated  (14):   Perfect score across all 7 properties. Full discipline.
 *
 * ForgeCraft detects the current tier on every verify run. Projects can declare a
 * target tier in forgecraft.yaml (gs_maturity_tier_target) to gate PRs below it.
 */
export type GsMaturityTier = 1 | 2 | 3 | 4 | 5;

/** Tier metadata for display and gating. */
export interface GsMaturityTierInfo {
  readonly tier: GsMaturityTier;
  readonly name:
    | "Unstructured"
    | "Grounded"
    | "Specified"
    | "Verified"
    | "Orchestrated";
  readonly scoreRange: readonly [number, number];
  readonly description: string;
}

/** Compute maturity tier from a raw GS total score (0–14). */
export function computeMaturityTier(totalScore: number): GsMaturityTierInfo {
  if (totalScore >= 14)
    return {
      tier: 5,
      name: "Orchestrated",
      scoreRange: [14, 14],
      description:
        "Perfect GS score — all 7 properties at maximum. Full spec-first discipline.",
    };
  if (totalScore >= 11)
    return {
      tier: 4,
      name: "Verified",
      scoreRange: [11, 13],
      description:
        "Executable tests passing, CI configured, audit trail present.",
    };
  if (totalScore >= 7)
    return {
      tier: 3,
      name: "Specified",
      scoreRange: [7, 10],
      description:
        "Full spec artifacts: use-cases, ADRs, bounded architecture.",
    };
  if (totalScore >= 4)
    return {
      tier: 2,
      name: "Grounded",
      scoreRange: [4, 6],
      description: "Ground rules established (CLAUDE.md). Basic test coverage.",
    };
  return {
    tier: 1,
    name: "Unstructured",
    scoreRange: [0, 3],
    description: "Prompting only. No persistent spec artifacts.",
  };
}

/** Score (0–2) for a single GS property with supporting evidence. */
export interface GsPropertyScore {
  readonly property: GsProperty;
  readonly score: 0 | 1 | 2;
  readonly evidence: string[];
}

/** Outcome of executing the project's test suite. */
export interface TestSuiteResult {
  readonly passed: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly output: string;
  /** Command that was executed. */
  readonly command: string;
}

/** A direct-DB call found in a route or controller file. */
export interface LayerViolation {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

/** A source module that has no corresponding test file. */
export interface MissingTestFile {
  readonly sourceFile: string;
  readonly expectedTestFile: string;
}

/** Full result of a `forgecraft verify` run. */
export interface VerifyResult {
  readonly testSuite: TestSuiteResult;
  readonly propertyScores: GsPropertyScore[];
  /** Sum of all property scores (max 14, 7 properties × 2). */
  readonly totalScore: number;
  readonly layerViolations: LayerViolation[];
  readonly missingTestFiles: MissingTestFile[];
  /** True when tests pass AND totalScore ≥ pass_threshold. */
  readonly overallPass: boolean;
  /** GS maturity tier computed from totalScore. */
  readonly maturityTier: GsMaturityTierInfo;
}
