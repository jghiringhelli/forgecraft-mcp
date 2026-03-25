/**
 * CLI argument parsing utilities for ForgeCraft.
 */

// ── Types ────────────────────────────────────────────────────────────

/** Parsed CLI flag values: arrays for multi-value flags, booleans for toggles. */
export type Flags = Record<string, string[] | boolean>;

export interface ParsedCli {
  readonly command: string;
  readonly positional: string[];
  readonly flags: Flags;
}

// ── Parsing ──────────────────────────────────────────────────────────

/**
 * Minimal argv parser — no external dependencies.
 * `--flag val1 val2` → `flags["flag"] = ["val1", "val2"]`
 * `--flag` alone → `flags["flag"] = true`
 * `--no-flag` → `flags["flag"] = false`
 *
 * @param argv - Raw args slice (after command name)
 * @returns Parsed command, positional args, and flags
 */
export function parseCliArgs(argv: string[]): ParsedCli {
  const [command = "serve", ...rest] = argv;
  const positional: string[] = [];
  const flags: Flags = {};
  let i = 0;

  while (i < rest.length) {
    const arg = rest[i]!;
    if (arg.startsWith("--no-")) {
      flags[arg.slice(5)] = false;
      i++;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const values: string[] = [];
      i++;
      while (i < rest.length && !rest[i]!.startsWith("--")) {
        values.push(rest[i]!);
        i++;
      }
      flags[key] = values.length === 0 ? true : values;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, flags };
}

/**
 * Extract first value of an array flag, or undefined.
 *
 * @param flags - Parsed flags map
 * @param key - Flag name
 */
export function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return Array.isArray(v) ? v[0] : undefined;
}

/**
 * Extract array flag values, or undefined if absent/empty.
 *
 * @param flags - Parsed flags map
 * @param key - Flag name
 */
export function arr(flags: Flags, key: string): string[] | undefined {
  const v = flags[key];
  return Array.isArray(v) && v.length > 0 ? v : undefined;
}

/**
 * Extract boolean flag, falling back to a default.
 *
 * @param flags - Parsed flags map
 * @param key - Flag name
 * @param defaultVal - Default if absent
 */
export function bool(flags: Flags, key: string, defaultVal: boolean): boolean {
  const v = flags[key];
  return typeof v === "boolean" ? v : defaultVal;
}
