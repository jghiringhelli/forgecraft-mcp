/**
 * Language detector.
 *
 * Detects the primary programming language of a project from filesystem
 * indicators. Falls back to "typescript" when no clear signal is found.
 */
// @ts-nocheck


import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("analyzers/language-detector");

/** All languages ForgeCraft can recognise. */
export type SupportedLanguage =
  | "typescript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "ruby"
  | "csharp"
  | "unknown";

/** File/dir indicators keyed by language (checked from project root). */
const LANGUAGE_INDICATORS: Record<SupportedLanguage, readonly string[]> = {
  typescript: ["tsconfig.json", "package.json"],
  python:     ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile"],
  go:         ["go.mod", "go.sum"],
  rust:       ["Cargo.toml", "Cargo.lock"],
  java:       ["pom.xml", "build.gradle", "build.gradle.kts", "gradlew"],
  ruby:       ["Gemfile", "Gemfile.lock", ".ruby-version"],
  csharp:     [".csproj", ".sln"],
  unknown:    [],
};

/** Source file extensions keyed by language — used as tiebreaker and for LOC counting. */
export const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, readonly string[]> = {
  typescript: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  python:     [".py"],
  go:         [".go"],
  rust:       [".rs"],
  java:       [".java", ".kt", ".kts"],
  ruby:       [".rb"],
  csharp:     [".cs"],
  unknown:    [],
};

/**
 * Detect the primary language of a project from filesystem indicators.
 * Falls back to "typescript" when no clear signal is found.
 *
 * @param projectDir - Absolute path to project root
 * @returns Detected language
 */
export function detectLanguage(projectDir: string): SupportedLanguage {
  const RANKED: SupportedLanguage[] = [
    "go", "rust", "java", "ruby", "csharp", "python", "typescript",
  ];

  const matches = RANKED.filter((lang) =>
    LANGUAGE_INDICATORS[lang].some((f) => {
      // .csproj and .sln may appear anywhere in root; glob not needed here
      if (f.startsWith(".")) {
        try {
          return readdirSync(projectDir).some((e) => String(e).endsWith(f));
        } catch { return false; }
      }
      return existsSync(join(projectDir, f));
    }),
  );

  if (matches.length === 0) {
    logger.info("No language indicators found, defaulting to typescript", { projectDir });
    return "typescript";
  }

  if (matches.length === 1) {
    logger.info("Detected language", { projectDir, language: matches[0] });
    return matches[0]!;
  }

  // Multiple matches (e.g. mixed monorepo) — tiebreak by source file count
  const winner = countSourceFilesByLanguage(projectDir, matches);
  logger.info("Mixed project — tiebroken by source file count", { projectDir, language: winner });
  return winner;
}

/**
 * Count source files in src/ to tiebreak between multiple detected languages.
 * Shallow scan only (max 200 entries) to keep it fast.
 */
function countSourceFilesByLanguage(
  projectDir: string,
  candidates: SupportedLanguage[],
): SupportedLanguage {
  const srcDir = join(projectDir, "src");
  const scanDir = existsSync(srcDir) ? srcDir : projectDir;

  try {
    const entries = readdirSync(scanDir, { recursive: false }).slice(0, 200);
    const counts = Object.fromEntries(candidates.map((l) => [l, 0])) as Record<string, number>;

    for (const entry of entries) {
      const name = String(entry);
      for (const lang of candidates) {
        if (LANGUAGE_EXTENSIONS[lang].some((ext) => name.endsWith(ext))) {
          counts[lang]++;
          break;
        }
      }
    }

    // Strict `>` so TypeScript (last in RANKED) wins on ties — keeps legacy default.
    const winner = candidates.reduce((a, b) => (counts[a]! > counts[b]! ? a : b));
    return winner;
  } catch {
    return candidates[0]!;
  }
}

/** @deprecated Use `detectLanguage` — this is for backward-compatibility only. */
export function countSourceFiles(projectDir: string): SupportedLanguage {
  return countSourceFilesByLanguage(projectDir, ["typescript", "python"]);
}
