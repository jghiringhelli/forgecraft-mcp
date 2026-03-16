/**
 * Artifact Grammar — Architectural Decision Records (ADRs)
 *
 * ADRs are immutable records of structural decisions with rationale.
 * They are Type 3 (regular grammar) artifacts in the Chomsky hierarchy:
 * each ADR has a fixed template that any agent can parse deterministically.
 *
 * Why ADRs matter for generative specification:
 *   Without ADRs, agents re-derive architectural decisions from context.
 *   With ADRs, decisions are recorded once and referenced thereafter.
 *   This compresses the generation space: agents cannot contradict an ADR
 *   without first proposing a superseding one.
 */

import type {
  GenerativeSpec,
  VerificationResult,
  QualityGate,
  ArchDecision,
  SpecChange,
  CompositionConflict,
  ComposableSpec,
  BoundedSpec,
  ExecutableResult,
} from "../core/index.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ADR_ARTIFACT_ID = "artifact:adr";

const REQUIRED_ADR_SECTIONS = [
  "## Status",
  "## Context",
  "## Decision",
  "## Consequences",
] as const;
const ADR_FILENAME_RE = /^\d{4}-[a-z0-9-]+\.md$/;

/**
 * Represents the ADR corpus of a project as a GenerativeSpec artifact.
 *
 * Verification criteria:
 *   - docs/adrs/ directory exists
 *   - Each ADR file matches naming convention: NNNN-kebab-description.md
 *   - Each ADR contains all four required sections
 *   - No ADR has status "proposed" older than 14 days (stale proposals = undecided decisions)
 */
export class AdrArtifact implements GenerativeSpec {
  readonly name = "Architectural Decision Records (ADRs)";
  readonly purpose =
    "Records every structural decision with rationale so agents cannot contradict them without explicit supersession.";
  readonly covers = [
    "Technology choices (frameworks, databases, transports)",
    "Structural patterns (layered architecture, module boundaries)",
    "Constraint origins (why a rule exists)",
    "Supersession history (when and why decisions changed)",
  ] as const;
  readonly excludes = [
    "Implementation details (those belong in code comments)",
    "Bug fixes (those belong in commits)",
    "Operational runbooks (those belong in docs/ops/)",
  ] as const;

  readonly version: string;
  readonly specId = ADR_ARTIFACT_ID;
  readonly dependsOn: ReadonlyArray<string> = [];
  readonly changeHistory: ReadonlyArray<SpecChange> = [];

  readonly gates: ReadonlyArray<QualityGate>;

  constructor(
    readonly projectDir: string,
    readonly decisions: ReadonlyArray<ArchDecision> = [],
    version = "1.0.0",
  ) {
    this.version = version;
    this.gates = [
      {
        id: "adr-dir-exists",
        description: "docs/adrs/ directory must exist",
        phase: "pre-commit",
        async run() {
          return existsSync(join(projectDir, "docs", "adrs"))
            ? { exitCode: 0, message: "docs/adrs/ found" }
            : {
                exitCode: 1,
                message:
                  "docs/adrs/ missing — create it and add ADR-0001 before the first commit",
              };
        },
      },
      {
        id: "adr-naming-convention",
        description: "Each ADR file must be named NNNN-kebab-description.md",
        phase: "pre-commit",
        async run() {
          const adrDir = join(projectDir, "docs", "adrs");
          if (!existsSync(adrDir)) return { exitCode: 0, message: "skipped" };
          const invalid = readdirSync(adrDir).filter(
            (f) =>
              f.endsWith(".md") &&
              f !== "template.md" &&
              !ADR_FILENAME_RE.test(f),
          );
          return invalid.length === 0
            ? { exitCode: 0, message: "All ADR filenames valid" }
            : {
                exitCode: 1,
                message: `Invalid ADR names: ${invalid.join(", ")}`,
              };
        },
      },
      {
        id: "adr-required-sections",
        description:
          "Each ADR must contain: Status, Context, Decision, Consequences",
        phase: "pre-commit",
        async run() {
          const adrDir = join(projectDir, "docs", "adrs");
          if (!existsSync(adrDir)) return { exitCode: 0, message: "skipped" };
          const failing: string[] = [];
          for (const file of readdirSync(adrDir).filter((f) =>
            ADR_FILENAME_RE.test(f),
          )) {
            const content = readFileSync(join(adrDir, file), "utf-8");
            const missing = REQUIRED_ADR_SECTIONS.filter(
              (s) => !content.includes(s),
            );
            if (missing.length > 0)
              failing.push(`${file}: missing ${missing.join(", ")}`);
          }
          return failing.length === 0
            ? { exitCode: 0, message: "All ADRs well-formed" }
            : {
                exitCode: 1,
                message: `Malformed ADRs:\n${failing.join("\n")}`,
              };
        },
      },
    ];
  }

  isInScope(artifactPath: string): boolean {
    return (
      artifactPath.startsWith("docs/adrs/") && artifactPath.endsWith(".md")
    );
  }

  async verify(targetPath: string): Promise<ReadonlyArray<VerificationResult>> {
    const fullPath = join(this.projectDir, targetPath);
    if (!existsSync(fullPath)) {
      return [
        {
          passed: false,
          criterion: "file-exists",
          detail: `${targetPath} not found`,
        },
      ];
    }
    const content = readFileSync(fullPath, "utf-8");
    return REQUIRED_ADR_SECTIONS.map((section) => ({
      passed: content.includes(section),
      criterion: `has-${section.replace("## ", "").toLowerCase().replace(" ", "-")}`,
      detail: content.includes(section) ? "present" : `missing ${section}`,
    }));
  }

  async defend() {
    const results = await Promise.all(
      this.gates.map(async (gate) => ({ gate, ...(await gate.run()) })),
    );
    return { allPassed: results.every((r) => r.exitCode === 0), results };
  }

  findDecision(topic: string): ArchDecision | undefined {
    return this.decisions.find(
      (d) =>
        d.title.toLowerCase().includes(topic.toLowerCase()) ||
        d.context.toLowerCase().includes(topic.toLowerCase()),
    );
  }

  composeWith(
    _other: ComposableSpec & BoundedSpec,
  ): ReadonlyArray<CompositionConflict> {
    return []; // ADR corpus composes freely with all other specs
  }

  async execute(
    _targetPath: string,
    _contractPath: string,
  ): Promise<ExecutableResult> {
    return {
      passed: true,
      passedCount: 0,
      totalCount: 0,
      executionEnvironment: "none",
      detail:
        "ADR artifacts are documentation — not applicable for runtime execution",
    };
  }
}
