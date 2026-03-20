/**
 * Spec ↔ roadmap drift detection.
 *
 * Compares the modification time of the project spec file against the roadmap.
 * If the spec has been modified more recently than docs/roadmap.md, the roadmap
 * may not reflect the current spec — emit a non-blocking warning so the AI can
 * decide whether to regenerate.
 */

import { existsSync, statSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface DriftResult {
  readonly driftDetected: boolean;
  readonly message?: string;
  /** ISO timestamp of spec file's last modification, when known */
  readonly specModifiedAt?: string;
  /** ISO timestamp of roadmap's last modification, when known */
  readonly roadmapModifiedAt?: string;
}

/**
 * Attempt to read the spec_path from forgecraft.yaml.
 * Returns undefined if the config is absent or has no spec_path.
 *
 * @param projectDir - Absolute path to project root
 * @returns Spec path string, or undefined if not configured
 */
function readSpecPathFromConfig(projectDir: string): string | undefined {
  const configPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(configPath)) return undefined;
  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown> | null;
    const specPath = config?.["spec_path"];
    if (typeof specPath === "string" && specPath.trim()) {
      return specPath.trim();
    }
  } catch {
    // Config unreadable — fall through
  }
  return undefined;
}

/**
 * Recursively find markdown files up to a given depth limit.
 *
 * @param dir - Directory to search
 * @param maxDepth - Maximum recursion depth
 * @param currentDepth - Current recursion depth (internal)
 * @returns Array of absolute file paths
 */
function findMarkdownFiles(
  dir: string,
  maxDepth: number,
  currentDepth = 0,
): string[] {
  if (currentDepth > maxDepth || !existsSync(dir)) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(
          ...findMarkdownFiles(fullPath, maxDepth, currentDepth + 1),
        );
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory unreadable — skip
  }
  return results;
}

/**
 * Find the spec file to compare against the roadmap.
 * Priority: forgecraft.yaml spec_path → docs/specs/**\/*.md (first found) → docs/PRD.md → null
 *
 * @param projectDir - Absolute path to project root
 * @returns Absolute path to spec file, or null if nothing found
 */
function resolveSpecFile(projectDir: string): string | null {
  const configuredPath = readSpecPathFromConfig(projectDir);
  if (configuredPath) {
    const resolved = join(projectDir, configuredPath);
    if (existsSync(resolved)) return resolved;
  }

  const specsDir = join(projectDir, "docs", "specs");
  const specFiles = findMarkdownFiles(specsDir, 3);
  if (specFiles.length > 0) return specFiles[0]!;

  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) return prdPath;

  return null;
}

/**
 * Compare spec vs roadmap mtimes and report drift.
 * Non-blocking: always returns a result even when files are missing.
 *
 * @param projectDir - Absolute path to project root
 * @returns DriftResult with driftDetected flag and human-readable message
 */
export function detectSpecRoadmapDrift(projectDir: string): DriftResult {
  const specFile = resolveSpecFile(projectDir);
  if (!specFile) return { driftDetected: false };

  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return { driftDetected: false };

  const specMtime = statSync(specFile).mtimeMs;
  const roadmapMtime = statSync(roadmapPath).mtimeMs;

  const specModifiedAt = new Date(specMtime).toISOString();
  const roadmapModifiedAt = new Date(roadmapMtime).toISOString();

  if (specMtime <= roadmapMtime) return { driftDetected: false };

  const specDate = new Date(specMtime).toLocaleString();
  const roadmapDate = new Date(roadmapMtime).toLocaleString();
  const relativeSpec = specFile.replace(projectDir, "").replace(/^[/\\]/, "");

  return {
    driftDetected: true,
    message:
      `⚠️ Spec drift: ${relativeSpec} (modified ${specDate}) is newer than ` +
      `docs/roadmap.md (generated ${roadmapDate}). Run generate_roadmap to re-sync.`,
    specModifiedAt,
    roadmapModifiedAt,
  };
}
