/**
 * Defended scorer: pre-commit hooks and lint configuration present.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs } from "./scorer-utils.js";

/**
 * Score the Defended GS property.
 * 2 = pre-commit hook exists, 1 = lint config only, 0 = neither.
 */
export function scoreDefended(projectDir: string): GsPropertyScore {
  const huskyHook = join(projectDir, ".husky", "pre-commit");
  const gitHook = join(projectDir, ".git", "hooks", "pre-commit");
  const hasPreCommitHook = existsSync(huskyHook) || existsSync(gitHook);

  const lintConfigs = [
    ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json",
    ".eslintrc.yaml", ".eslintrc.yml",
    "eslint.config.js", "eslint.config.mjs",
    ".pylintrc", "pyproject.toml", "biome.json", ".oxlintrc.json",
  ];
  const hasLint = lintConfigs.some((c) => existsSync(join(projectDir, c)));

  if (hasPreCommitHook) {
    return gs("defended", 2, [
      `Pre-commit hook found: ${existsSync(huskyHook) ? ".husky/pre-commit" : ".git/hooks/pre-commit"}`,
      hasLint ? "Lint configuration present" : "No lint config detected",
    ]);
  }

  if (hasLint) {
    return gs("defended", 1, [
      "Lint configuration present but no pre-commit hook found",
      "Add a pre-commit hook (e.g. husky) to block non-conforming commits",
    ]);
  }

  return gs("defended", 0, [
    "No pre-commit hook found",
    "No lint configuration found",
  ]);
}
