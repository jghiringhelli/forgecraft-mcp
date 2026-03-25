/**
 * setup-context: Project context assembly — spec discovery, tag inference, and context building.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseSpec,
  inferTagsFromDirectory,
  directoryHasFiles,
  findRichestSpecFile,
} from "./spec-parser.js";
import type { AmbiguityItem } from "./spec-parser.js";
import { detectProjectMode } from "./setup-detector.js";

// ── Constants ─────────────────────────────────────────────────────────

/** Source directories whose presence signals an existing (non-new) project. */
export const EXISTING_PROJECT_DIRS = ["src", "lib", "app"] as const;

/** Candidate spec files searched in order when no spec_path/spec_text provided. */
export const SPEC_SEARCH_PATHS = [
  "docs/PRD.md",
  "docs/spec.md",
  "docs/README.md",
  "README.md",
] as const;

// ── Types ─────────────────────────────────────────────────────────────

/** Input fields from SetupProjectArgs needed for context building. */
interface ContextArgs {
  readonly project_dir: string;
  readonly spec_path?: string;
  readonly spec_text?: string;
  readonly spec_file_confirmed?: string;
}

export interface ProjectContext {
  readonly projectDir: string;
  readonly projectName: string;
  readonly isExistingProject: boolean;
  readonly isBrownfield: boolean;
  readonly specContent: string | null;
  readonly specSourceLabel: string;
  readonly specCandidates: ReadonlyArray<{ path: string; preview: string }>;
  readonly inferredTags: string[];
  readonly ambiguities: AmbiguityItem[];
}

// ── Utilities ─────────────────────────────────────────────────────────

/**
 * Infer project name from the directory path.
 *
 * @param projectDir - Absolute path
 * @returns Last path segment as project name
 */
export function inferProjectName(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

/**
 * Merge tag arrays, preserving uniqueness, always including UNIVERSAL.
 */
function mergeTags(primary: string[], secondary: string[]): string[] {
  const seen = new Set(primary);
  for (const t of secondary) seen.add(t);
  if (!seen.has("UNIVERSAL")) seen.add("UNIVERSAL");
  return Array.from(seen);
}

/**
 * Detect whether a project directory contains existing source code.
 *
 * @param projectDir - Absolute project root path
 */
export function detectExistingProject(projectDir: string): boolean {
  return EXISTING_PROJECT_DIRS.some((dir) =>
    directoryHasFiles(join(projectDir, dir)),
  );
}

/**
 * Search for a spec file in standard locations.
 */
export function findSpecFile(projectDir: string): string | null {
  for (const candidate of SPEC_SEARCH_PATHS) {
    const fullPath = join(projectDir, candidate);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

// ── Spec candidate collection ─────────────────────────────────────────

/**
 * Collect all markdown files that look like spec candidates.
 */
export function collectSpecCandidates(
  projectDir: string,
): Array<{ path: string; preview: string }> {
  const EXCLUDED_NAMES = new Set([
    "PRD.md", "TechSpec.md", "Status.md", "CLAUDE.md", "CHANGELOG.md",
    "CONTRIBUTING.md", "use-cases.md", "roadmap.md", "dx-workshop.md",
  ]);
  const MIN_CONTENT_LENGTH = 500;
  const candidates: Array<{ path: string; preview: string }> = [];

  function walk(dir: string, depth: number): void {
    if (depth < 0 || !existsSync(dir)) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".md") && !EXCLUDED_NAMES.has(entry.name)) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (content.length >= MIN_CONTENT_LENGTH) {
              candidates.push({ path: fullPath, preview: content.slice(0, 300).replace(/\n{3,}/g, "\n\n") });
            }
          } catch { /* skip unreadable */ }
        } else if (entry.isDirectory() && depth > 0) {
          walk(fullPath, depth - 1);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(join(projectDir, "docs"), 4);
  try {
    for (const file of readdirSync(projectDir)) {
      if ((file.endsWith(".md") || file === "README.md") && !EXCLUDED_NAMES.has(file)) {
        const fullPath = join(projectDir, file);
        try {
          const content = readFileSync(fullPath, "utf-8");
          if (content.length >= MIN_CONTENT_LENGTH) candidates.push({ path: fullPath, preview: content.slice(0, 300).replace(/\n{3,}/g, "\n\n") });
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  return candidates;
}

// ── Context builder ───────────────────────────────────────────────────

/**
 * Gather all project context needed for both phases.
 *
 * @param args - Setup arguments
 * @returns Assembled project context
 */
export async function buildProjectContext(
  args: ContextArgs,
): Promise<ProjectContext> {
  const projectDir = args.project_dir;
  const projectName = inferProjectName(projectDir);
  const isExistingProject = detectExistingProject(projectDir);

  let specContent: string | null = null;
  let specSourceLabel = "none";
  let specCandidates: Array<{ path: string; preview: string }> = [];

  if (args.spec_file_confirmed) {
    if (!existsSync(args.spec_file_confirmed)) throw new Error(`Spec file not found: ${args.spec_file_confirmed}`);
    specContent = readFileSync(args.spec_file_confirmed, "utf-8");
    specSourceLabel = args.spec_file_confirmed;
  } else if (args.spec_path) {
    if (!existsSync(args.spec_path)) throw new Error(`Spec file not found: ${args.spec_path}`);
    specContent = readFileSync(args.spec_path, "utf-8");
    specSourceLabel = args.spec_path;
  } else if (args.spec_text) {
    specContent = args.spec_text;
    specSourceLabel = "provided text";
  } else {
    specCandidates = collectSpecCandidates(projectDir);
    if (specCandidates.length === 1) {
      specContent = readFileSync(specCandidates[0].path, "utf-8");
      specSourceLabel = specCandidates[0].path;
    } else if (specCandidates.length > 1) {
      const richestSpec = findRichestSpecFile(projectDir);
      if (richestSpec) { specContent = readFileSync(richestSpec, "utf-8"); specSourceLabel = richestSpec; }
    } else {
      const found = findSpecFile(projectDir);
      if (found) { specContent = readFileSync(found, "utf-8"); specSourceLabel = found; }
    }
  }

  const dirResult = await inferTagsFromDirectory(projectDir);
  const specSummary = specContent ? parseSpec(specContent, projectName) : null;
  const specTags = specSummary?.inferredTags ?? ["UNIVERSAL"];
  const inferredTags = mergeTags(dirResult.tags, specTags);

  const ambiguities: AmbiguityItem[] = [
    ...dirResult.ambiguities,
    ...(specSummary?.ambiguities ?? []),
  ];

  return {
    projectDir,
    projectName,
    isExistingProject,
    isBrownfield: detectProjectMode(projectDir) === "brownfield",
    specContent,
    specSourceLabel,
    specCandidates,
    inferredTags,
    ambiguities,
  };
}
