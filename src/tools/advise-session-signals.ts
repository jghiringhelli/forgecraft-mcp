/**
 * Project signal reader for the session advisor.
 *
 * Reads filesystem state and active gate violations to produce a
 * ProjectSignals snapshot. Intentionally fast — no git subprocess,
 * no cascade execution. Used both by the MCP action and the shell hook.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { readViolationsFile } from "./gate-violations.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ProjectSignals {
  readonly hasConfig: boolean;
  readonly hasConstitution: boolean;
  readonly hasSpec: boolean;
  readonly hasAdrs: boolean;
  readonly hasTests: boolean;
  readonly hasSchema: boolean;
  readonly hasSourceCode: boolean;
  readonly activeViolationCount: number;
  readonly topViolations: readonly string[];
  readonly recentActivity: string | null;
}

// ── Constants ────────────────────────────────────────────────────────

const SCHEMA_PATHS = [
  "openapi.yaml",
  "openapi.yml",
  "openapi.json",
  "api-spec.yaml",
  "api-spec.yml",
  "api-spec.json",
  "schema.graphql",
  "prisma/schema.prisma",
  "docs/schema.md",
  "docs/schemas",
  "src/schema",
  "src/schemas",
  "schemas",
  "database/schema.sql",
  "db/schema.sql",
  "db/schema.rb",
] as const;

const TEST_DIRS = ["tests", "test", "spec", "__tests__"] as const;
const SOURCE_FILES = [
  "package.json",
  "pyproject.toml",
  "setup.py",
  "Cargo.toml",
  "go.mod",
] as const;
const CONSTITUTION_PATHS = [
  "CLAUDE.md", // Claude Code
  ".cursor/rules/project-standards.mdc", // Cursor
  ".github/copilot-instructions.md", // GitHub Copilot
  ".windsurfrules", // Windsurf
  ".clinerules", // Cline
  "CONVENTIONS.md", // Aider
] as const;
const SPEC_PATHS = [
  "docs/PRD.md",
  "docs/spec.md",
  "SPEC.md",
  "README.md",
] as const;

// ── Readers ──────────────────────────────────────────────────────────

function hasAny(dir: string, paths: readonly string[]): boolean {
  return paths.some((p) => existsSync(join(dir, p)));
}

function hasAdrFiles(dir: string): boolean {
  const adrsDir = join(dir, "docs", "adrs");
  if (!existsSync(adrsDir)) return false;
  try {
    return readdirSync(adrsDir).some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

function readRecentActivity(dir: string): string | null {
  try {
    const subject = execSync("git log --oneline -1 --format=%s", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    return subject.length > 0 ? subject : null;
  } catch {
    return null;
  }
}

function readActiveViolations(dir: string): readonly string[] {
  const all = readViolationsFile(dir);
  return all.map((v) => v.message).filter((m) => m.length > 0);
}

// ── Public API ───────────────────────────────────────────────────────

export function readProjectSignals(projectDir: string): ProjectSignals {
  const violations = readActiveViolations(projectDir);
  return {
    hasConfig: existsSync(join(projectDir, "forgecraft.yaml")),
    hasConstitution: hasAny(projectDir, CONSTITUTION_PATHS),
    hasSpec: hasAny(projectDir, SPEC_PATHS),
    hasAdrs: hasAdrFiles(projectDir),
    hasTests: TEST_DIRS.some((d) => existsSync(join(projectDir, d))),
    hasSchema: hasAny(projectDir, SCHEMA_PATHS),
    hasSourceCode: hasAny(projectDir, SOURCE_FILES),
    activeViolationCount: violations.length,
    topViolations: violations.slice(0, 3),
    recentActivity: readRecentActivity(projectDir),
  };
}
