/**
 * Completeness checker.
 *
 * Checks a project against the expected infrastructure for its tags.
 * Reports what's present, missing, and suggestions.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import type { AuditCheck, Tag } from "../shared/types.js";
import { checkInstructionFileExists } from "./completeness-helpers.js";
import { readExceptions, findMatchingException } from "../shared/exceptions.js";

const logger = createLogger("analyzers/completeness");

/**
 * Run all completeness checks for a project.
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

  // Check Status.md freshness
  checkStatusMdFreshness(projectDir, passing, failing);

  // Check hooks
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

  // Check shared modules
  checkSharedModules(projectDir, passing, failing);

  // Tag-specific checks
  if (activeTags.includes("API") || activeTags.includes("LIBRARY")) {
    checkPackageJson(projectDir, passing, failing, exceptions);
  }

  if (activeTags.includes("WEB-REACT")) {
    // i18n: check multiple common patterns
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

/**
 * Check if a file or directory exists.
 */
function checkFileExists(
  projectDir: string,
  relativePath: string,
  checkId: string,
  description: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
): void {
  const fullPath = join(projectDir, relativePath);
  if (existsSync(fullPath)) {
    passing.push({ check: checkId, message: `✅ ${relativePath} exists` });
  } else {
    failing.push({
      check: checkId,
      message: `${relativePath} is missing — ${description}`,
      severity: "error",
    });
  }
}

/**
 * Check if Status.md was updated recently (within 7 days).
 */
function checkStatusMdFreshness(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
): void {
  const statusPath = join(projectDir, "Status.md");
  if (!existsSync(statusPath)) return;

  try {
    const stat = statSync(statusPath);
    const daysSinceModified =
      (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);

    if (daysSinceModified <= 7) {
      passing.push({
        check: "status_md_current",
        message: `✅ Status.md updated ${Math.round(daysSinceModified)} day(s) ago`,
      });
    } else {
      failing.push({
        check: "status_md_current",
        message: `Status.md not updated in ${Math.round(daysSinceModified)} days — update at end of each session`,
        severity: "warning",
      });
    }
  } catch {
    // Can't stat the file, skip this check
  }
}

/**
 * Check if hook scripts are installed.
 */
function checkHooksInstalled(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
): void {
  const hooksDir = join(projectDir, ".claude", "hooks");
  if (!existsSync(hooksDir)) {
    failing.push({
      check: "hooks_installed",
      message:
        ".claude/hooks/ directory missing — quality gate hooks not installed",
      severity: "error",
    });
    return;
  }

  // Check for key hooks
  const expectedHooks = [
    "pre-commit-branch-check.sh",
    "pre-commit-secrets.sh",
    "pre-commit-compile.sh",
  ];

  let hookCount = 0;
  for (const hookFile of expectedHooks) {
    if (existsSync(join(hooksDir, hookFile))) {
      hookCount++;
    }
  }

  if (hookCount === expectedHooks.length) {
    passing.push({
      check: "hooks_installed",
      message: `✅ ${hookCount}/${expectedHooks.length} essential hooks installed`,
    });
  } else {
    failing.push({
      check: "hooks_installed",
      message: `Only ${hookCount}/${expectedHooks.length} essential hooks installed`,
      severity: "warning",
    });
  }
}

/**
 * Check for shared modules (config, errors, logging).
 */
function checkSharedModules(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
): void {
  const sharedPatterns = [
    { path: "src/shared/config", name: "config module" },
    { path: "src/shared/errors", name: "error hierarchy" },
    { path: "src/shared/exceptions", name: "exception hierarchy" },
  ];

  let foundShared = false;
  for (const pattern of sharedPatterns) {
    if (existsSync(join(projectDir, pattern.path))) {
      foundShared = true;
      break;
    }
  }

  if (foundShared) {
    passing.push({
      check: "shared_modules",
      message: "✅ Shared modules (config/errors) present",
    });
  } else {
    failing.push({
      check: "shared_modules",
      message:
        "No shared modules found — create config, errors, logging modules in src/shared/",
      severity: "warning",
    });
  }
}

/**
 * Check package.json for required fields.
 */
function checkPackageJson(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
  exceptions: ReturnType<typeof readExceptions> = [],
): void {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    // Check if there's a registered exception for this project type
    const exc = findMatchingException(exceptions, "package_json", "**");
    if (exc) {
      passing.push({
        check: "package_json",
        message: `✅ package.json exception: ${exc.reason}`,
      });
      return;
    }
    failing.push({
      check: "package_json",
      message: "package.json missing",
      severity: "error",
    });
    return;
  }

  try {
    const content = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as Record<string, unknown>;

    // Check for lock file
    const hasLockFile =
      existsSync(join(projectDir, "package-lock.json")) ||
      existsSync(join(projectDir, "pnpm-lock.yaml")) ||
      existsSync(join(projectDir, "yarn.lock"));

    if (hasLockFile) {
      passing.push({ check: "lock_file", message: "✅ Lock file committed" });
    } else {
      failing.push({
        check: "lock_file",
        message: "No lock file found — commit package-lock.json",
        severity: "warning",
      });
    }

    // Check for scripts
    const scripts = pkg["scripts"] as Record<string, string> | undefined;
    if (scripts?.["test"]) {
      passing.push({
        check: "test_script",
        message: "✅ Test script configured",
      });
    } else {
      failing.push({
        check: "test_script",
        message: "No test script in package.json",
        severity: "warning",
      });
    }
  } catch {
    failing.push({
      check: "package_json",
      message: "package.json could not be parsed",
      severity: "error",
    });
  }
}
