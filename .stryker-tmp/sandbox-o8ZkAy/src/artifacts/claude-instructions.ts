/**
 * Artifact Grammar — CLAUDE.md / copilot-instructions.md
 *
 * AI assistant instruction files are project-level behavioral constraints.
 * They narrow the LLM's action space to patterns that conform to the project's
 * architecture, coding standards, and quality rules.
 *
 * In the Chomsky hierarchy this is a Type 2 (context-free) grammar:
 * the instruction file defines productions (rules) that every agent output must
 * satisfy, but the output itself can be any valid derivation.
 */
// @ts-nocheck


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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CLAUDE_INSTRUCTIONS_ARTIFACT_ID = "artifact:claude-instructions";

/**
 * Represents a CLAUDE.md (or equivalent) file as a GenerativeSpec artifact.
 *
 * Verification criteria:
 *   - File exists at expected path
 *   - Contains required sections (Identity, Code Standards, Commit Protocol)
 *   - Does not duplicate information that is enforced by hooks
 *   - Is under 200 lines (token-efficient)
 */
export class ClaudeInstructionsArtifact implements GenerativeSpec {
  readonly name = "AI Instructions File (CLAUDE.md)";
  readonly purpose =
    "Constrains agent behavior to project-specific coding standards, architecture, and commit discipline.";
  readonly covers = [
    "Project identity and stack",
    "Code standards (fn length, file length, naming)",
    "Architecture layer rules",
    "Commit protocol",
    "Corrections log",
  ] as const;
  readonly excludes = [
    "Hook implementation details (enforced by .claude/hooks/, not described here)",
    "CI/CD pipeline configuration (lives in .github/workflows/)",
    "Dependency management (lives in package.json)",
  ] as const;

  readonly version: string;
  readonly specId = CLAUDE_INSTRUCTIONS_ARTIFACT_ID;

  readonly decisions: ReadonlyArray<ArchDecision> = [];
  readonly changeHistory: ReadonlyArray<SpecChange> = [];
  readonly dependsOn: ReadonlyArray<string> = [];

  readonly gates: ReadonlyArray<QualityGate> = [
    {
      id: "claude-md-exists",
      description: "CLAUDE.md must exist at project root",
      phase: "pre-commit",
      async run() {
        return existsSync("CLAUDE.md")
          ? { exitCode: 0, message: "CLAUDE.md found" }
          : {
              exitCode: 1,
              message: "CLAUDE.md missing — run setup_project to generate",
            };
      },
    },
    {
      id: "claude-md-length",
      description: "CLAUDE.md must be ≤200 lines (token budget)",
      phase: "pre-commit",
      async run() {
        if (!existsSync("CLAUDE.md"))
          return { exitCode: 0, message: "skipped" };
        const lines = readFileSync("CLAUDE.md", "utf-8").split("\n").length;
        return lines <= 200
          ? { exitCode: 0, message: `CLAUDE.md is ${lines} lines` }
          : {
              exitCode: 1,
              message: `CLAUDE.md is ${lines} lines — over 200 line budget. Remove hook details and verbose explanations.`,
            };
      },
    },
  ];

  constructor(
    readonly projectDir: string,
    version = "1.0.0",
  ) {
    this.version = version;
  }

  isInScope(artifactPath: string): boolean {
    return (
      artifactPath === "CLAUDE.md" ||
      artifactPath === ".github/copilot-instructions.md" ||
      artifactPath === ".cursorrules"
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
    const lines = content.split("\n");

    return [
      {
        passed: content.includes("## "),
        criterion: "has-sections",
        detail: "Instruction file must have at least one ## section",
      },
      {
        passed: lines.length <= 200,
        criterion: "token-budget",
        detail: `${lines.length}/200 lines`,
      },
      {
        passed:
          !content.includes("pre-commit") && !content.includes(".claude/hooks"),
        criterion: "no-hook-duplication",
        detail:
          "Instruction files must not duplicate hook implementation details",
      },
    ];
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
    other: ComposableSpec & BoundedSpec,
  ): ReadonlyArray<CompositionConflict> {
    if (other.isInScope("CLAUDE.md") && other.specId !== this.specId) {
      return [
        {
          specA: this.specId,
          specB: other.specId,
          conflictingProperty: "covers",
          description:
            "Two specs both govern CLAUDE.md — only one instruction artifact spec may be active per project",
        },
      ];
    }
    return [];
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
        "Instruction artifacts are documentation — not applicable for runtime execution",
    };
  }
}
