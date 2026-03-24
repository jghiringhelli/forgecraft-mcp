/**
 * ForgeCraft CLI command implementations.
 * Each cmdXxx function maps to one CLI subcommand.
 */

import { resolve } from "node:path";
import { loadUserOverrides } from "../registry/loader.js";
import type { Tag, ContentTier, OutputTarget } from "../shared/types.js";
import { setupProjectHandler } from "../tools/setup-project.js";
import { refreshProjectHandler } from "../tools/refresh-project.js";
import { auditProjectHandler } from "../tools/audit.js";
import { scaffoldProjectHandler } from "../tools/scaffold.js";
import { reviewProjectHandler } from "../tools/review.js";
import {
  listTagsHandler,
  listHooksHandler,
  listSkillsHandler,
} from "../tools/list.js";
import { classifyProjectHandler } from "../tools/classify.js";
import { generateInstructionsHandler } from "../tools/generate-claude-md.js";
import { convertExistingHandler } from "../tools/convert.js";
import { addHookHandler } from "../tools/add-hook.js";
import { addModuleHandler } from "../tools/add-module.js";
import { verifyHandler } from "../tools/verify.js";
import { adviceHandler } from "../tools/advice.js";
import { metricsHandler } from "../tools/metrics.js";
import type { Flags } from "./args.js";
import { str, arr, bool } from "./args.js";

// ── Config Resolution ────────────────────────────────────────────────

/**
 * Resolve tags from explicit flags or fall back to forgecraft.yaml.
 *
 * @param dir - Project directory to read config from
 * @param flagTags - Explicitly provided tags from --tags flag
 * @returns Resolved tags, or undefined if none found
 */
export function resolveTagsFromConfig(
  dir: string,
  flagTags: string[] | undefined,
): Tag[] | undefined {
  if (flagTags && flagTags.length > 0) return flagTags as Tag[];
  const config = loadUserOverrides(resolve(dir));
  return config?.tags ?? undefined;
}

// ── Output ───────────────────────────────────────────────────────────

/**
 * Extract text from MCP-style handler result and print to stdout.
 *
 * @param result - MCP content result with text blocks
 */
export function printResult(result: {
  content: Array<{ type: string; text: string }>;
}): void {
  console.log(result.content[0]?.text ?? "");
}

// ── Commands ─────────────────────────────────────────────────────────

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdSetup(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const result = await setupProjectHandler({
    project_dir: projectDir,
    spec_path: str(flags, "spec"),
    spec_text: str(flags, "description"),
    mvp: flags["mvp"] === true ? true : flags["mvp"] === false ? false : false,
    scope_complete: flags["scope-complete"] !== false,
    has_consumers: bool(flags, "consumers", false),
  });
  printResult(result);
}

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdRefresh(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdAdvice(pos: string[], flags: Flags): Promise<void> {
  const projectDir = pos[0] ? resolve(pos[0]) : undefined;
  const tags =
    (arr(flags, "tags") as Tag[] | undefined) ??
    resolveTagsFromConfig(projectDir ?? ".", undefined);
  const result = await adviceHandler({ project_dir: projectDir, tags });
  printResult(result);
}

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdMetrics(pos: string[], flags: Flags): Promise<void> {
  const projectDir = resolve(pos[0] ?? ".");
  const result = await metricsHandler({
    project_dir: projectDir,
    include_mutation: bool(flags, "mutation", false),
    coverage_dir: str(flags, "coverage-dir"),
  });
  printResult(result);
}

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdAudit(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdScaffold(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdReview(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdList(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdClassify(pos: string[], flags: Flags): Promise<void> {
  const result = await classifyProjectHandler({
    project_dir: pos[0] ? resolve(pos[0]) : undefined,
    description: str(flags, "description"),
  });
  printResult(result);
}

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdGenerate(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdConvert(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdAddHook(pos: string[], flags: Flags): Promise<void> {
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

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdVerify(pos: string[], flags: Flags): Promise<void> {
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
  const text = result.content[0]?.text ?? "";
  if (text.includes("FAIL")) process.exit(1);
}

/** @param pos - Positional args @param flags - Parsed flags */
export async function cmdAddModule(pos: string[], flags: Flags): Promise<void> {
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
