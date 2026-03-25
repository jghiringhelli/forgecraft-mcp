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
  /** True when tests pass AND totalScore ≥ 10. */
  readonly overallPass: boolean;
}
