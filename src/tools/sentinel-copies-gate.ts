/**
 * Sentinel-copies gate (PT-2).
 *
 * The canonical AGENTS.md body is the single source of truth for cross-agent
 * instruction files; every opted-in target (copilot, cline, windsurf, cursor)
 * is a pure projection of it. This gate verifies the on-disk copies have not
 * drifted from a fresh in-memory re-render of the canonical body.
 *
 * Mirrors `evaluateStaticAnalyzers`: the evaluator is PURE — no file writes, no
 * process.exit, no console, no process spawning. It reads forgecraft.yaml +
 * templates to re-render the canonical body in-memory, reads the on-disk copies,
 * normalizes both (stripping any date/provenance line — belt-and-suspenders over
 * the already-deterministic canonical body), and compares.
 *
 * Drift semantics (per resolved copy-set):
 *   - opted-in target whose file is MISSING        → drift (reason "missing")
 *   - opted-in target whose content DIFFERS         → drift (reason "content-drift")
 *   - target NOT opted-in                            → ignored
 *   - drift on a target carrying a valid override    → overridden, does NOT block
 * Green = no un-overridden drift.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ForgeCraftConfig } from "../shared/types.js";
import {
  loadUserOverrides,
  loadAllTemplatesWithExtras,
} from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { detectLanguage } from "../analyzers/language-detector.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { inferProjectName } from "./refresh-analyzer.js";
import {
  renderCanonicalSentinel,
  projectSentinel,
  SENTINEL_PROJECTIONS,
} from "../registry/sentinel-projection.js";
import {
  buildPlaceholderContext,
  resolveTemplatePlaceholders,
} from "../shared/template-resolver.js";

// ── Resolvers (PT-2 config) ──────────────────────────────────────────

/** The default copy-set when forgecraft.yaml does not specify sentinel.targets. */
export const DEFAULT_SENTINEL_TARGETS = ["agents-md"] as const;

/**
 * Resolve the active sentinel copy-set for a project.
 *
 * Returns the configured `sentinel.targets` when present and non-empty, filtered
 * to recognized projection targets; otherwise the default `["agents-md"]`. Pure —
 * derives only from the passed config. claude/CNT is never a copy target and is
 * not returned here (it is generated via its existing path).
 *
 * @param config - Parsed ForgeCraftConfig, or null/undefined
 * @returns Ordered, de-duplicated, recognized copy-target ids
 */
export function resolveSentinelTargets(
  config: ForgeCraftConfig | null | undefined,
): string[] {
  const configured = config?.sentinel?.targets;
  const raw =
    Array.isArray(configured) && configured.length > 0
      ? configured.map((t) => String(t))
      : [...DEFAULT_SENTINEL_TARGETS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (!(t in SENTINEL_PROJECTIONS)) continue; // ignore unknown/claude/cnt
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** A validated sentinel override (target + non-empty rationale). */
export interface SentinelOverride {
  readonly target: string;
  readonly rationale: string;
}

/**
 * Load sentinel-copy overrides from forgecraft.yaml.
 * Mirrors loadStaticAnalysisOverrides: file-based and auditable. An override
 * with an empty/whitespace/missing rationale is NOT valid and is silently
 * dropped — a rationale is mandatory for the override to count.
 *
 * @param projectRoot - Absolute project root path
 * @returns Array of valid overrides (may be empty)
 */
export function loadSentinelOverrides(projectRoot: string): SentinelOverride[] {
  const config = loadUserOverrides(projectRoot);
  const raw = config?.sentinel?.overrides ?? [];
  const valid: SentinelOverride[] = [];
  for (const o of raw) {
    if (!o || typeof o.target !== "string") continue;
    const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
    if (rationale.length === 0) continue; // empty rationale = NOT a valid override
    valid.push({ target: o.target, rationale });
  }
  return valid;
}

// ── Normalization ────────────────────────────────────────────────────

/**
 * Normalize a sentinel file for drift comparison: drop any ForgeCraft provenance
 * line (date-bearing or canonical) and trim trailing whitespace. The canonical
 * body is already date-free, so this only guards against an older on-disk copy
 * that still carries a dated `buildHeader` line, and against EOL/whitespace noise.
 *
 * @param content - Raw file content
 * @returns Normalized content for comparison
 */
function normalize(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/<!--\s*ForgeCraft[^>]*-->/.test(line))
    .join("\n")
    .replace(/\s+$/g, "");
}

// ── Pure evaluator ───────────────────────────────────────────────────

/** Reason a copy is considered drifted. */
export type SentinelDriftReason = "missing" | "content-drift";

/** A single drifted (or overridden-drifted) copy target. */
export interface SentinelDrift {
  readonly target: string;
  readonly path: string;
  readonly reason: SentinelDriftReason;
}

/** Normalized status of the sentinel-copies gate. */
export type SentinelCopiesStatus = "green" | "drift";

/** Result of evaluating the sentinel-copies gate. */
export interface SentinelCopiesEvaluation {
  /** Overall normalized status across the resolved copy-set. */
  readonly status: SentinelCopiesStatus;
  /** Drifted copies that are NOT overridden — these block. */
  readonly drifted: SentinelDrift[];
  /** Drifted copies excused by a valid override (target + rationale). */
  readonly overridden: SentinelDrift[];
  /** True when at least one resolved copy drifted and is not overridden. */
  readonly blocked: boolean;
}

/**
 * PURE evaluator: decides whether the sentinel-copies gate blocks.
 *
 * No file writes, no process.exit, no console, no process spawning. Reads
 * forgecraft.yaml + templates to re-render the canonical body in-memory, and the
 * on-disk copies, then compares normalized content.
 *
 * When no forgecraft.yaml exists, there is nothing to govern → green.
 *
 * @param projectRoot - Absolute project root path (read-only access)
 * @returns Evaluation with overall status, blocking drift, and overridden drift
 */
export function evaluateSentinelCopies(
  projectRoot: string,
): SentinelCopiesEvaluation {
  const config = loadUserOverrides(projectRoot);
  if (!config) {
    return { status: "green", drifted: [], overridden: [], blocked: false };
  }

  const targets = resolveSentinelTargets(config);
  const overrides = new Set(
    loadSentinelOverrides(projectRoot).map((o) => o.target),
  );

  // Re-render the canonical body the same way the writers do (refresh recipe).
  const tags = (config.tags ?? ["UNIVERSAL"]) as Parameters<
    typeof composeTemplates
  >[0];
  const allTemplates = loadAllTemplatesWithExtras(
    undefined,
    config.templateDirs,
  );
  const composed = composeTemplates(tags, allTemplates, { config });
  const context = detectProjectContext(
    projectRoot,
    config.projectName ?? inferProjectName(projectRoot),
    detectLanguage(projectRoot),
    tags,
  );
  const canonicalBody = renderCanonicalSentinel(
    composed.instructionBlocks,
    context,
    { compact: config.compact },
  );

  // Mirror the writers' placeholder pass so generate and check produce
  // byte-identical output ({{repo_url}}/{{framework}}/{{domain}} resolution).
  const placeholderContext = buildPlaceholderContext(
    projectRoot,
    undefined,
    tags.map(String),
  );

  const drifted: SentinelDrift[] = [];
  const overriddenDrift: SentinelDrift[] = [];

  for (const target of targets) {
    const projection = SENTINEL_PROJECTIONS[target];
    if (!projection) continue;
    const projected = projectSentinel(target, canonicalBody, context);
    if (projected === null) continue;
    const expected = resolveTemplatePlaceholders(projected, placeholderContext);

    const filePath = join(projectRoot, projection.path);
    let reason: SentinelDriftReason | null = null;
    if (!existsSync(filePath)) {
      reason = "missing";
    } else {
      const onDisk = readFileSync(filePath, "utf-8");
      if (normalize(onDisk) !== normalize(expected)) {
        reason = "content-drift";
      }
    }

    if (reason === null) continue;
    const drift: SentinelDrift = { target, path: projection.path, reason };
    if (overrides.has(target)) {
      overriddenDrift.push(drift);
    } else {
      drifted.push(drift);
    }
  }

  const blocked = drifted.length > 0;
  return {
    status: blocked ? "drift" : "green",
    drifted,
    overridden: overriddenDrift,
    blocked,
  };
}
