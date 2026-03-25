/**
 * Shared constants and pure helper functions for completeness checks.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AuditCheck } from "../shared/types.js";
import { readExceptions, findMatchingException } from "../shared/exceptions.js";

/** Known AI assistant instruction file paths to check. */
export const KNOWN_INSTRUCTION_PATHS = [
  "CLAUDE.md",
  ".cursor/rules",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  ".clinerules",
  "CONVENTIONS.md",
];

/**
 * Check if any AI assistant instruction file exists.
 *
 * @param projectDir - Absolute path to project root
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 */
export function checkInstructionFileExists(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
): void {
  const found = KNOWN_INSTRUCTION_PATHS.filter((p) =>
    existsSync(join(projectDir, p)),
  );

  if (found.length > 0) {
    passing.push({
      check: "instruction_file_exists",
      message: `✅ Instruction file(s) found: ${found.join(", ")}`,
    });
  } else {
    failing.push({
      check: "instruction_file_exists",
      message:
        "No AI assistant instruction file found — run `generate_instructions` to create one",
      severity: "error",
    });
  }
}

/**
 * Check if a file or directory exists.
 *
 * @param projectDir - Absolute path to project root
 * @param relativePath - Path relative to project root
 * @param checkId - Unique check identifier
 * @param description - Human-readable description for failure message
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 */
export function checkFileExists(
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
 *
 * @param projectDir - Absolute path to project root
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 */
export function checkStatusMdFreshness(
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
 *
 * @param projectDir - Absolute path to project root
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 */
export function checkHooksInstalled(
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
 *
 * @param projectDir - Absolute path to project root
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 */
export function checkSharedModules(
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
 *
 * @param projectDir - Absolute path to project root
 * @param passing - Accumulator for passing checks
 * @param failing - Accumulator for failing checks
 * @param exceptions - Registered project exceptions (skips checks that match)
 */
export function checkPackageJson(
  projectDir: string,
  passing: AuditCheck[],
  failing: AuditCheck[],
  exceptions: ReturnType<typeof readExceptions> = [],
): void {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
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
