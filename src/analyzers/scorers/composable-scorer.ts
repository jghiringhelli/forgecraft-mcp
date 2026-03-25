/**
 * Composable scorer: service layer, repository pattern, and interface-first design.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs, isSourceCodeFile } from "./scorer-utils.js";

/**
 * Score the Composable GS property.
 * 2 = services + repositories + interface files, 1 = services only, 0 = none.
 *
 * Recognizes both conventional CRUD patterns (services/repositories/) and
 * CLI/LIBRARY patterns (tools/handlers/ as services, registry/adapters/ as repositories).
 */
export function scoreComposable(projectDir: string, allFiles: string[]): GsPropertyScore {
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

  return gs("composable", 0, [
    "No service layer found — business logic likely lives in route handlers",
    "No repository layer found",
  ]);
}
