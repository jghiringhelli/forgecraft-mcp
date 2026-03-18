/**
 * Folder structure analyzer.
 *
 * Scans existing project directory structure to detect patterns,
 * existing infrastructure, and suggest improvements.
 */
// @ts-nocheck


import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("analyzers/folder-structure");

/** A node in the project's folder tree. */
export interface FolderNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: FolderNode[];
}

/** Directories to skip during scanning. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "coverage",
  ".nyc_output",
  ".cache",
  // Experiment and generated output directories — contain synthetic code
  // that is not part of the project's own source and should not affect scoring
  "experiments",
  "generated",
  ".forgecraft",
]);

/**
 * Scan a project directory and return its folder tree.
 * Respects a max depth to avoid excessive recursion.
 */
export function scanFolderStructure(
  projectDir: string,
  maxDepth: number = 4,
): FolderNode {
  logger.info("Scanning folder structure", { projectDir, maxDepth });
  return scanDirectory(projectDir, projectDir, 0, maxDepth);
}

/**
 * Recursively scan a directory.
 */
function scanDirectory(
  dir: string,
  rootDir: string,
  depth: number,
  maxDepth: number,
): FolderNode {
  const name =
    depth === 0
      ? relative(join(rootDir, ".."), dir) || "."
      : relative(join(dir, ".."), dir);
  const relativePath = relative(rootDir, dir) || ".";

  if (depth >= maxDepth) {
    return { name, path: relativePath, type: "directory" };
  }

  const children: FolderNode[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    // Sort: directories first, then files, alphabetical within each group
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = join(dir, entry.name);
      const entryRelativePath = relative(rootDir, entryPath);

      if (entry.isDirectory()) {
        children.push(scanDirectory(entryPath, rootDir, depth + 1, maxDepth));
      } else {
        children.push({
          name: entry.name,
          path: entryRelativePath,
          type: "file",
        });
      }
    }
  } catch (error) {
    logger.warn("Failed to read directory", {
      dir,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { name, path: relativePath, type: "directory", children };
}

/**
 * Render a folder tree as an indented text representation.
 */
export function renderFolderTree(
  node: FolderNode,
  indent: string = "",
): string {
  const lines: string[] = [];

  if (indent === "") {
    lines.push(`${node.name}/`);
  }

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as FolderNode;
      const isLast = i === node.children.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      const childIndent = isLast ? "    " : "│   ";

      const suffix = child.type === "directory" ? "/" : "";
      lines.push(`${indent}${prefix}${child.name}${suffix}`);

      if (
        child.type === "directory" &&
        child.children &&
        child.children.length > 0
      ) {
        lines.push(renderFolderTree(child, indent + childIndent));
      }
    }
  }

  return lines.join("\n");
}

/**
 * Get a flat list of all files in the project.
 */
export function listAllFiles(
  projectDir: string,
  maxDepth: number = 6,
): string[] {
  const files: string[] = [];
  collectFiles(projectDir, projectDir, 0, maxDepth, files);
  return files;
}

/**
 * Recursively collect file paths.
 */
function collectFiles(
  dir: string,
  rootDir: string,
  depth: number,
  maxDepth: number,
  result: string[],
): void {
  if (depth >= maxDepth) return;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        collectFiles(entryPath, rootDir, depth + 1, maxDepth, result);
      } else {
        result.push(relative(rootDir, entryPath));
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

/**
 * Check if a directory exists in the project.
 */
export function directoryExists(
  projectDir: string,
  relativePath: string,
): boolean {
  const fullPath = join(projectDir, relativePath);
  return existsSync(fullPath) && statSync(fullPath).isDirectory();
}

/**
 * Check if a file exists in the project.
 */
export function fileExists(projectDir: string, relativePath: string): boolean {
  const fullPath = join(projectDir, relativePath);
  return existsSync(fullPath) && statSync(fullPath).isFile();
}
