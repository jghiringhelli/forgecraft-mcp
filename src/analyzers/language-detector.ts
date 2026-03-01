/**
 * Language detector.
 *
 * Detects the primary programming language of a project from filesystem
 * indicators. Falls back to "typescript" when no clear signal is found.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("analyzers/language-detector");

/** Languages supported by ForgeCraft template rendering. */
export type SupportedLanguage = "typescript" | "python";

/** File indicators for each language. */
const PYTHON_INDICATORS = [
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
] as const;

const TYPESCRIPT_INDICATORS = [
  "tsconfig.json",
  "package.json",
] as const;

/**
 * Detect the primary language of a project from filesystem indicators.
 * Falls back to "typescript" when no clear signal is found.
 *
 * @param projectDir - Absolute path to project root
 * @returns Detected language
 */
export function detectLanguage(projectDir: string): SupportedLanguage {
  const hasPython = PYTHON_INDICATORS.some((f) =>
    existsSync(join(projectDir, f)),
  );
  const hasTypeScript = TYPESCRIPT_INDICATORS.some((f) =>
    existsSync(join(projectDir, f)),
  );

  // Clear signal: only one language present
  if (hasPython && !hasTypeScript) {
    logger.info("Detected Python project", { projectDir });
    return "python";
  }

  if (hasTypeScript && !hasPython) {
    logger.info("Detected TypeScript project", { projectDir });
    return "typescript";
  }

  // Both present (monorepo or mixed): count source files in src/
  if (hasPython && hasTypeScript) {
    const language = countSourceFiles(projectDir);
    logger.info("Mixed project, detected by file count", {
      projectDir,
      language,
    });
    return language;
  }

  // No indicators found — default to TypeScript
  logger.info("No language indicators found, defaulting to typescript", {
    projectDir,
  });
  return "typescript";
}

/**
 * Count source files in src/ to determine majority language.
 * Shallow scan only (max 100 entries) to keep it fast.
 */
function countSourceFiles(projectDir: string): SupportedLanguage {
  const srcDir = join(projectDir, "src");

  if (!existsSync(srcDir)) {
    return "typescript";
  }

  try {
    const entries = readdirSync(srcDir, { recursive: false });
    const limited = entries.slice(0, 100);

    let pyCount = 0;
    let tsCount = 0;

    for (const entry of limited) {
      const name = String(entry);
      if (name.endsWith(".py")) {
        pyCount++;
      } else if (
        name.endsWith(".ts") ||
        name.endsWith(".tsx") ||
        name.endsWith(".js") ||
        name.endsWith(".jsx")
      ) {
        tsCount++;
      }
    }

    return pyCount > tsCount ? "python" : "typescript";
  } catch {
    return "typescript";
  }
}
