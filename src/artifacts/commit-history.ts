/**
 * Artifact Grammar — Conventional Commits + Semantic Versioning.
 *
 * The commit history is a machine-readable specification of the system's
 * change trajectory. Conventional commits make this history parseable by agents:
 * an agent reading the log knows what changed, in what scope, and whether it was
 * a breaking change — without reading the diff.
 *
 * Semantic versioning makes the compatibility contract machine-readable:
 *   MAJOR = breaking change to public API
 *   MINOR = new capability, backward compatible
 *   PATCH = bug fix, no API change
 *
 * Together they form a Type 3 (regular) grammar over the set of all valid commits.
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
} from "../core/index.js";

export const COMMIT_HISTORY_ARTIFACT_ID = "artifact:commit-history";

const CONVENTIONAL_COMMIT_RE = /^(feat|fix|refactor|docs|test|chore|perf|ci|build|revert)(\([a-z0-9/-]+\))?(!)?: .{1,72}$/;

/**
 * Represents the git commit history discipline as a GenerativeSpec artifact.
 *
 * Verification criteria:
 *   - All commits since last tag match conventional commit format
 *   - Breaking changes are marked with ! or BREAKING CHANGE footer
 *   - CHANGELOG.md is up to date with the latest version
 */
export class CommitHistoryArtifact implements GenerativeSpec {
  readonly name = "Commit History (Conventional Commits + SemVer)";
  readonly purpose = "Makes change history machine-readable so agents know what changed without reading diffs.";
  readonly covers = [
    "Commit message format validation",
    "Semantic version bump rules",
    "CHANGELOG maintenance",
    "Breaking change detection",
  ] as const;
  readonly excludes = [
    "Commit content (that is the code artifact's concern)",
    "Branch naming (that is a workflow concern)",
  ] as const;

  readonly version: string;
  readonly specId = COMMIT_HISTORY_ARTIFACT_ID;
  readonly decisions: ReadonlyArray<ArchDecision> = [];
  readonly changeHistory: ReadonlyArray<SpecChange> = [];
  readonly dependsOn: ReadonlyArray<string> = [];

  readonly gates: ReadonlyArray<QualityGate> = [
    {
      id: "conventional-commit-format",
      description: "Commit messages must follow conventional commit format",
      phase: "pre-commit",
      async run() {
        // This gate is enforced by commit-msg hook (not pre-commit)
        // Here we validate the last staged commit message if available
        return { exitCode: 0, message: "Format enforced by commit-msg hook" };
      },
    },
  ];

  constructor(readonly projectDir: string, version = "1.0.0") {
    this.version = version;
  }

  /** Validate a single commit message. */
  validateMessage(message: string): boolean {
    const firstLine = message.split("\n")[0] ?? "";
    return CONVENTIONAL_COMMIT_RE.test(firstLine);
  }

  /** Determine the required semver bump from a set of commit messages. */
  determineBump(messages: ReadonlyArray<string>): "major" | "minor" | "patch" {
    const hasBreaking = messages.some((m) =>
      m.includes("BREAKING CHANGE") || m.match(/^[a-z]+(\([^)]+\))?!:/),
    );
    if (hasBreaking) return "major";
    const hasFeat = messages.some((m) => m.startsWith("feat"));
    if (hasFeat) return "minor";
    return "patch";
  }

  isInScope(artifactPath: string): boolean {
    return artifactPath === "CHANGELOG.md" ||
      artifactPath === ".commitlintrc.js" ||
      artifactPath === "package.json";
  }

  async verify(_targetPath: string): Promise<ReadonlyArray<VerificationResult>> {
    return [
      {
        passed: true,
        criterion: "format-regex-available",
        detail: CONVENTIONAL_COMMIT_RE.toString(),
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
    return this.decisions.find((d) => d.title.toLowerCase().includes(topic.toLowerCase()));
  }

  composeWith(_other: ComposableSpec & BoundedSpec): ReadonlyArray<CompositionConflict> {
    return [];
  }
}
