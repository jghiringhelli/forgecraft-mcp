/**
 * Artifact Grammar — Pre-commit Hooks (automated enforcement).
 *
 * Pre-commit hooks are the enforcement layer of a Generative Specification.
 * Without hooks, all other artifacts are advisory — agents and developers can
 * violate them without consequence. Hooks make specs self-defending.
 *
 * In the Chomsky hierarchy: hooks are the recognizer for the grammar defined
 * by all other artifacts. They accept or reject a commit (a "word") based on
 * whether it satisfies the combined language of all specs.
 *
 * This is the Defended property made concrete.
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
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const COMMIT_HOOKS_ARTIFACT_ID = "artifact:commit-hooks";

const REQUIRED_HOOKS = [
  "pre-commit-no-temp-files.sh",
  "pre-commit-secrets.sh",
  "pre-commit-prod-quality.sh",
  "pre-commit-compile.sh",
  "pre-commit-test.sh",
] as const;

/**
 * Represents the pre-commit hook corpus as a GenerativeSpec artifact.
 *
 * Verification criteria:
 *   - .claude/hooks/ directory exists with all required hooks
 *   - .git/hooks/pre-commit exists and is executable (hooks installed)
 *   - scripts/setup-hooks.sh exists (hooks can be reinstalled after clone)
 */
export class CommitHooksArtifact implements GenerativeSpec {
  readonly name = "Pre-commit Hooks (Automated Enforcement)";
  readonly purpose =
    "Rejects non-conforming commits before they enter the repository, making all other spec properties self-defending.";
  readonly covers = [
    "Temporary/draft file prevention",
    "Secret scanning",
    "Production anti-pattern detection",
    "TypeScript compilation gate",
    "Test + coverage gate",
    "Dangerous command prevention",
  ] as const;
  readonly excludes = [
    "Hook implementation details (those live in .claude/hooks/)",
    "CI/CD pipeline steps (those are post-commit enforcement)",
  ] as const;

  readonly version: string;
  readonly specId = COMMIT_HOOKS_ARTIFACT_ID;
  readonly decisions: ReadonlyArray<ArchDecision> = [];
  readonly changeHistory: ReadonlyArray<SpecChange> = [];
  readonly dependsOn: ReadonlyArray<string> = [];

  readonly gates: ReadonlyArray<QualityGate>;

  constructor(
    readonly projectDir: string,
    version = "1.0.0",
  ) {
    this.version = version;
    this.gates = [
      {
        id: "hooks-directory-exists",
        description: ".claude/hooks/ must contain all required hook scripts",
        phase: "pre-commit",
        async run() {
          const hooksDir = join(projectDir, ".claude", "hooks");
          if (!existsSync(hooksDir)) {
            return {
              exitCode: 1,
              message: ".claude/hooks/ not found — run scripts/setup-hooks.sh",
            };
          }
          const present = new Set(readdirSync(hooksDir));
          const missing = REQUIRED_HOOKS.filter((h) => !present.has(h));
          return missing.length === 0
            ? { exitCode: 0, message: "All required hooks present" }
            : { exitCode: 1, message: `Missing hooks: ${missing.join(", ")}` };
        },
      },
      {
        id: "git-hooks-installed",
        description:
          ".git/hooks/pre-commit must exist (hooks installed via setup-hooks.sh)",
        phase: "pre-commit",
        async run() {
          return existsSync(join(projectDir, ".git", "hooks", "pre-commit"))
            ? { exitCode: 0, message: ".git/hooks/pre-commit installed" }
            : {
                exitCode: 1,
                message:
                  ".git/hooks/pre-commit missing — run: bash scripts/setup-hooks.sh",
              };
        },
      },
      {
        id: "setup-script-exists",
        description: "scripts/setup-hooks.sh must exist for fresh clones",
        phase: "pre-commit",
        async run() {
          return existsSync(join(projectDir, "scripts", "setup-hooks.sh"))
            ? { exitCode: 0, message: "scripts/setup-hooks.sh present" }
            : {
                exitCode: 1,
                message:
                  "scripts/setup-hooks.sh missing — hooks cannot be installed on fresh clones",
              };
        },
      },
    ];
  }

  isInScope(artifactPath: string): boolean {
    return (
      artifactPath.startsWith(".claude/hooks/") ||
      artifactPath.startsWith(".git/hooks/") ||
      artifactPath === "scripts/setup-hooks.sh"
    );
  }

  async verify(targetPath: string): Promise<ReadonlyArray<VerificationResult>> {
    return [
      {
        passed: existsSync(join(this.projectDir, targetPath)),
        criterion: "file-exists",
        detail: targetPath,
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
    return this.decisions.find((d) =>
      d.title.toLowerCase().includes(topic.toLowerCase()),
    );
  }

  composeWith(
    _other: ComposableSpec & BoundedSpec,
  ): ReadonlyArray<CompositionConflict> {
    return []; // Hook artifacts never conflict; they compose additively
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
        "Hook artifacts are enforcement tooling — not applicable for runtime execution",
    };
  }
}
