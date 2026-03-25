/**
 * setup-detector: Brownfield vs greenfield detection and reverse-PRD generation.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ── Constants ─────────────────────────────────────────────────────────

/** Source file extensions that indicate existing code. */
const SOURCE_EXTENSIONS = [".ts", ".js", ".py"] as const;

/** Directories to search for source files during brownfield detection. */
const BROWNFIELD_SOURCE_DIRS = ["src", "app", "lib"] as const;

/** Glob patterns to exclude when scanning for source files. */
const BROWNFIELD_EXCLUDE_DIRS = new Set(["node_modules", "dist", "build", "__pycache__"]);

/** Minimum README length (chars) to count as a substantial spec. */
const SUBSTANTIAL_README_MIN_CHARS = 800;

/** Route-related patterns signalling HTTP route files. */
const ROUTE_PATTERN =
  /\b(router|app\.get|app\.post|app\.put|app\.delete|@app\.route|@router|Blueprint)\b/;

/** Maximum route files to list in the reverse-PRD. */
const MAX_ROUTE_FILES = 8;

// ── Brownfield Detection ──────────────────────────────────────────────

/**
 * Determine whether a project is greenfield or brownfield.
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

function hasSourceFiles(projectDir: string): boolean {
  const dirsToCheck = [
    ...BROWNFIELD_SOURCE_DIRS.map((d) => join(projectDir, d)),
    projectDir,
  ];
  for (const dir of dirsToCheck) {
    if (existsSync(dir) && containsSourceFile(dir, dir === projectDir)) return true;
  }
  return false;
}

function containsSourceFile(dir: string, rootOnly: boolean): boolean {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return false; }
  for (const entry of entries) {
    if (BROWNFIELD_EXCLUDE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    if (SOURCE_EXTENSIONS.includes(ext as (typeof SOURCE_EXTENSIONS)[number])) return true;
    if (!rootOnly) {
      try {
        const stat = readdirSync(fullPath);
        if (stat && containsSourceFile(fullPath, false)) return true;
      } catch { /* not a directory */ }
    }
  }
  return false;
}

function hasSubstantialSpec(projectDir: string): boolean {
  const candidates = [join(projectDir, "docs", "spec.md"), join(projectDir, "docs", "PRD.md")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return true;
  }
  const specsDir = join(projectDir, "docs", "specs");
  if (existsSync(specsDir)) {
    try { if (readdirSync(specsDir).length > 0) return true; } catch { /* ignore */ }
  }
  const readmePath = join(projectDir, "README.md");
  if (existsSync(readmePath)) {
    try { if (readFileSync(readmePath, "utf-8").length > SUBSTANTIAL_README_MIN_CHARS) return true; } catch { /* ignore */ }
  }
  return false;
}

// ── Reverse-PRD generation ────────────────────────────────────────────

/**
 * Generate a reverse-engineered PRD stub from existing project artifacts.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Markdown string formatted as a reverse-PRD stub
 */
export function generateReversePrd(projectDir: string): string {
  const { name, description } = readPackageJsonMetadata(projectDir);
  const readmeSummary = readReadmeSummary(projectDir);
  const routeFiles = findRouteFiles(projectDir);
  const routeLines = routeFiles.length > 0
    ? routeFiles.map((f) => `- ${f}`).join("\n")
    : "- (no route files detected)";
  return [
    `> ⚠️ Generated from existing code — review and complete this spec before proceeding.`,
    ``, `# ${name} — Reverse-Engineered Spec`, ``,
    `## What this project appears to do`, ``, description, ``,
    `## Detected entry points / routes`, ``, routeLines, ``,
    `## README summary`, ``, readmeSummary, ``,
    `## What you need to fill in`, ``,
    `- [ ] Clarify the primary user problem this solves`,
    `- [ ] List all business rules that must be enforced`,
    `- [ ] Define non-functional requirements (auth, performance, data retention)`,
  ].join("\n");
}

function readPackageJsonMetadata(projectDir: string): { name: string; description: string } {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return { name: inferBaseName(projectDir), description: "No description found" };
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const name = typeof pkg["name"] === "string" && pkg["name"] ? pkg["name"] : inferBaseName(projectDir);
    const description = typeof pkg["description"] === "string" && pkg["description"] ? pkg["description"] : "No description found";
    return { name, description };
  } catch {
    return { name: inferBaseName(projectDir), description: "No description found" };
  }
}

function inferBaseName(dir: string): string {
  const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "my-project";
}

function readReadmeSummary(projectDir: string): string {
  const readmePath = join(projectDir, "README.md");
  if (!existsSync(readmePath)) return "No README found";
  try { return readFileSync(readmePath, "utf-8").split("\n").slice(0, 60).join("\n"); }
  catch { return "No README found"; }
}

function findRouteFiles(projectDir: string): string[] {
  const results: string[] = [];
  for (const dir of ["src", "app"].map((d) => join(projectDir, d))) {
    if (!existsSync(dir)) continue;
    collectRouteFiles(dir, projectDir, results);
    if (results.length >= MAX_ROUTE_FILES) break;
  }
  return results.slice(0, MAX_ROUTE_FILES);
}

function collectRouteFiles(dir: string, projectDir: string, results: string[]): void {
  if (results.length >= MAX_ROUTE_FILES) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (results.length >= MAX_ROUTE_FILES) return;
    if (BROWNFIELD_EXCLUDE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    if (SOURCE_EXTENSIONS.includes(ext as (typeof SOURCE_EXTENSIONS)[number])) {
      try {
        if (ROUTE_PATTERN.test(readFileSync(fullPath, "utf-8"))) {
          results.push(fullPath.replace(projectDir, "").replace(/\\/g, "/").replace(/^\//, ""));
        }
      } catch { /* skip */ }
    } else {
      collectRouteFiles(fullPath, projectDir, results);
    }
  }
}

// ── Brownfield PRD writer ─────────────────────────────────────────────

/**
 * Write a reverse-PRD to docs/PRD.md if one does not already exist.
 *
 * @param projectDir - Project root
 */
export function writeBrownfieldReversePrd(projectDir: string): void {
  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) return;
  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(prdPath, generateReversePrd(projectDir), "utf-8");
}
