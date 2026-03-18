import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * A recorded exception to a pre-commit hook rule.
 * Used to prevent false positives from being rediscovered every session.
 */
export interface HookException {
  /** Unique identifier. e.g. "exc-001" */
  readonly id: string;
  /** Hook name this exception applies to. e.g. "layer-boundary", "anti-pattern/hardcoded" */
  readonly hook: string;
  /**
   * Glob pattern for files this exception covers.
   * e.g. "src/migrations/**", "src/config/defaults.ts"
   */
  readonly pattern: string;
  /** Human-readable reason. Persisted so future AI sessions understand why. */
  readonly reason: string;
  /** ISO timestamp when added. */
  readonly addedAt: string;
  /** Who added it: "AI", "human", or the AI model ID. */
  readonly addedBy: string;
  /** Optional: ADR path documenting the architectural decision. */
  readonly adr?: string;
}

export interface ExceptionsFile {
  readonly version: "1";
  readonly exceptions: HookException[];
}

const EXCEPTIONS_FILE = ".forgecraft/exceptions.json";
const EMPTY_FILE: ExceptionsFile = { version: "1", exceptions: [] };

/**
 * Reads all recorded hook exceptions for a project.
 * Returns empty list if file does not exist.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns All recorded exceptions.
 */
export function readExceptions(projectRoot: string): readonly HookException[] {
  const filePath = join(projectRoot, EXCEPTIONS_FILE);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as ExceptionsFile;
    return parsed.exceptions ?? [];
  } catch {
    return [];
  }
}

/**
 * Adds a new exception to .forgecraft/exceptions.json.
 * Creates the file if it does not exist.
 * Generates a unique ID based on count.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param exception - The exception to add (without id and addedAt, which are generated).
 * @returns The created exception with generated id.
 */
export function addException(
  projectRoot: string,
  exception: Omit<HookException, "id" | "addedAt">
): HookException {
  const filePath = join(projectRoot, EXCEPTIONS_FILE);
  let existing: ExceptionsFile = EMPTY_FILE;
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, "utf-8")) as ExceptionsFile;
    } catch {
      existing = EMPTY_FILE;
    }
  }
  const id = `exc-${String(existing.exceptions.length + 1).padStart(3, "0")}`;
  const newException: HookException = {
    ...exception,
    id,
    addedAt: new Date().toISOString(),
  };
  const updated: ExceptionsFile = {
    version: "1",
    exceptions: [...existing.exceptions, newException],
  };
  writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  return newException;
}

/**
 * Checks whether a file path is covered by any exception for a given hook.
 *
 * @param exceptions - The list of exceptions to check against.
 * @param hookName - The hook name to match. e.g. "layer-boundary"
 * @param filePath - The file path to check. e.g. "src/migrations/001-init.ts"
 * @returns The matching exception, or undefined if no exception applies.
 */
export function findMatchingException(
  exceptions: readonly HookException[],
  hookName: string,
  filePath: string
): HookException | undefined {
  return exceptions.find(
    (exc) => exc.hook === hookName && matchesGlob(filePath, exc.pattern)
  );
}

/**
 * Simple glob matching supporting ** and * wildcards.
 * Does not use external dependencies to keep hooks dependency-free.
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const regexStr = normalizedPattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<DOUBLE>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLE>>>/g, ".*");
  return new RegExp(`^${regexStr}$`).test(normalizedPath);
}
