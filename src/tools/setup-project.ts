/**
 * setup_project tool handler — two-phase onboarding entry point.
 *
 * Phase 1 (no mvp/scope_complete/has_consumers): Analyzes the project or spec,
 * shows what was found, and returns three calibration questions.
 *
 * Phase 2 (all three answers provided): Derives cascade decisions from answers
 * and tags, writes forgecraft.yaml, creates docs/PRD.md, and scaffolds the project.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import type { CascadeDecision, Tag } from "../shared/types.js";
import { ALL_TAGS } from "../shared/types.js";
import { deriveDefaultCascadeDecisions } from "./cascade-defaults.js";
import { scaffoldProjectHandler, scaffoldHooks } from "./scaffold.js";
import { configureMcpHandler } from "./configure-mcp.js";
import { createLogger } from "../shared/logger/index.js";
import {
  parseSpec,
  inferTagsFromDirectory,
  directoryHasFiles,
  findRichestSpecFile,
  inferSensitiveData,
} from "./spec-parser.js";
import type { AmbiguityItem } from "./spec-parser.js";
import {
  getActiveProjectGates,
  readProjectGates,
} from "../shared/project-gates.js";
import { readExperimentConfig } from "../shared/config.js";

const logger = createLogger("tools/setup-project");

// ── Types ────────────────────────────────────────────────────────────

export interface SetupProjectArgs {
  readonly project_dir: string;
  readonly spec_path?: string;
  readonly spec_text?: string;
  /** Phase 2: true = MVP stage, false = production. */
  readonly mvp?: boolean;
  /** Phase 2: is the scope defined and stable? */
  readonly scope_complete?: boolean;
  /** Phase 2: does this project have existing users or downstream consumers? */
  readonly has_consumers?: boolean;
  /**
   * Phase 2: override the inferred project type when ambiguities were reported in phase 1.
   * Examples: "docs", "cli", "api", "library", "cli+library", "cli+api".
   */
  readonly project_type_override?: string;
  /**
   * Phase 2: the spec file the AI identified as the primary project spec.
   * Provide this when Phase 1 listed multiple candidates.
   */
  readonly spec_file_confirmed?: string;
  /**
   * Phase 2: AI-extracted problem statement from the spec.
   * The AI should read the spec and summarise the core problem in 1-3 sentences.
   */
  readonly problem_statement?: string;
  /**
   * Phase 2: AI-extracted primary users / actors from the spec.
   * Comma-separated list of the main user roles or personas.
   */
  readonly primary_users?: string;
  /**
   * Phase 2: AI-extracted success criteria from the spec.
   * Comma-separated list of measurable outcomes or goals.
   */
  readonly success_criteria?: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

// ── Constants ─────────────────────────────────────────────────────────

/** Source directories whose presence signals an existing (non-new) project. */
const EXISTING_PROJECT_DIRS = ["src", "lib", "app"] as const;

/** Candidate spec files searched in order when no spec_path/spec_text provided. */
const SPEC_SEARCH_PATHS = [
  "docs/PRD.md",
  "docs/spec.md",
  "docs/README.md",
  "README.md",
] as const;

/** Valid ALL_TAGS values as a Set for fast membership testing. */
const VALID_TAGS_SET = new Set<string>(ALL_TAGS);

/** Source file extensions that indicate existing code. */
const SOURCE_EXTENSIONS = [".ts", ".js", ".py"] as const;

/** Directories to search for source files during brownfield detection. */
const BROWNFIELD_SOURCE_DIRS = ["src", "app", "lib"] as const;

/** Glob patterns to exclude when scanning for source files. */
const BROWNFIELD_EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "__pycache__",
]);

/** Minimum README length (chars) to count as a substantial spec. */
const SUBSTANTIAL_README_MIN_CHARS = 800;

/** Route-related patterns signalling HTTP route files. */
const ROUTE_PATTERN =
  /\b(router|app\.get|app\.post|app\.put|app\.delete|@app\.route|@router|Blueprint)\b/;

/** Maximum route files to list in the reverse-PRD. */
const MAX_ROUTE_FILES = 8;

// ── Brownfield Detection ──────────────────────────────────────────────

/**
 * Determine whether a project is greenfield (no existing source) or brownfield
 * (source files present, no substantial spec document).
 *
 * A project is brownfield when BOTH conditions hold:
 * - At least one .ts, .js, or .py file exists under src/, app/, lib/, or root.
 * - No substantial spec: no docs/spec.md, docs/PRD.md, docs/specs/ with content,
 *   or README >800 chars.
 *
 * @param projectDir - Absolute path to the project root
 * @returns 'brownfield' or 'greenfield'
 */
export function detectProjectMode(
  projectDir: string,
): "greenfield" | "brownfield" {
  if (!hasSourceFiles(projectDir)) return "greenfield";
  if (hasSubstantialSpec(projectDir)) return "greenfield";
  return "brownfield";
}

/**
 * Check whether any source files (.ts, .js, .py) exist in the candidate dirs.
 *
 * @param projectDir - Project root
 * @returns True if at least one source file is found
 */
function hasSourceFiles(projectDir: string): boolean {
  const dirsToCheck = [
    ...BROWNFIELD_SOURCE_DIRS.map((d) => join(projectDir, d)),
    projectDir,
  ];

  for (const dir of dirsToCheck) {
    if (existsSync(dir) && containsSourceFile(dir, dir === projectDir)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively scan a directory for source files, skipping excluded dirs.
 *
 * @param dir - Directory to scan
 * @param rootOnly - When true, only scan the immediate directory (not recursive)
 * @returns True if a source file is found
 */
function containsSourceFile(dir: string, rootOnly: boolean): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (BROWNFIELD_EXCLUDE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    if (SOURCE_EXTENSIONS.includes(ext as (typeof SOURCE_EXTENSIONS)[number])) {
      return true;
    }
    if (!rootOnly) {
      try {
        const stat = readdirSync(fullPath);
        if (stat && containsSourceFile(fullPath, false)) return true;
      } catch {
        // not a directory — skip
      }
    }
  }
  return false;
}

/**
 * Check whether a substantial spec document exists in the project.
 *
 * @param projectDir - Project root
 * @returns True if a substantial spec is found
 */
function hasSubstantialSpec(projectDir: string): boolean {
  const candidates = [
    join(projectDir, "docs", "spec.md"),
    join(projectDir, "docs", "PRD.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return true;
  }

  const specsDir = join(projectDir, "docs", "specs");
  if (existsSync(specsDir)) {
    try {
      const files = readdirSync(specsDir);
      if (files.length > 0) return true;
    } catch {
      // ignore read errors
    }
  }

  const readmePath = join(projectDir, "README.md");
  if (existsSync(readmePath)) {
    try {
      const content = readFileSync(readmePath, "utf-8");
      if (content.length > SUBSTANTIAL_README_MIN_CHARS) return true;
    } catch {
      // ignore read errors
    }
  }

  return false;
}

/**
 * Generate a reverse-engineered PRD stub from existing project artifacts.
 *
 * Reads package.json (name, description, scripts), the first 60 lines of
 * README.md, and scans for route-like files to produce a markdown spec stub.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Markdown string formatted as a reverse-PRD stub
 */
export function generateReversePrd(projectDir: string): string {
  const { name, description } = readPackageJsonMetadata(projectDir);
  const readmeSummary = readReadmeSummary(projectDir);
  const routeFiles = findRouteFiles(projectDir);

  const routeLines =
    routeFiles.length > 0
      ? routeFiles.map((f) => `- ${f}`).join("\n")
      : "- (no route files detected)";

  return [
    `> ⚠️ Generated from existing code — review and complete this spec before proceeding.`,
    ``,
    `# ${name} — Reverse-Engineered Spec`,
    ``,
    `## What this project appears to do`,
    ``,
    description,
    ``,
    `## Detected entry points / routes`,
    ``,
    routeLines,
    ``,
    `## README summary`,
    ``,
    readmeSummary,
    ``,
    `## What you need to fill in`,
    ``,
    `- [ ] Clarify the primary user problem this solves`,
    `- [ ] List all business rules that must be enforced`,
    `- [ ] Define non-functional requirements (auth, performance, data retention)`,
  ].join("\n");
}

/**
 * Read project name and description from package.json.
 *
 * @param projectDir - Project root
 * @returns Object with name and description strings
 */
function readPackageJsonMetadata(projectDir: string): {
  name: string;
  description: string;
} {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      name: inferProjectName(projectDir),
      description: "No description found",
    };
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const name =
      typeof pkg["name"] === "string" && pkg["name"]
        ? pkg["name"]
        : inferProjectName(projectDir);
    const description =
      typeof pkg["description"] === "string" && pkg["description"]
        ? pkg["description"]
        : "No description found";
    return { name, description };
  } catch {
    return {
      name: inferProjectName(projectDir),
      description: "No description found",
    };
  }
}

/**
 * Read the first 60 lines of README.md.
 *
 * @param projectDir - Project root
 * @returns First 60 lines of README, or fallback message
 */
function readReadmeSummary(projectDir: string): string {
  const readmePath = join(projectDir, "README.md");
  if (!existsSync(readmePath)) return "No README found";
  try {
    const lines = readFileSync(readmePath, "utf-8").split("\n");
    return lines.slice(0, 60).join("\n");
  } catch {
    return "No README found";
  }
}

/**
 * Scan src/ and app/ for files that contain route-like patterns.
 *
 * @param projectDir - Project root
 * @returns Up to MAX_ROUTE_FILES relative file paths
 */
function findRouteFiles(projectDir: string): string[] {
  const results: string[] = [];
  const searchDirs = ["src", "app"].map((d) => join(projectDir, d));

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    collectRouteFiles(dir, projectDir, results);
    if (results.length >= MAX_ROUTE_FILES) break;
  }

  return results.slice(0, MAX_ROUTE_FILES);
}

/**
 * Recursively collect route files from a directory.
 *
 * @param dir - Current directory to scan
 * @param projectDir - Project root (for computing relative paths)
 * @param results - Accumulator for found paths
 */
function collectRouteFiles(
  dir: string,
  projectDir: string,
  results: string[],
): void {
  if (results.length >= MAX_ROUTE_FILES) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_ROUTE_FILES) return;
    if (BROWNFIELD_EXCLUDE_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    const ext = fullPath.slice(fullPath.lastIndexOf("."));

    if (SOURCE_EXTENSIONS.includes(ext as (typeof SOURCE_EXTENSIONS)[number])) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        if (ROUTE_PATTERN.test(content)) {
          const relativePath = fullPath
            .replace(projectDir, "")
            .replace(/\\/g, "/")
            .replace(/^\//, "");
          results.push(relativePath);
        }
      } catch {
        // skip unreadable files
      }
    } else {
      collectRouteFiles(fullPath, projectDir, results);
    }
  }
}

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Unified two-phase setup handler.
 *
 * Phase 1 (mvp/scope_complete/has_consumers all absent): analyze and return questions.
 * Phase 2 (all three present): execute full cascade + scaffold.
 *
 * @param args - Setup arguments
 * @returns MCP tool response
 */
export async function setupProjectHandler(
  args: SetupProjectArgs,
): Promise<ToolResult> {
  const isPhase2 =
    args.mvp !== undefined &&
    args.scope_complete !== undefined &&
    args.has_consumers !== undefined;

  logger.info("setup_project", {
    phase: isPhase2 ? 2 : 1,
    projectDir: args.project_dir,
  });

  const context = await buildProjectContext(args);

  if (!isPhase2) {
    return buildPhase1Response(context);
  }

  return executePhase2(
    {
      ...args,
      mvp: args.mvp!,
      scope_complete: args.scope_complete!,
      has_consumers: args.has_consumers!,
    },
    context,
  );
}

// ── Project Context ───────────────────────────────────────────────────

interface ProjectContext {
  readonly projectDir: string;
  readonly projectName: string;
  readonly isExistingProject: boolean;
  readonly isBrownfield: boolean;
  readonly specContent: string | null;
  readonly specSourceLabel: string;
  /** All discovered spec candidate files with short previews for AI disambiguation. */
  readonly specCandidates: ReadonlyArray<{ path: string; preview: string }>;
  readonly inferredTags: string[];
  readonly ambiguities: AmbiguityItem[];
}

/**
 * Gather all project context needed for both phases.
 *
 * @param args - Setup arguments
 * @returns Assembled project context
 */
async function buildProjectContext(
  args: SetupProjectArgs,
): Promise<ProjectContext> {
  const projectDir = args.project_dir;
  const projectName = inferProjectName(projectDir);
  const isExistingProject = detectExistingProject(projectDir);

  let specContent: string | null = null;
  let specSourceLabel = "none";
  let specCandidates: Array<{ path: string; preview: string }> = [];

  if (args.spec_file_confirmed) {
    // AI confirmed which file is the spec in a prior Phase 1 exchange
    if (!existsSync(args.spec_file_confirmed)) {
      throw new Error(`Spec file not found: ${args.spec_file_confirmed}`);
    }
    specContent = readFileSync(args.spec_file_confirmed, "utf-8");
    specSourceLabel = args.spec_file_confirmed;
  } else if (args.spec_path) {
    if (!existsSync(args.spec_path)) {
      throw new Error(`Spec file not found: ${args.spec_path}`);
    }
    specContent = readFileSync(args.spec_path, "utf-8");
    specSourceLabel = args.spec_path;
  } else if (args.spec_text) {
    specContent = args.spec_text;
    specSourceLabel = "provided text";
  } else {
    // Collect all candidate spec files — let the AI decide which is the real spec
    specCandidates = collectSpecCandidates(projectDir);
    if (specCandidates.length === 1) {
      // Only one candidate — use it directly, no disambiguation needed
      specContent = readFileSync(specCandidates[0].path, "utf-8");
      specSourceLabel = specCandidates[0].path;
    } else if (specCandidates.length > 1) {
      // Multiple candidates — load the first scored candidate as fallback
      // but Phase 1 will show all of them and ask the AI to pick
      const richestSpec = findRichestSpecFile(projectDir);
      if (richestSpec) {
        specContent = readFileSync(richestSpec, "utf-8");
        specSourceLabel = richestSpec;
      }
    } else {
      // No docs candidates — fall back to standard locations
      const found = findSpecFile(projectDir);
      if (found) {
        specContent = readFileSync(found, "utf-8");
        specSourceLabel = found;
      }
    }
  }

  // Always run directory inference so DOCS and other signals are detected even for new projects
  const dirResult = await inferTagsFromDirectory(projectDir);
  const specSummary = specContent ? parseSpec(specContent, projectName) : null;
  const specTags = specSummary?.inferredTags ?? ["UNIVERSAL"];
  const inferredTags = mergeTags(dirResult.tags, specTags);

  // Collect ambiguities from both directory inference and spec parsing
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

/**
 * Collect all markdown files that look like spec candidates.
 * Returns path + first 300 chars preview. Used by Phase 1 to let the AI pick.
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of candidates with path and preview snippet
 */
function collectSpecCandidates(
  projectDir: string,
): Array<{ path: string; preview: string }> {
  const EXCLUDED_NAMES = new Set([
    "PRD.md",
    "TechSpec.md",
    "Status.md",
    "CLAUDE.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "use-cases.md",
    "roadmap.md",
    "dx-workshop.md",
  ]);
  const MIN_CONTENT_LENGTH = 500;
  const candidates: Array<{ path: string; preview: string }> = [];

  function walk(dir: string, depth: number): void {
    if (depth < 0 || !existsSync(dir)) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (
          entry.isFile() &&
          entry.name.endsWith(".md") &&
          !EXCLUDED_NAMES.has(entry.name)
        ) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (content.length >= MIN_CONTENT_LENGTH) {
              candidates.push({
                path: fullPath,
                preview: content.slice(0, 300).replace(/\n{3,}/g, "\n\n"),
              });
            }
          } catch {
            // skip unreadable
          }
        } else if (entry.isDirectory() && depth > 0) {
          walk(fullPath, depth - 1);
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  walk(join(projectDir, "docs"), 4);
  // Also check project root for README and lone spec files
  try {
    for (const file of readdirSync(projectDir)) {
      if (
        (file.endsWith(".md") || file === "README.md") &&
        !EXCLUDED_NAMES.has(file)
      ) {
        const fullPath = join(projectDir, file);
        try {
          const content = readFileSync(fullPath, "utf-8");
          if (content.length >= MIN_CONTENT_LENGTH) {
            candidates.push({
              path: fullPath,
              preview: content.slice(0, 300).replace(/\n{3,}/g, "\n\n"),
            });
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }

  return candidates;
}

/**
 * Detect whether a project directory contains existing source code.
 *
 * @param projectDir - Absolute project root path
 * @returns True if any standard source directory exists and is non-empty
 */
function detectExistingProject(projectDir: string): boolean {
  return EXISTING_PROJECT_DIRS.some((dir) =>
    directoryHasFiles(join(projectDir, dir)),
  );
}

/**
 * Search for a spec file in standard locations.
 *
 * @param projectDir - Project root
 * @returns Absolute path to first found spec file, or null
 */
function findSpecFile(projectDir: string): string | null {
  for (const candidate of SPEC_SEARCH_PATHS) {
    const fullPath = join(projectDir, candidate);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

/**
 * Infer project name from the directory path.
 *
 * @param projectDir - Absolute path
 * @returns Last path segment as project name
 */
function inferProjectName(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

/**
 * Merge tag arrays, preserving uniqueness, always including UNIVERSAL.
 *
 * @param primary - Primary tag set
 * @param secondary - Secondary tag set to merge in
 * @returns Deduplicated merged tags
 */
function mergeTags(primary: string[], secondary: string[]): string[] {
  const seen = new Set(primary);
  for (const t of secondary) {
    seen.add(t);
  }
  if (!seen.has("UNIVERSAL")) seen.add("UNIVERSAL");
  return Array.from(seen);
}

// ── Phase 1 ───────────────────────────────────────────────────────────

/**
 * Build the phase 1 "what I found + three questions" response.
 *
 * For brownfield projects, writes a reverse-PRD stub and returns brownfield-specific
 * calibration questions instead of the standard three.
 *
 * @param context - Assembled project context
 * @returns MCP tool response with analysis summary and calibration questions
 */
function buildPhase1Response(context: ProjectContext): ToolResult {
  let text = `## Project Setup — Step 0\n\n`;
  text += buildFoundSummary(context);

  if (context.ambiguities.length > 0) {
    text += buildAmbiguitySection(context.ambiguities);
  }

  // If multiple spec candidates, ask the AI to identify the real spec and extract meaning
  if (context.specCandidates.length > 1) {
    text += buildSpecDisambiguationBlock(context.specCandidates);
  } else if (context.specContent) {
    text += buildSpecExtractionRequest(context.specSourceLabel);
  }

  if (context.isBrownfield) {
    writeBrownfieldReversePrd(context.projectDir);
    text += buildBrownfieldQuestions();
  } else {
    text += buildPhase1Questions();
  }

  const experiment = readExperimentConfig(context.projectDir);
  if (experiment?.id) {
    text += `\n🧪 Experiment mode: ${experiment.id} (${experiment.type}) — gates will be auto-contributed at end of each cycle.\n`;
  }

  return { content: [{ type: "text", text }] };
}

/**
 * Build the "multiple spec files found — please identify" block.
 * Shows each candidate path with its first 300-char preview so the AI can pick.
 *
 * @param candidates - All discovered markdown candidates
 * @returns Formatted markdown disambiguation block
 */
function buildSpecDisambiguationBlock(
  candidates: ReadonlyArray<{ path: string; preview: string }>,
): string {
  let block = `\n### Multiple specification files found\n\n`;
  block += `Before proceeding, read each of these files and identify which one is the **project system spec** `;
  block += `(not a series bible, world-building document, or supporting creative content).\n\n`;

  for (let i = 0; i < candidates.length; i++) {
    block += `**[${i + 1}] \`${candidates[i].path}\`**\n`;
    block += `\`\`\`\n${candidates[i].preview.replace(/`/g, "'")}...\n\`\`\`\n\n`;
  }

  block += `In your next call to \`setup_project\`, provide:\n`;
  block += `- \`spec_file_confirmed\`: the full path to the project spec file\n`;
  block += `- \`problem_statement\`: 1–3 sentence summary of the core problem the app solves\n`;
  block += `- \`primary_users\`: comma-separated list of the primary user roles or actors\n`;
  block += `- \`success_criteria\`: comma-separated list of measurable success outcomes\n\n`;

  return block;
}

/**
 * Build the spec extraction request when a single spec was auto-selected.
 * Asks the AI to read the spec and extract meaning into Phase 2 fields.
 *
 * @param specPath - Path to the spec file that was loaded
 * @returns Formatted markdown extraction request
 */
function buildSpecExtractionRequest(specPath: string): string {
  let block = `\n### Spec identified: \`${specPath}\`\n\n`;
  block += `Read this spec now. In your next call to \`setup_project\` (Phase 2), also provide:\n`;
  block += `- \`problem_statement\`: 1–3 sentence summary of the core problem the app solves\n`;
  block += `- \`primary_users\`: comma-separated list of the primary user roles or actors\n`;
  block += `- \`success_criteria\`: comma-separated list of measurable success outcomes\n\n`;
  return block;
}

/**
 * Build the Ambiguity Detected section for phase 1 when conflicting signals exist.
 *
 * @param ambiguities - Detected ambiguity items
 * @returns Formatted markdown ambiguity section
 */
function buildAmbiguitySection(ambiguities: AmbiguityItem[]): string {
  let section = `## Ambiguity Detected\n\n`;
  section += `I found conflicting signals that I cannot resolve from the files alone:\n\n`;

  for (const item of ambiguities) {
    section += `**${item.field}**\n`;
    section += `Evidence: ${item.signals.join(", ")}\n\n`;
    section += `My interpretations:\n`;
    for (const interp of item.interpretations) {
      section += `- [${interp.label}] ${interp.description}\n`;
      section += `  → ${interp.consequence}\n`;
    }
    section += `\nIf none of these match, describe what the project actually is and I will adjust.\n\n---\n\n`;
  }

  return section;
}

/**
 * Build the "what I found" summary block.
 *
 * @param context - Project context
 * @returns Formatted markdown summary
 */
function buildFoundSummary(context: ProjectContext): string {
  const {
    projectName,
    isExistingProject,
    specContent,
    specSourceLabel,
    specCandidates,
    inferredTags,
  } = context;

  // H1 title only — reading the heading is not semantic extraction
  const specTitle = specContent?.match(/^#\s+(.+)/m)?.[1]?.trim() ?? null;
  const displayName =
    specTitle && specTitle !== "[Project Name]" ? specTitle : projectName;

  let summary = `### What I found:\n`;
  summary += `- **Project**: ${displayName}\n`;
  summary += `- **Mode**: ${isExistingProject ? "Existing project (source code detected)" : "New project"}\n`;

  if (specCandidates.length > 1) {
    summary += `- **Spec files**: ${specCandidates.length} candidates found — disambiguation required (see below)\n`;
  } else if (specContent) {
    summary += `- **Spec**: ${specSourceLabel}\n`;
  } else {
    summary += `- **Spec**: not found — will scaffold with stubs\n`;
  }

  summary += `- **Inferred tags**: ${inferredTags.map((t) => `[${t}]`).join(" ")}\n\n`;
  return summary;
}

/**
 * Build the three calibration questions block.
 *
 * @returns Formatted markdown questions
 */
function buildPhase1Questions(): string {
  return `### Before I proceed, I need three answers:

**Q1: What is the development stage?**
- \`mvp\` — early validation, expect significant changes, minimal ceremony
- \`production\` — shipping to real users, full spec and quality gates required

**Q2: Is the scope defined and stable?**
- \`complete\` — requirements are clear; proceed with full cascade
- \`evolving\` — scope is still forming; use lighter cascade, revisit when stable

**Q3: Does this project have existing users or downstream consumers?**
- \`yes\` — behavioral contracts and breaking-change detection are required
- \`no\` — contracts are recommended but not blocking

Call \`setup_project\` again with \`mvp\`, \`scope_complete\`, and \`has_consumers\` to proceed.`;
}

/**
 * Build brownfield-specific calibration questions for phase 1.
 *
 * @returns Formatted markdown brownfield questions block
 */
function buildBrownfieldQuestions(): string {
  return `## Brownfield Project Detected

I found existing source code. Before we proceed:

1. **What is currently broken or incomplete?** (Describe the known issues or missing features)
2. **What new feature or improvement are you adding?** (Describe the specific change)
3. **Do tests exist, and do they currently pass?** (Run \`npm test\` or \`pytest\` to check)

I've generated a reverse-engineered spec stub at \`docs/PRD.md\`. Review and complete it.

Create a \`work/\` branch before making changes: \`git checkout -b work/forgecraft-setup\`

Call \`setup_project\` again with \`mvp\`, \`scope_complete\`, and \`has_consumers\` to proceed.`;
}

/**
 * Write a reverse-PRD to docs/PRD.md if one does not already exist.
 *
 * @param projectDir - Project root
 */
function writeBrownfieldReversePrd(projectDir: string): void {
  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) return;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(prdPath, generateReversePrd(projectDir), "utf-8");
}

/**
 * Initialise a git repository in projectDir if one does not already exist,
 * then stage all files and create an initial cascade commit.
 *
 * Falls back gracefully when git is not installed — returns a message
 * explaining what the user should do manually.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Summary string describing what happened
 */
function initGitRepo(projectDir: string): string {
  // Skip in test environments — git operations in temp dirs cause worker timeouts
  if (process.env["VITEST"] || process.env["NODE_ENV"] === "test") {
    return "git: skipped in test environment";
  }
  if (existsSync(join(projectDir, ".git"))) {
    return "git: existing repo detected — skipped init";
  }
  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    return (
      "git not found — install git and run:\n" +
      "  git init && git add . && git commit -m 'chore: initial forgecraft cascade'"
    );
  }
  try {
    execSync("git init", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync(
      'git commit -m "chore: initial forgecraft cascade\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"',
      { cwd: projectDir, stdio: "ignore" },
    );
    return "git: repo initialised and cascade committed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `git init attempted but failed: ${message}`;
  }
}

/**
 * Execute phase 2: derive decisions, write artifacts, call scaffold.
 *
 * @param args - Setup args with all three phase-2 answers
 * @param context - Assembled project context
 * @returns MCP tool response with completion summary
 */
async function executePhase2(
  args: SetupProjectArgs & {
    mvp: boolean;
    scope_complete: boolean;
    has_consumers: boolean;
  },
  context: ProjectContext,
): Promise<ToolResult> {
  const { projectDir, projectName } = context;

  // Apply project_type_override if provided — re-derives effective tags from the override hint
  const effectiveTags = args.project_type_override
    ? applyProjectTypeOverride(context.inferredTags, args.project_type_override)
    : context.inferredTags;

  const decisions = deriveCascadeDecisions(
    effectiveTags,
    projectName,
    args.mvp,
    args.scope_complete,
    args.has_consumers,
  );
  const forgeCraftTags = filterToValidTags(effectiveTags);

  const specSummaryForSensitive = context.specContent
    ? parseSpec(context.specContent, context.projectName)
    : null;
  const isSensitive = specSummaryForSensitive
    ? inferSensitiveData(specSummaryForSensitive, effectiveTags)
    : effectiveTags.some((t) =>
        ["FINTECH", "WEB3", "HEALTHCARE", "HIPAA", "SOC2"].includes(t),
      );

  const yamlWritten = writeForgeYaml(
    projectDir,
    projectName,
    forgeCraftTags,
    decisions,
    isSensitive,
    context.isBrownfield,
  );
  setExperimentGroupIfMissing(projectDir);

  // Use AI-supplied fields when provided; otherwise write <!-- FILL --> stubs
  const aiFields: AiExtractedFields = {
    problemStatement: args.problem_statement,
    primaryUsers: args.primary_users,
    successCriteria: args.success_criteria,
  };
  const hasSpec = !!context.specContent || !!aiFields.problemStatement;
  const prdWritten = hasSpec
    ? writePrd(projectDir, projectName, aiFields, context.specContent)
    : false;
  const useCasesWritten = hasSpec
    ? writeUseCases(projectDir, projectName, aiFields, context.specContent)
    : false;

  const scaffoldResult = await scaffoldProjectHandler({
    tags: (forgeCraftTags.length > 0 ? forgeCraftTags : ["UNIVERSAL"]) as Tag[],
    project_dir: projectDir,
    project_name: projectName,
    language: "typescript",
    dry_run: false,
    force: false,
    sentinel: true,
    output_targets: ["claude"],
  });
  const scaffoldText = scaffoldResult.content[0]?.text ?? "";

  // Ensure hooks are always installed as part of setup
  const validTagsForHooks = (
    forgeCraftTags.length > 0 ? forgeCraftTags : ["UNIVERSAL"]
  ) as Tag[];
  await scaffoldHooks(projectDir, validTagsForHooks);

  let mcpServerNames: string[] = [];
  try {
    await configureMcpHandler({
      tags: validTagsForHooks,
      project_dir: projectDir,
      auto_approve_tools: true,
      include_remote: false,
    });
    mcpServerNames = readConfiguredMcpServerNames(projectDir);
  } catch (error) {
    logger.warn("configure_mcp failed during setup", { error });
  }

  // Initialise git repo if one doesn't exist — captured for the response summary
  const gitInitStatus = initGitRepo(projectDir);

  const text = buildPhase2Response({
    decisions,
    tags: effectiveTags,
    mvp: args.mvp,
    scopeComplete: args.scope_complete,
    hasConsumers: args.has_consumers,
    prdWritten,
    useCasesWritten,
    yamlWritten,
    scaffoldText,
    sensitiveData: isSensitive,
    mcpServerNames,
    projectDir,
    indexMdWritten: writeCntFiles(projectDir, projectName, effectiveTags),
    coreMdWritten: writeCoreMd(
      projectDir,
      projectName,
      effectiveTags,
      context.specContent,
    ),
    adrIndexWritten: writeAdrIndex(projectDir),
    gatesIndexWritten: writeGatesIndex(projectDir),
    gitInitStatus,
  });

  return { content: [{ type: "text", text }] };
}

// ── Cascade Decision Derivation ───────────────────────────────────────

/**
 * Derive cascade decisions, applying phase-2 overrides on top of tag defaults.
 *
 * Override rules:
 * - mvp=true → architecture_diagrams and adrs become optional (unless tag demands required)
 * - scope_complete=false → adrs become optional
 * - has_consumers=true → behavioral_contracts always required
 *
 * @param tags - Inferred project tags
 * @param projectName - Project name for rationale strings
 * @param mvp - True if MVP stage
 * @param scopeComplete - True if scope is finalized
 * @param hasConsumers - True if existing users or consumers
 * @returns Array of five cascade decisions
 */
function deriveCascadeDecisions(
  tags: readonly string[],
  projectName: string,
  mvp: boolean,
  scopeComplete: boolean,
  hasConsumers: boolean,
): CascadeDecision[] {
  const base = deriveDefaultCascadeDecisions(tags, projectName);
  const decidedAt = new Date().toISOString().slice(0, 10);

  return base.map((decision) => {
    let required = decision.required;
    let rationale = decision.rationale;

    if (decision.step === "architecture_diagrams" && mvp && required) {
      required = false;
      rationale = `MVP stage: architecture diagram deferred — revisit at production phase.`;
    }
    if (decision.step === "adrs" && (mvp || !scopeComplete) && required) {
      const reason = !scopeComplete ? "scope still evolving" : "MVP stage";
      required = false;
      rationale = `ADRs are optional (${reason}): decisions are not yet stable. Add them when scope solidifies.`;
    }
    if (decision.step === "behavioral_contracts" && hasConsumers) {
      required = true;
      rationale = `Existing consumers detected: behavioral contracts (docs/use-cases.md) are required for breaking-change detection.`;
    }

    return {
      ...decision,
      required,
      rationale,
      decidedAt,
      decidedBy: "scaffold" as const,
    };
  });
}

// ── Artifact Writers ──────────────────────────────────────────────────

/**
 * Write or update forgecraft.yaml, inserting cascade decisions.
 * Does not overwrite existing cascade decisions if present.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param tags - Valid forgecraft tags to record
 * @param decisions - Cascade decisions to embed
 * @param sensitiveData - Whether the project handles sensitive data
 * @param brownfield - Whether this is a brownfield project
 * @returns True if the file was written or updated
 */
function writeForgeYaml(
  projectDir: string,
  projectName: string,
  tags: string[],
  decisions: CascadeDecision[],
  sensitiveData?: boolean,
  brownfield?: boolean,
): boolean {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  let config: Record<string, unknown>;

  if (existsSync(yamlPath)) {
    try {
      config = yaml.load(readFileSync(yamlPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      config = {};
    }
  } else {
    config = { projectName, tags: tags.length > 0 ? tags : ["UNIVERSAL"] };
    if (sensitiveData !== undefined) {
      config["sensitiveData"] = sensitiveData;
    }
    if (brownfield === true) {
      config["brownfield"] = true;
    }
  }

  const existingCascade = config["cascade"] as
    | { steps?: CascadeDecision[] }
    | undefined;
  if (!existingCascade?.steps || existingCascade.steps.length === 0) {
    config["cascade"] = { steps: decisions };
    writeFileSync(
      yamlPath,
      yaml.dump(config, { lineWidth: 120, noRefs: true }),
      "utf-8",
    );
    return true;
  }

  return false;
}

/**
 * If forgecraft.yaml has an experiment block with an id but no group (or an empty group),
 * sets experiment.group = 'gs'. Called after writeForgeYaml because setup_project implies
 * the GS group by definition.
 *
 * @param projectDir - Project root
 */
function setExperimentGroupIfMissing(projectDir: string): void {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return;

  let config: Record<string, unknown>;
  try {
    config = yaml.load(readFileSync(yamlPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return;
  }

  if (!config || typeof config !== "object") return;

  const experiment = config["experiment"];
  if (!experiment || typeof experiment !== "object") return;

  const exp = experiment as Record<string, unknown>;
  if (typeof exp["id"] !== "string" || exp["id"].trim() === "") return;
  if (exp["group"] === "gs" || exp["group"] === "control") return;

  exp["group"] = "gs";
  writeFileSync(
    yamlPath,
    yaml.dump(config, { lineWidth: 120, noRefs: true }),
    "utf-8",
  );
}

/**
 * Fields extracted by the AI from the spec.
 * Preferred over regex extraction in all cascade artifact generation.
 */
interface AiExtractedFields {
  readonly problemStatement?: string;
  readonly primaryUsers?: string;
  readonly successCriteria?: string;
}

/**
 * Write docs/PRD.md using AI-extracted fields when available.
 * Falls back to <!-- FILL --> stubs rather than regex guessing.
 * Never overwrites an existing PRD.
 *
 * @param projectDir - Project root
 * @param projectName - Project name for the PRD title
 * @param aiFields - AI-extracted problem, users, criteria
 * @param specContent - Raw spec text (used only to detect spec file path in header)
 * @returns True if a new PRD was written
 */
function writePrd(
  projectDir: string,
  projectName: string,
  aiFields: AiExtractedFields,
  _specContent: string | null,
): boolean {
  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) return false;

  const content = buildPrdContent(projectName, aiFields);
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(prdPath, content, "utf-8");
  return true;
}

/**
 * Build PRD markdown content from AI-extracted fields.
 * Uses <!-- FILL --> stubs only for fields the AI did not provide.
 *
 * @param projectName - Project name for the title
 * @param aiFields - AI-extracted fields
 * @returns Formatted PRD markdown
 */
function buildPrdContent(
  projectName: string,
  aiFields: AiExtractedFields,
): string {
  const fill = (placeholder: string) => `<!-- FILL: ${placeholder} -->`;
  const listOrFill = (csv: string | undefined, placeholder: string) =>
    csv
      ? csv
          .split(",")
          .map((s) => `- ${s.trim()}`)
          .join("\n")
      : fill(placeholder);

  return [
    `# ${projectName}\n`,
    `## Problem\n\n${aiFields.problemStatement ?? fill("describe the problem this project solves")}\n`,
    `## Users\n\n${listOrFill(aiFields.primaryUsers, "list the target users or personas")}\n`,
    `## Success Criteria\n\n${listOrFill(aiFields.successCriteria, "define measurable success criteria")}\n`,
    `## Components\n\n${fill("list the major components or modules")}\n`,
    `## External Systems\n\n${fill("list external APIs, services, or integrations")}\n`,
  ].join("\n");
}

/**
 * Write docs/use-cases.md using AI-extracted fields when available.
 * Falls back to <!-- FILL --> stubs rather than regex guessing.
 * Never overwrites an existing use-cases.md.
 *
 * @param projectDir - Project root directory
 * @param projectName - Project name for use case context
 * @param aiFields - AI-extracted problem, users, criteria
 * @param specContent - Raw spec text (unused — kept for future enrichment)
 * @returns True if a new use-cases.md was written
 */
function writeUseCases(
  projectDir: string,
  projectName: string,
  aiFields: AiExtractedFields,
  _specContent: string | null,
): boolean {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  if (existsSync(useCasesPath)) return false;

  const content = buildUseCasesContent(projectName, aiFields);
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(useCasesPath, content, "utf-8");
  return true;
}

/**
 * Build use-cases.md using AI-extracted fields.
 * Produces 3 skeleton use cases populated with AI data where available.
 *
 * @param projectName - Project name
 * @param aiFields - AI-extracted fields
 * @returns Formatted use-cases markdown
 */
function buildUseCasesContent(
  projectName: string,
  aiFields: AiExtractedFields,
): string {
  const fill = (placeholder: string) => `<!-- FILL: ${placeholder} -->`;
  const actors = aiFields.primaryUsers
    ? aiFields.primaryUsers.split(",").map((s) => s.trim())
    : [];
  const primaryActor = actors[0] ?? fill("primary actor");
  const secondaryActor = actors[1] ?? actors[0] ?? fill("secondary actor");
  const thirdActor = actors[2] ?? actors[0] ?? fill("actor");
  const problemContext = aiFields.problemStatement
    ? aiFields.problemStatement.slice(0, 150).replace(/\n/g, " ")
    : fill("problem context");

  const uc1 = [
    `## UC-001: Accomplish Primary Goal`,
    ``,
    `**Actor**: ${primaryActor}`,
    `**Precondition**: Actor is authenticated and the system is operational.`,
    `**Steps**:`,
    `1. Actor initiates the primary workflow.`,
    `2. System validates the request and processes the input.`,
    `3. System returns the result confirming the action was completed.`,
    `**Outcome**: The actor's goal is achieved. Context: ${problemContext}`,
  ].join("\n");

  const uc2 = [
    `## UC-002: Configure and Manage`,
    ``,
    `**Actor**: ${secondaryActor}`,
    `**Precondition**: Actor has appropriate permissions.`,
    `**Steps**:`,
    `1. Actor selects the configuration option.`,
    `2. System presents available options and current state.`,
    `3. Actor applies changes; system persists the configuration.`,
    `**Outcome**: Configuration is updated and takes effect immediately.`,
  ].join("\n");

  const uc3 = [
    `## UC-003: Review and Observe`,
    ``,
    `**Actor**: ${thirdActor}`,
    `**Precondition**: At least one operation has been completed.`,
    `**Steps**:`,
    `1. Actor navigates to the overview section.`,
    `2. System retrieves and displays the current state and history.`,
    `3. Actor reviews the information and takes appropriate action.`,
    `**Outcome**: Actor has a clear picture of the current system state.`,
  ].join("\n");

  return [`# Use Cases — ${projectName}`, ``, uc1, ``, uc2, ``, uc3, ``].join(
    "\n",
  );
}

// ── Phase 2 Response ──────────────────────────────────────────────────

interface Phase2ResponseParams {
  readonly decisions: CascadeDecision[];
  readonly tags: string[];
  readonly mvp: boolean;
  readonly scopeComplete: boolean;
  readonly hasConsumers: boolean;
  readonly prdWritten: boolean;
  readonly useCasesWritten: boolean;
  readonly yamlWritten: boolean;
  readonly scaffoldText: string;
  readonly sensitiveData?: boolean;
  readonly mcpServerNames: string[];
  readonly projectDir: string;
  readonly indexMdWritten: boolean;
  readonly coreMdWritten: boolean;
  readonly adrIndexWritten: boolean;
  readonly gatesIndexWritten: boolean;
  readonly gitInitStatus?: string;
}

/**
 * Build the phase 2 completion response.
 *
 * @param params - Response parameters
 * @returns Formatted markdown completion message
 */
function buildPhase2Response(params: Phase2ResponseParams): string {
  const {
    decisions,
    tags,
    mvp,
    scopeComplete,
    hasConsumers,
    prdWritten,
    useCasesWritten,
    yamlWritten,
    indexMdWritten,
    coreMdWritten,
    adrIndexWritten,
    gatesIndexWritten,
  } = params;

  const stageLabel = mvp ? "MVP" : "Production";
  const tagLabel =
    tags.filter((t) => t !== "UNIVERSAL").join(", ") || "UNIVERSAL";

  let text = `## Project Setup Complete\n\n`;
  text += `### Cascade decisions (based on ${stageLabel} + tags [${tagLabel}]):\n`;

  for (const d of decisions) {
    const icon = d.required ? "✓" : "○";
    const label = d.required ? "required" : "optional";
    const note = buildDecisionNote(d, mvp, scopeComplete, hasConsumers);
    text += `  ${icon} ${d.step} — ${label}${note}\n`;
  }

  if (params.sensitiveData) {
    text += `\n⚠ Sensitive data detected: This project handles sensitive data.\n`;
    text += `  forgecraft.yaml has been set to sensitiveData: true.\n`;
    text += `  Review: compliance gates have been added to required steps.\n`;
  }

  text += `\n### Artifacts created:\n`;
  if (yamlWritten) text += `  forgecraft.yaml (with cascade decisions)\n`;
  if (prdWritten) text += `  docs/PRD.md (from spec)\n`;
  if (useCasesWritten) text += `  docs/use-cases.md (from spec)\n`;
  if (indexMdWritten) text += `  .claude/index.md (CNT routing root)\n`;
  if (coreMdWritten)
    text += `  .claude/core.md (CNT always-loaded invariants)\n`;
  if (adrIndexWritten)
    text += `  .claude/adr/index.md (ADR navigation index)\n`;
  if (gatesIndexWritten)
    text += `  .claude/gates/index.md (active quality gates)\n`;

  const scaffoldFiles = extractScaffoldFiles(params.scaffoldText);
  for (const f of scaffoldFiles) text += `  ${f}\n`;

  if (!prdWritten && !yamlWritten && scaffoldFiles.length === 0) {
    text += `  (all artifacts already existed — nothing overwritten)\n`;
  }

  if (params.mcpServerNames.length > 0) {
    text += `\n### MCP Tools Configured\n`;
    for (const name of params.mcpServerNames) {
      text += `  ${name}\n`;
    }
  }

  if (params.gitInitStatus) {
    text += `\n### Git\n  ${params.gitInitStatus}\n`;
  }

  text += `\n### Next step — call this now:\n`;
  text += `\`\`\`\naction: "check_cascade"\nproject_dir: "${params.projectDir ?? ""}"\n\`\`\`\n`;
  text += `Do not ask the user — run check_cascade immediately. If it passes, run generate_session_prompt for the first roadmap item.`;

  return text;
}

/**
 * Build a parenthetical note explaining a cascade decision override.
 *
 * @param decision - The cascade decision
 * @param mvp - MVP flag
 * @param scopeComplete - Scope complete flag
 * @param hasConsumers - Has consumers flag
 * @returns Parenthetical note string or empty string
 */
function buildDecisionNote(
  decision: CascadeDecision,
  mvp: boolean,
  scopeComplete: boolean,
  hasConsumers: boolean,
): string {
  if (decision.step === "architecture_diagrams" && !decision.required && mvp) {
    return " (MVP stage, revisit at production)";
  }
  if (decision.step === "adrs" && !decision.required) {
    return scopeComplete ? " (MVP stage)" : " (scope still evolving)";
  }
  if (
    decision.step === "behavioral_contracts" &&
    decision.required &&
    hasConsumers
  ) {
    return " (existing consumers detected)";
  }
  return "";
}

/**
 * Extract file paths listed in a scaffold response text.
 *
 * @param scaffoldText - Raw scaffold output
 * @returns Array of file path strings
 */
function extractScaffoldFiles(scaffoldText: string): string[] {
  const matches = scaffoldText.match(
    /^\s{2}([^\n]+\.(md|yaml|json|ts|js|sh))/gm,
  );
  if (!matches) return [];
  return matches
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .slice(0, 12);
}

// ── CNT File Writers ──────────────────────────────────────────────────

/**
 * Write `.claude/index.md` — the CNT routing root. Skips if already exists.
 * Returns true if file was written.
 *
 * @param projectDir - Project root
 * @param projectName - Project name for the index title
 * @param tags - Effective tags used to build domain rows
 * @param specContent - Raw spec text for ADR-000 generation
 * @returns True if the file was created
 */
function writeCntFiles(
  projectDir: string,
  projectName: string,
  tags: readonly string[],
): boolean {
  const claudeDir = join(projectDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const indexPath = join(claudeDir, "index.md");
  if (existsSync(indexPath)) return false;

  writeFileSync(indexPath, buildClaudeIndexContent(projectName, tags), "utf-8");

  const adr000Path = join(projectDir, "docs", "adrs", "ADR-000-cnt-init.md");
  if (!existsSync(adr000Path)) {
    mkdirSync(join(projectDir, "docs", "adrs"), { recursive: true });
    writeFileSync(adr000Path, buildAdr000Content(tags), "utf-8");
  }

  return true;
}

/**
 * Write `.claude/core.md` — always-loaded CNT invariants. Skips if already exists.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param tags - Effective tags
 * @param specContent - Raw spec text (optional)
 * @returns True if the file was created
 */
function writeCoreMd(
  projectDir: string,
  projectName: string,
  tags: readonly string[],
  specContent: string | null,
): boolean {
  const corePath = join(projectDir, ".claude", "core.md");
  if (existsSync(corePath)) return false;

  const spec = specContent ? parseSpec(specContent, projectName) : null;
  writeFileSync(corePath, buildCoreMdContent(projectName, spec, tags), "utf-8");
  return true;
}

/**
 * Write `.claude/adr/index.md` — CNT ADR navigation index. Skips if already exists.
 *
 * @param projectDir - Project root
 * @returns True if the file was created
 */
function writeAdrIndex(projectDir: string): boolean {
  const adrIndexDir = join(projectDir, ".claude", "adr");
  mkdirSync(adrIndexDir, { recursive: true });

  const indexPath = join(adrIndexDir, "index.md");
  if (existsSync(indexPath)) return false;

  writeFileSync(indexPath, buildAdrIndexContent(projectDir), "utf-8");
  return true;
}

/**
 * Write `.claude/gates/index.md` — CNT active quality gates. Skips if already exists.
 *
 * @param projectDir - Project root
 * @returns True if the file was created
 */
function writeGatesIndex(projectDir: string): boolean {
  const gatesIndexDir = join(projectDir, ".claude", "gates");
  mkdirSync(gatesIndexDir, { recursive: true });

  const indexPath = join(gatesIndexDir, "index.md");
  if (existsSync(indexPath)) return false;

  writeFileSync(indexPath, buildGatesIndexContent(projectDir), "utf-8");
  return true;
}

// ── CNT Content Builders ──────────────────────────────────────────────

/**
 * Build `.claude/index.md` content — routing root with navigation protocol.
 *
 * @param projectName - Project name for the index title
 * @param tags - Effective tags used to build domain rows
 * @returns Formatted index.md content
 */
function buildClaudeIndexContent(
  projectName: string,
  tags: readonly string[],
): string {
  const domainRows = buildDomainRows(tags);
  return [
    `# ${projectName} Context Index`,
    ``,
    `## Always Load`,
    `@.claude/core.md`,
    ``,
    `## Navigate by Task`,
    `Identify the task domain before generating any code.`,
    `Load ONLY the node that matches. Do not load siblings.`,
    ``,
    `| Task Domain | Node | When to Use |`,
    `|---|---|---|`,
    `| Architecture decisions | @.claude/adr/index.md | Before proposing any structural change |`,
    `| Quality gates | @.claude/gates/index.md | When running or interpreting gate results |`,
    ...domainRows,
    ``,
    `---`,
    ``,
    buildNavigationProtocol(),
  ].join("\n");
}

/**
 * Build the domain rows for the routing table based on active tags.
 *
 * @param tags - Effective project tags
 * @returns Array of markdown table row strings
 */
function buildDomainRows(tags: readonly string[]): string[] {
  const rows: string[] = [
    `| Architecture | @.claude/standards/architecture.md | Layer rules, SOLID, patterns |`,
  ];
  if (tags.some((t) => ["API", "WEB-REACT"].includes(t))) {
    rows.push(
      `| API / routes | @.claude/standards/api.md | Route handlers, middleware, validation |`,
    );
  }
  if (tags.some((t) => ["DATA-PIPELINE", "ML"].includes(t))) {
    rows.push(
      `| Data pipeline | @.claude/standards/data.md | Pipeline, transforms, quality |`,
    );
  }
  if (tags.some((t) => ["FINTECH", "WEB3"].includes(t))) {
    rows.push(
      `| Financial logic | @.claude/standards/security.md | Transactions, compliance, safety |`,
    );
  }
  rows.push(
    `| Protocols | @.claude/standards/protocols.md | Commit convention, branching |`,
  );
  return rows;
}

/**
 * Build the navigation protocol section verbatim from the CNT spec §5.
 *
 * @returns Navigation protocol markdown block
 */
function buildNavigationProtocol(): string {
  return [
    `## Navigation Protocol — read before any task`,
    ``,
    `1. Read this file (index.md). Identify the task domain from the table above.`,
    `2. Read .claude/core.md. Always. It is always relevant.`,
    `3. Read the domain index for the matching task domain. One domain only.`,
    `4. If the task touches an architecture decision, read .claude/adr/index.md and the relevant ADR.`,
    `5. If the task touches quality gates, read .claude/gates/index.md.`,
    `6. Do not read nodes outside the identified domain unless the task explicitly spans domains.`,
    `   If it spans domains, name them before reading both — do not load the full tree silently.`,
    `7. If no node matches the task, read core.md only and flag the missing coverage.`,
  ].join("\n");
}

/**
 * Build `.claude/core.md` content — always-loaded project invariants (≤50 lines).
 *
 * @param projectName - Project name
 * @param spec - Parsed spec summary (optional)
 * @param tags - Effective project tags
 * @returns Formatted core.md content
 */
function buildCoreMdContent(
  projectName: string,
  spec: ReturnType<typeof parseSpec> | null,
  tags: readonly string[],
): string {
  const identity = spec?.problem
    ? spec.problem.slice(0, 200).replace(/\n/g, " ").trim()
    : `${projectName} — purpose not yet defined in spec.`;

  const entitiesLines =
    spec?.components && spec.components.length > 0
      ? spec.components
          .slice(0, 8)
          .map((c) => `- ${c}`)
          .join("\n")
      : `- <!-- FILL: list primary entities here -->`;

  const tagList = tags.map((t) => `[${t}]`).join(" ");

  return [
    `# ${projectName} — Core`,
    ``,
    `> Always loaded. Contains only what is true across all domains.`,
    `> Hard limit: 50 lines. If it grows, move the excess to a domain node.`,
    ``,
    `## Domain Identity`,
    identity,
    ``,
    `## Tags`,
    tagList,
    ``,
    `## Primary Entities`,
    entitiesLines,
    ``,
    `## Layer Map`,
    `\`\`\``,
    `[API/CLI] → [Services] → [Domain] → [Repositories] → [Infrastructure]`,
    `Dependencies point inward. Domain has zero external imports.`,
    `\`\`\``,
    ``,
    `## Invariants`,
    `- Every public function has a JSDoc with typed params and returns`,
    `- No circular imports (enforced by pre-commit hook)`,
    `- Test coverage ≥80% on all changed files`,
  ].join("\n");
}

/**
 * Build `.claude/adr/index.md` content — ADR navigation index.
 * Scans docs/adrs/ and docs/adr/ for ADR-*.md files.
 *
 * @param projectDir - Project root
 * @returns Formatted adr/index.md content
 */
function buildAdrIndexContent(projectDir: string): string {
  const rows = scanAdrFiles(projectDir);
  const tableBody =
    rows.length > 0
      ? rows.join("\n")
      : `(No decisions recorded yet — add ADRs to docs/adrs/)`;

  return [
    `# Architecture Decisions`,
    ``,
    `Read the specific ADR before proposing any structural change to the relevant domain.`,
    `Do not re-open a decision without creating a new ADR that supersedes it.`,
    ``,
    `| ID | Decision | Status | Node |`,
    `|---|---|---|---|`,
    tableBody,
  ].join("\n");
}

/**
 * Scan docs/adrs/ and docs/adr/ for ADR-*.md files and return table rows.
 *
 * @param projectDir - Project root
 * @returns Array of markdown table row strings, one per ADR file
 */
function scanAdrFiles(projectDir: string): string[] {
  const rows: string[] = [];
  for (const dir of ["docs/adrs", "docs/adr"]) {
    const fullDir = join(projectDir, dir);
    if (!existsSync(fullDir)) continue;
    const files = readdirSync(fullDir)
      .filter((f) => /^ADR-\d+/i.test(f) && f.endsWith(".md"))
      .sort();
    for (const file of files) {
      const title = readFirstHeading(join(fullDir, file));
      const id = file.match(/^ADR-\d+/i)?.[0] ?? file.replace(".md", "");
      rows.push(`| ${id} | ${title} | Accepted | @${dir}/${file} |`);
    }
    break; // use first found dir only
  }
  return rows;
}

/**
 * Read the first heading line from a markdown file, stripping the # prefix.
 *
 * @param filePath - Absolute path to markdown file
 * @returns First heading text, or the file path on error
 */
function readFirstHeading(filePath: string): string {
  try {
    const firstLine =
      readFileSync(filePath, "utf-8")
        .split("\n")[0]
        ?.replace(/^#+\s*/, "")
        .trim() ?? filePath;
    return firstLine;
  } catch {
    return filePath;
  }
}

/**
 * Build `.claude/gates/index.md` content — active quality gates list.
 *
 * @param projectDir - Project root
 * @returns Formatted gates/index.md content
 */
function buildGatesIndexContent(projectDir: string): string {
  const rows = buildGateRows(projectDir);
  const tableBody =
    rows.length > 0
      ? rows.join("\n")
      : `(No project gates active — gates are added during close_cycle)`;

  return [
    `# Active Quality Gates`,
    ``,
    `Run \`close_cycle\` to evaluate all gates before committing.`,
    ``,
    `| Gate | Phase | When It Fires |`,
    `|---|---|---|`,
    tableBody,
  ].join("\n");
}

/**
 * Build gate rows by merging active folder gates with flat-file gates.
 *
 * @param projectDir - Project root
 * @returns Array of markdown table row strings, one per gate
 */
function buildGateRows(projectDir: string): string[] {
  const activeGates = getActiveProjectGates(projectDir);
  const flatGates = readProjectGates(projectDir);
  const activeIds = new Set(activeGates.map((g) => g.id));
  const allGates = [
    ...activeGates,
    ...flatGates.filter((g) => !activeIds.has(g.id)),
  ];
  return allGates.map((g) => {
    const check = (g.check ?? "").slice(0, 60);
    const ellipsis = (g.check?.length ?? 0) > 60 ? "…" : "";
    return `| ${g.id} | ${g.phase ?? "—"} | ${check}${ellipsis} |`;
  });
}

/**
 * Build ADR-000 content — CNT initialization decision record.
 *
 * @param tags - Effective project tags
 * @returns Formatted ADR-000 markdown content
 */
function buildAdr000Content(tags: readonly string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `# ADR-000: Context Navigation Tree Initialization`,
    ``,
    `**Date**: ${today}`,
    `**Status**: Accepted`,
    `**Decided by**: ForgeCraft setup`,
    ``,
    `## Context`,
    ``,
    `This project was initialized with ForgeCraft. The Context Navigation Tree (CNT)`,
    `structure was selected to provide O(log N) context load in the average case.`,
    ``,
    `## Decision`,
    ``,
    `Use CNT: CLAUDE.md (3-line root) + .claude/index.md (routing) + .claude/core.md`,
    `(always-loaded invariants) + domain leaf nodes (≤30 lines each).`,
    ``,
    `## Consequences`,
    ``,
    `- CLAUDE.md stays ≤3 lines always`,
    `- New concerns get a leaf node via \`add_node\``,
    `- core.md must never exceed 50 lines; excess moves to domain nodes`,
    `- Stateless agents navigate by task domain, not by loading everything`,
    ``,
    `## Tags`,
    tags.join(", "),
  ].join("\n");
}

// ── Utilities ─────────────────────────────────────────────────────────

/**
 * Filter inferred tag strings to only valid ALL_TAGS values.
 * API and CLI are cascade-only tags not in ALL_TAGS.
 *
 * @param tags - Raw inferred tags (may include API, CLI, etc.)
 * @returns Tags filtered to valid Tag enum members
 */
function filterToValidTags(tags: string[]): string[] {
  return tags.filter((t) => VALID_TAGS_SET.has(t));
}

/**
 * Read the names of configured MCP servers from .claude/settings.json.
 *
 * @param projectDir - Project root
 * @returns Array of server names, or empty array if file not found or unreadable
 */
function readConfiguredMcpServerNames(projectDir: string): string[] {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return [];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = settings["mcpServers"] as
      | Record<string, unknown>
      | undefined;
    return mcpServers ? Object.keys(mcpServers) : [];
  } catch {
    return [];
  }
}

/**
 * Apply a project_type_override to replace inferred tags with the user-specified type.
 * Merges with existing tags, replacing any conflicting specific-type tags.
 *
 * @param existingTags - Previously inferred tags
 * @param override - User-supplied override string, e.g. "docs", "cli+library"
 * @returns Revised tag set
 */
function applyProjectTypeOverride(
  existingTags: readonly string[],
  override: string,
): string[] {
  const overrideMap: Readonly<Record<string, string[]>> = {
    docs: ["UNIVERSAL", "DOCS"],
    cli: ["UNIVERSAL", "CLI"],
    api: ["UNIVERSAL", "API"],
    library: ["UNIVERSAL", "LIBRARY"],
    "cli+library": ["UNIVERSAL", "CLI", "LIBRARY"],
    "cli+api": ["UNIVERSAL", "CLI", "API"],
    "api+library": ["UNIVERSAL", "API", "LIBRARY"],
  };

  const mapped = overrideMap[override.toLowerCase()];
  if (!mapped) {
    // Unknown override — return existing tags unchanged so nothing breaks
    return Array.from(existingTags);
  }
  return mapped;
}
