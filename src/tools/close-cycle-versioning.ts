/**
 * close_cycle versioning utilities: git history, semver suggestions, changelog management.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { execSync } from "node:child_process";
import { CommitHistoryArtifact } from "../artifacts/commit-history.js";

// ── Version Detection ────────────────────────────────────────────────

/**
 * Parse the current version from the last git tag, or return "0.0.0" as base.
 *
 * @param projectDir - Absolute path to project root
 * @returns Semver string without the "v" prefix, e.g. "1.0.0"
 */
function readCurrentVersion(projectDir: string): string {
  try {
    const raw = execSync("git describe --tags --abbrev=0", {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return raw.replace(/^v/, "");
  } catch {
    return "0.0.0";
  }
}

/**
 * Apply a semver bump to a version string.
 *
 * @param version - Current version string, e.g. "1.2.3"
 * @param bump - Which part to increment
 * @returns Next version string
 */
function applyBump(version: string, bump: "major" | "minor" | "patch"): string {
  const parts = version.split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ── Commit History ───────────────────────────────────────────────────

/**
 * Read git commits since the last tag (or all commits when no tag exists).
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of one-line commit strings, or empty array if git unavailable
 */
export function readCommitsSinceLastTag(projectDir: string): string[] {
  try {
    let raw: string;
    try {
      const lastTag = execSync("git describe --tags --abbrev=0", {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      })
        .toString()
        .trim();
      raw = execSync(`git log --oneline ${lastTag}..HEAD`, {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
    } catch {
      raw = execSync("git log --oneline", {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
    }
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Suggest the next semantic version bump based on git history since last tag.
 *
 * @param projectDir - Absolute path to project root
 * @returns Suggestion string or null if git is unavailable
 */
export function suggestVersionBump(projectDir: string): string | null {
  const commits = readCommitsSinceLastTag(projectDir);
  if (commits.length === 0) return null;

  const commitMessages = commits.map((line) => {
    const match = line.match(/^[0-9a-f]+\s+(.+)$/);
    return match?.[1] ?? line;
  });

  const artifact = new CommitHistoryArtifact(projectDir);
  const bump = artifact.determineBump(commitMessages);
  const currentVersion = readCurrentVersion(projectDir);

  if (currentVersion === "0.0.0") {
    return `Suggested initial version: v0.1.0`;
  }

  const nextVersion = applyBump(currentVersion, bump);
  const bumpReason =
    bump === "major"
      ? "contains breaking changes"
      : bump === "minor"
        ? "contains feat commits"
        : "contains fix/chore commits";

  return `v${currentVersion} -> **v${nextVersion}** (${bumpReason})`;
}

// ── Changelog ────────────────────────────────────────────────────────

/**
 * Categorise conventional-commit messages into Added/Fixed/Changed buckets.
 *
 * @param commitMessages - Cleaned commit messages (without SHA prefix)
 * @returns Categorised lists for changelog sections
 */
function categoriseCommits(commitMessages: ReadonlyArray<string>): {
  added: string[];
  fixed: string[];
  changed: string[];
} {
  const added: string[] = [];
  const fixed: string[] = [];
  const changed: string[] = [];

  for (const msg of commitMessages) {
    if (msg.startsWith("feat")) {
      added.push(msg);
    } else if (msg.startsWith("fix")) {
      fixed.push(msg);
    } else if (
      msg.startsWith("refactor") ||
      msg.startsWith("perf") ||
      msg.startsWith("chore")
    ) {
      changed.push(msg);
    }
  }

  return { added, fixed, changed };
}

/**
 * Ensure CHANGELOG.md exists with the standard Keep a Changelog header.
 *
 * @param changelogPath - Absolute path to CHANGELOG.md
 */
function ensureChangelogHeader(changelogPath: string): void {
  if (!existsSync(changelogPath)) {
    writeFileSync(
      changelogPath,
      [
        "# Changelog",
        "",
        "All notable changes to this project will be documented in this file.",
        "Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)",
        "Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)",
        "",
      ].join("\n"),
      "utf-8",
    );
  }
}

/**
 * Append a CHANGELOG entry for the suggested version bump.
 *
 * @param projectDir - Absolute path to project root
 * @param versionSuggestion - The human-readable suggestion string from suggestVersionBump
 * @returns true if the changelog was updated, false otherwise
 */
export function appendChangelogEntry(
  projectDir: string,
  versionSuggestion: string | null,
): boolean {
  if (!versionSuggestion) return false;

  const commits = readCommitsSinceLastTag(projectDir);
  if (commits.length === 0) return false;

  const commitMessages = commits.map((line) => {
    const match = line.match(/^[0-9a-f]+\s+(.+)$/);
    return match?.[1] ?? line;
  });

  const { added, fixed, changed } = categoriseCommits(commitMessages);
  if (added.length === 0 && fixed.length === 0 && changed.length === 0) {
    return false;
  }

  const versionMatch = versionSuggestion.match(/\*\*v([\d.]+)\*\*/);
  const initialMatch = versionSuggestion.match(
    /Suggested initial version: v([\d.]+)/,
  );
  const nextVersion = versionMatch?.[1] ?? initialMatch?.[1];
  if (!nextVersion) return false;

  const date = new Date().toISOString().split("T")[0]!;
  const sectionLines: string[] = [`## [${nextVersion}] - ${date}`, ""];

  if (added.length > 0) {
    sectionLines.push("### Added");
    added.forEach((m) => sectionLines.push(`- ${m}`));
    sectionLines.push("");
  }

  if (fixed.length > 0) {
    sectionLines.push("### Fixed");
    fixed.forEach((m) => sectionLines.push(`- ${m}`));
    sectionLines.push("");
  }

  if (changed.length > 0) {
    sectionLines.push("### Changed");
    changed.forEach((m) => sectionLines.push(`- ${m}`));
    sectionLines.push("");
  }

  const changelogPath = join(projectDir, "CHANGELOG.md");
  ensureChangelogHeader(changelogPath);

  const existing = readFileSync(changelogPath, "utf-8");
  const insertionPoint = existing.search(/^## \[/m);
  const newEntry = sectionLines.join("\n");

  if (insertionPoint === -1) {
    appendFileSync(changelogPath, `\n${newEntry}`, "utf-8");
  } else {
    const before = existing.slice(0, insertionPoint);
    const after = existing.slice(insertionPoint);
    writeFileSync(changelogPath, `${before}${newEntry}\n${after}`, "utf-8");
  }

  return true;
}
