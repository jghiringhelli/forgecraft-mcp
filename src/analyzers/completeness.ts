/**
 * Completeness checker.
 *
 * Checks a project against the expected infrastructure for its tags.
 * Reports what's present, missing, and suggestions.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import type { AuditCheck, Tag } from "../shared/types.js";
import {
  checkInstructionFileExists,
  checkFileExists,
  checkStatusMdFreshness,
  checkHooksInstalled,
  checkSharedModules,
  checkPackageJson,
} from "./completeness-helpers.js";
import { readExceptions } from "../shared/exceptions.js";

const logger = createLogger("analyzers/completeness");

/**
 * Run all completeness checks for a project.
 *
 * @param projectDir - Absolute path to the project root
 * @param activeTags - Tags currently active for this project
 * @returns Categorized passing and failing checks
 */
export function checkCompleteness(
  projectDir: string,
  activeTags: Tag[],
): { passing: AuditCheck[]; failing: AuditCheck[] } {
  const passing: AuditCheck[] = [];
  const failing: AuditCheck[] = [];
  const exceptions = readExceptions(projectDir);

  // UNIVERSAL checks — always run
  checkInstructionFileExists(projectDir, passing, failing);
  checkFileExists(
    projectDir,
    "Status.md",
    "status_md_exists",
    "Status.md enables session continuity",
    passing,
    failing,
  );
  checkFileExists(
    projectDir,
    ".env.example",
    "env_example_exists",
    ".env.example documents required env vars",
    passing,
    failing,
  );

  checkStatusMdFreshness(projectDir, passing, failing);
  checkHooksInstalled(projectDir, passing, failing);

  // Check docs
  checkFileExists(
    projectDir,
    "docs/PRD.md",
    "prd_exists",
    "PRD documents requirements",
    passing,
    failing,
  );
  checkFileExists(
    projectDir,
    "docs/TechSpec.md",
    "tech_spec_exists",
    "Tech Spec documents architecture",
    passing,
    failing,
  );

  checkSharedModules(projectDir, passing, failing);

  // Tag-specific checks
  if (activeTags.includes("API") || activeTags.includes("LIBRARY")) {
    checkPackageJson(projectDir, passing, failing, exceptions);
  }

  if (activeTags.includes("WEB-REACT")) {
    const i18nPaths = [
      "src/locales",
      "src/i18n/messages",
      "src/translations",
      "public/locales",
      "messages",
    ];
    const hasI18n = i18nPaths.some((p) => existsSync(join(projectDir, p)));
    if (hasI18n) {
      passing.push({
        check: "i18n_setup",
        message: "✅ i18n locale files configured",
      });
    } else {
      failing.push({
        check: "i18n_setup",
        message: `i18n not configured — Add i18n locale files to one of: ${i18nPaths.join(", ")}`,
        severity: "error",
      });
    }
  }

  logger.info("Completeness check done", {
    passing: passing.length,
    failing: failing.length,
  });

  return { passing, failing };
}
