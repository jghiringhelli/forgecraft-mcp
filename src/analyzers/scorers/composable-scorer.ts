/**
 * Composable scorer: service layer, repository pattern, and interface-first design.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs, isSourceCodeFile } from "./scorer-utils.js";

/**
 * Detect whether a project is a GitHub Action (has action.yml / action.yaml at root).
 * GitHub Actions define their composability contract through action.yml inputs/outputs —
 * a service/repository layer split is not applicable to this project type.
 */
function isGitHubAction(projectDir: string): boolean {
  return existsSync(join(projectDir, "action.yml")) || existsSync(join(projectDir, "action.yaml"));
}

/**
 * Detect whether a project is a library, CLI, or standalone tool.
 * These project types expose composability through exported types and interfaces
 * rather than internal service/repository layers.
 */
function isLibraryOrCli(projectDir: string, allFiles: string[]): boolean {
  const hasSrc = existsSync(join(projectDir, "src"));
  const root = hasSrc ? join(projectDir, "src") : projectDir;

  // Has a shared/ or types/ directory with source files → library interface pattern
  const hasSharedOrTypes = existsSync(join(root, "shared")) || existsSync(join(root, "types"));

  // Has index.ts at the root of src/ → explicit public API surface (library pattern)
  const hasIndexExport = existsSync(join(root, "index.ts")) || existsSync(join(root, "index.js"));

  // Has a bin/ directory or bin field in package.json → CLI project
  const hasBin = existsSync(join(projectDir, "bin"));

  // No route/controller files anywhere → not a web service
  const hasRouteFiles = allFiles.some((f) =>
    /\/(routes?|controllers?|handlers?|endpoints?|api)\//i.test(f.replace(/\\/g, "/")),
  );

  return !hasRouteFiles && (hasSharedOrTypes || hasIndexExport || hasBin);
}

/**
 * Score the Composable GS property.
 * 2 = services + repositories + interface files, 1 = services only, 0 = none.
 *
 * Project-type aware:
 * - GitHub Actions: composability measured via action.yml interface contract
 * - Libraries/CLIs: composability measured via exported types and public API surface
 * - Web services: conventional service/repository layer split
 */
export function scoreComposable(projectDir: string, allFiles: string[]): GsPropertyScore {
  // GitHub Actions define their contract through action.yml — service layers don't apply
  if (isGitHubAction(projectDir)) {
    return gs("composable", 2, [
      "GitHub Action detected — composability contract defined by action.yml inputs/outputs",
      "Interface boundary enforced by the GitHub Actions runner (not an internal service layer)",
    ]);
  }

  const hasSrc = existsSync(join(projectDir, "src"));
  const root = hasSrc ? "src" : "";

  const serviceDir = [
    join(root, "services"), join(root, "service"),
    join(root, "tools"), join(root, "handlers"),
    join(root, "use-cases"), join(root, "usecases"),
    "services", "service",
  ].find((d) => existsSync(join(projectDir, d)));

  const repositoryDir = [
    join(root, "repositories"), join(root, "repository"),
    join(root, "registry"), join(root, "adapters"),
    join(root, "providers"), join(root, "loaders"),
    "repositories", "repository",
  ].find((d) => existsSync(join(projectDir, d)));

  const hasInterfaces = allFiles.some(
    (f) =>
      /\/(interfaces?|contracts?|ports?|types?|core)\//i.test(f.replace(/\\/g, "/")) &&
      isSourceCodeFile(f),
  );

  if (serviceDir && repositoryDir) {
    return gs("composable", 2, [
      `Service layer found: ${serviceDir}/`,
      `Repository layer found: ${repositoryDir}/`,
      hasInterfaces
        ? "Interface/contract files detected"
        : "No dedicated interface files (partial credit)",
    ]);
  }

  if (serviceDir) {
    return gs("composable", 1, [
      `Service layer found: ${serviceDir}/`,
      "No repository layer found — consider extracting DB access to repositories/",
    ]);
  }

  // Library/CLI projects: check for public API surface as composability evidence
  if (isLibraryOrCli(projectDir, allFiles)) {
    if (hasInterfaces) {
      return gs("composable", 2, [
        "Library/CLI project — composability measured via exported interface surface",
        "Interface/type files detected — public API contract is explicit",
      ]);
    }
    return gs("composable", 1, [
      "Library/CLI project — composability measured via exported interface surface",
      "No dedicated interface/type files found — consider adding types/ or shared/ for explicit contracts",
    ]);
  }

  return gs("composable", 0, [
    "No service layer found — business logic likely lives in route handlers",
    "No repository layer found",
  ]);
}
