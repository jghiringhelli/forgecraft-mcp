/**
 * CLI mode for ForgeCraft.
 *
 * Handles `npx forgecraft-mcp <command> [args]` invocations.
 * Each subcommand maps directly to an existing handler function.
 * Returns `true` when a command is handled so the caller skips MCP server startup.
 */

import { resolve } from "node:path";
import { loadUserOverrides } from "./registry/loader.js";
import type { Tag, ContentTier, OutputTarget } from "./shared/types.js";
import { setupProjectHandler } from "./tools/setup-project.js";
import { refreshProjectHandler } from "./tools/refresh-project.js";
import { auditProjectHandler } from "./tools/audit.js";
import { scaffoldProjectHandler } from "./tools/scaffold.js";
import { reviewProjectHandler } from "./tools/review.js";
import {
  listTagsHandler,
  listHooksHandler,
  listSkillsHandler,
} from "./tools/list.js";
import { classifyProjectHandler } from "./tools/classify.js";
import { generateInstructionsHandler } from "./tools/generate-claude-md.js";
import { convertExistingHandler } from "./tools/convert.js";
import { addHookHandler } from "./tools/add-hook.js";
import { addModuleHandler } from "./tools/add-module.js";
import { verifyHandler } from "./tools/verify.js";
import { adviceHandler } from "./tools/advice.js";
import { metricsHandler } from "./tools/metrics.js";

// ── Arg Parsing ──────────────────────────────────────────────────────

/** Parsed CLI flag values: arrays for multi-value flags, booleans for toggles. */
type Flags = Record<string, string[] | boolean>;

interface ParsedCli {
  readonly command: string;
  readonly positional: string[];
  readonly flags: Flags;
}

/**
 * Minimal argv parser — no external dependencies.
 * `--flag val1 val2` → `flags["flag"] = ["val1", "val2"]`
 * `--flag` alone → `flags["flag"] = true`
 * `--no-flag` → `flags["flag"] = false`
 */
function parseCliArgs(argv: string[]): ParsedCli {
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

/** Extract first value of an array flag, or undefined. */
function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return Array.isArray(v) ? v[0] : undefined;
}

/** Extract array flag values, or undefined if absent/empty. */
function arr(flags: Flags, key: string): string[] | undefined {
  const v = flags[key];
  return Array.isArray(v) && v.length > 0 ? v : undefined;
}

/** Extract boolean flag, falling back to a default. */
function bool(flags: Flags, key: string, defaultVal: boolean): boolean {
  const v = flags[key];
  return typeof v === "boolean" ? v : defaultVal;
}

// ── Config Resolution ────────────────────────────────────────────────

/**
 * Resolve tags from explicit flags or fall back to forgecraft.yaml.
 *
 * @param dir - Project directory to read config from
 * @param flagTags - Explicitly provided tags from --tags flag
 * @returns Resolved tags, or undefined if none found
 */
function resolveTagsFromConfig(
  dir: string,
  flagTags: string[] | undefined,
): Tag[] | undefined {
  if (flagTags && flagTags.length > 0) return flagTags as Tag[];
  const config = loadUserOverrides(resolve(dir));
  return config?.tags ?? undefined;
}

// ── Output ───────────────────────────────────────────────────────────

/** Extract text from MCP-style handler result and print to stdout. */
function printResult(result: {
  content: Array<{ type: string; text: string }>;
}): void {
  console.log(result.content[0]?.text ?? "");
}

// ── Commands ─────────────────────────────────────────────────────────

async function cmdSetup(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const result = await setupProjectHandler({
    project_dir: projectDir,
    project_name: str(flags, "name"),
    description: str(flags, "description"),
    tier: (str(flags, "tier") as ContentTier | undefined) ?? "recommended",
    tags: arr(flags, "tags") as Tag[] | undefined,
    dry_run: bool(flags, "dry-run", false),
    output_targets: (arr(flags, "targets") as OutputTarget[] | undefined) ?? [
      "claude",
    ],
    release_phase:
      (str(flags, "phase") as
        | "development"
        | "pre-release"
        | "release-candidate"
        | "production"
        | undefined) ?? "development",
  });
  printResult(result);
}

async function cmdRefresh(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const checkMode = bool(flags, "check", false);
  const result = await refreshProjectHandler({
    project_dir: projectDir,
    apply: checkMode ? false : bool(flags, "apply", false),
    tier: str(flags, "tier") as ContentTier | undefined,
    add_tags: arr(flags, "add-tags") as Tag[] | undefined,
    remove_tags: arr(flags, "remove-tags") as Tag[] | undefined,
    output_targets: arr(flags, "targets") as OutputTarget[] | undefined,
    sentinel: bool(flags, "sentinel", true),
  });
  printResult(result);
  if (checkMode) {
    const text = result.content[0]?.text ?? "";
    const driftDetected =
      text.includes("New Tags Detected") ||
      text.includes("Tags No Longer Detected") ||
      text.includes("Tier Change");
    if (driftDetected) process.exit(1);
  }
}

async function cmdAdvice(pos: string[], flags: Flags): Promise<void> {
  const projectDir = pos[0] ? resolve(pos[0]) : undefined;
  const tags =
    (arr(flags, "tags") as Tag[] | undefined) ??
    resolveTagsFromConfig(projectDir ?? ".", undefined);
  const result = await adviceHandler({
    project_dir: projectDir,
    tags,
  });
  printResult(result);
}

async function cmdMetrics(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const result = await metricsHandler({
    project_dir: projectDir,
    include_mutation: bool(flags, "mutation", false),
    coverage_dir: str(flags, "coverage-dir"),
  });
  printResult(result);
}

async function cmdAudit(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const tags = resolveTagsFromConfig(projectDir, arr(flags, "tags"));
  if (!tags || tags.length === 0) {
    console.error("Error: --tags required (or add forgecraft.yaml with tags)");
    process.exit(1);
  }
  const result = await auditProjectHandler({
    tags,
    project_dir: projectDir,
    include_anti_patterns: bool(flags, "anti-patterns", true),
  });
  printResult(result);
}

async function cmdScaffold(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const tags = resolveTagsFromConfig(projectDir, arr(flags, "tags"));
  if (!tags || tags.length === 0) {
    console.error("Error: --tags required (or add forgecraft.yaml with tags)");
    process.exit(1);
  }
  const result = await scaffoldProjectHandler({
    tags,
    project_dir: projectDir,
    project_name: str(flags, "name") ?? "My Project",
    language:
      (str(flags, "language") as "typescript" | "python") ?? "typescript",
    dry_run: bool(flags, "dry-run", false),
    force: bool(flags, "force", false),
    sentinel: bool(flags, "sentinel", true),
    output_targets: (arr(flags, "targets") as OutputTarget[] | undefined) ?? [
      "claude",
    ],
  });
  printResult(result);
}

async function cmdReview(pos: string[], flags: Flags): Promise<void> {
  const projectDir = pos[0] ? resolve(pos[0]) : process.cwd();
  const tags = resolveTagsFromConfig(projectDir, arr(flags, "tags"));
  if (!tags || tags.length === 0) {
    console.error("Error: --tags required (or add forgecraft.yaml with tags)");
    process.exit(1);
  }
  const result = await reviewProjectHandler({
    tags,
    scope:
      (str(flags, "scope") as "comprehensive" | "focused") ?? "comprehensive",
  });
  printResult(result);
}

async function cmdList(pos: string[], flags: Flags): Promise<void> {
  const resource = pos[0] ?? "tags";
  const filterTags = arr(flags, "tags") as Tag[] | undefined;
  if (resource === "hooks") {
    printResult(await listHooksHandler({ tags: filterTags }));
  } else if (resource === "skills") {
    printResult(await listSkillsHandler({ tags: filterTags }));
  } else {
    printResult(await listTagsHandler());
  }
}

async function cmdClassify(pos: string[], flags: Flags): Promise<void> {
  const result = await classifyProjectHandler({
    project_dir: pos[0] ? resolve(pos[0]) : undefined,
    description: str(flags, "description"),
  });
  printResult(result);
}

async function cmdGenerate(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const tags = resolveTagsFromConfig(projectDir, arr(flags, "tags"));
  if (!tags || tags.length === 0) {
    console.error("Error: --tags required (or add forgecraft.yaml with tags)");
    process.exit(1);
  }
  const result = await generateInstructionsHandler({
    tags,
    project_dir: projectDir,
    project_name: str(flags, "name") ?? "My Project",
    output_targets: (arr(flags, "targets") as OutputTarget[] | undefined) ?? [
      "claude",
    ],
    merge_with_existing: bool(flags, "merge", true),
    compact: bool(flags, "compact", false),
    release_phase:
      (str(flags, "phase") as
        | "development"
        | "pre-release"
        | "release-candidate"
        | "production"
        | undefined) ?? "development",
  });
  printResult(result);
}

async function cmdConvert(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const tags = resolveTagsFromConfig(projectDir, arr(flags, "tags"));
  if (!tags || tags.length === 0) {
    console.error("Error: --tags required (or add forgecraft.yaml with tags)");
    process.exit(1);
  }
  const result = await convertExistingHandler({
    tags,
    project_dir: projectDir,
    scan_depth: (str(flags, "scan-depth") as "quick" | "full") ?? "quick",
  });
  printResult(result);
}

async function cmdAddHook(pos: string[], flags: Flags): Promise<void> {
  const hookName = pos[0];
  const projectDir = resolve(pos[1] ?? ".");
  if (!hookName) {
    console.error(
      "Error: hook name required — npx forgecraft-mcp add-hook <name> <dir>",
    );
    process.exit(1);
  }
  const result = await addHookHandler({
    hook: hookName,
    project_dir: projectDir,
    tag: str(flags, "tag") as Tag | undefined,
  });
  printResult(result);
}

async function cmdVerify(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const result = await verifyHandler({
    project_dir: projectDir,
    test_command: str(flags, "test-cmd"),
    timeout_ms: flags["timeout"]
      ? parseInt(str(flags, "timeout") ?? "120000", 10)
      : 120_000,
    pass_threshold: flags["threshold"]
      ? parseInt(str(flags, "threshold") ?? "11", 10)
      : 11,
  });
  printResult(result);
  // Mirror test-suite exit code so CI pipelines detect failure
  const text = result.content[0]?.text ?? "";
  if (text.includes("FAIL")) process.exit(1);
}

async function cmdAddModule(pos: string[], flags: Flags): Promise<void> {
  const moduleName = pos[0];
  const projectDir = resolve(pos[1] ?? ".");
  if (!moduleName) {
    console.error(
      "Error: module name required — npx forgecraft-mcp add-module <name> <dir>",
    );
    process.exit(1);
  }
  const result = await addModuleHandler({
    module_name: moduleName,
    project_dir: projectDir,
    tags: (arr(flags, "tags") as Tag[] | undefined) ?? ["UNIVERSAL"],
    language:
      (str(flags, "language") as "typescript" | "python") ?? "typescript",
  });
  printResult(result);
}

// ── Help ─────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
ForgeCraft MCP — engineering standards for AI coding assistants

USAGE
  npx forgecraft-mcp <command> [arguments] [flags]
  npx forgecraft-mcp serve                         (default — starts MCP server)

COMMANDS
  setup   <dir>          First-time project setup (auto-detects stack)
  refresh <dir>          Re-sync instruction files after project changes
  audit   <dir>          Check project against configured standards
  scaffold <dir>         Generate project structure and instruction files
  review  [dir]          Generate code review checklist
  list    [tags|hooks|skills]   Discover available resources
  classify [dir]         Suggest tags for a project
  generate <dir>         Generate instruction files only
  convert <dir>          Generate migration plan
  add-hook <name> <dir>  Install a quality-gate hook
  add-module <name> <dir> Scaffold a feature module
  verify  [dir]          Run tests + score §4.3 GS properties + report layer violations
  advice  [dir]          Quality cycle checklist + tool stack + example configs for your tags
  metrics [dir]          External quality report: LOC, coverage, layer violations, dead code, complexity
FLAGS (vary by command)
  --tags <tags...>       Project classification tags (or read from forgecraft.yaml)
  --tier <tier>          Content depth: core | recommended | optional
  --targets <targets...> AI assistant targets: claude cursor copilot windsurf cline aider
  --name <name>          Project name
  --description <text>   Project description for tag detection
  --dry-run              Preview without writing files
  --apply                Apply changes (for refresh, default is preview)
  --add-tags <tags...>   Add tags during refresh
  --remove-tags <tags...> Remove tags during refresh
  --no-anti-patterns     Skip anti-pattern scanning (for audit)
  --language <lang>      typescript | python (default: typescript)
  --scope <scope>        comprehensive | focused (for review)
  --test-cmd <cmd>       Test command override for verify (default: npm test)
  --timeout <ms>         Test suite timeout in milliseconds (default: 120000)
  --threshold <n>        Minimum GS score out of 12 for pass (default: 10)
  --mutation             Run Stryker mutation testing (slow, opt-in; used by metrics)
  --coverage-dir <path>  Path to existing coverage report directory (used by metrics)
  --force                Overwrite existing files
  --compact              Strip explanatory bullet tails and deduplicate lines (~20-40% smaller output)
  --tag <tag>            Single tag filter (for add-hook)
  --check                Drift-check mode for refresh: exit 1 if tag/tier drift detected (CI gate)
`);
}

// ── Entry Point ──────────────────────────────────────────────────────

/**
 * Run CLI mode. Returns `true` when a command was handled, `false` to fall
 * through to MCP server startup.
 *
 * @param argv - Raw process.argv (will be sliced from index 2)
 */
export async function runCli(argv: string[]): Promise<boolean> {
  const args = argv.slice(2);
  if (args.length === 0) return false; // no args → start MCP server

  // Help flag at any position
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return true;
  }

  const { command, positional, flags } = parseCliArgs(args);

  if (command === "serve") return false; // explicit serve → MCP server

  try {
    switch (command) {
      case "setup":
        await cmdSetup(positional, flags);
        break;
      case "refresh":
        await cmdRefresh(positional, flags);
        break;
      case "audit":
        await cmdAudit(positional, flags);
        break;
      case "scaffold":
        await cmdScaffold(positional, flags);
        break;
      case "review":
        await cmdReview(positional, flags);
        break;
      case "list":
        await cmdList(positional, flags);
        break;
      case "classify":
        await cmdClassify(positional, flags);
        break;
      case "generate":
        await cmdGenerate(positional, flags);
        break;
      case "convert":
        await cmdConvert(positional, flags);
        break;
      case "add-hook":
        await cmdAddHook(positional, flags);
        break;
      case "add-module":
        await cmdAddModule(positional, flags);
        break;
      case "verify":
        await cmdVerify(positional, flags);
        break;
      case "advice":
        await cmdAdvice(positional, flags);
        break;
      case "metrics":
        await cmdMetrics(positional, flags);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  return true;
}
