/**
 * Static-analyzer gate (FC-2).
 *
 * Treats a set of static analyzers (eslint, tsc, complexity, audit by default)
 * as ONE structural-discipline signal, evaluated at close_cycle (Step 1.7),
 * mirroring the generative-execution gate (FC-1).
 *
 * The hedge (Gabriel): a green static-analyzer gate RAISES THE PROBABILITY of
 * structural-discipline conformance; it does NOT prove it — treat it as one
 * signal alongside the harness.
 *
 * Iterate-to-green is NOT an autonomous retry loop. It REUSES the existing
 * violations substrate: the blocking pre-commit hooks (pre-commit-lint,
 * pre-commit-complexity, pre-commit-audit, pre-commit-compile) write failures to
 * .forgecraft/gate-violations.jsonl; this evaluator reads the ACTIVE violations
 * (those newer than the last commit, via buildGateViolationReport) plus persisted
 * .complexity/ evidence — and reports which analyzers are red. The AI then reads
 * the block (read_gate_violations / layer_status / blocked close_cycle), fixes,
 * and re-runs. Green = zero active analyzer violations.
 *
 * The evaluator is PURE: no process spawning, no writes, no process.exit, no
 * console (mirror of evaluateGenerativeExecution). It reads persisted evidence
 * only.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { buildGateViolationReport } from "./gate-violations.js";
import type { ForgeCraftConfig } from "../shared/types.js";

// ── Defaults & analyzer → hook mapping ───────────────────────────────

/** The default analyzer set when forgecraft.yaml does not specify one. */
export const DEFAULT_ANALYZERS = [
  "eslint",
  "tsc",
  "complexity",
  "audit",
] as const;

/**
 * Map a logical analyzer name to the pre-commit hook name(s) that write its
 * failures to gate-violations.jsonl. An analyzer is red when ANY of its hooks
 * has an active violation. Analyzers not in this map have no violation substrate
 * and are treated as green (never block) — the seam for plug-ins like sonar.
 */
const ANALYZER_HOOKS: Readonly<Record<string, ReadonlyArray<string>>> = {
  eslint: ["pre-commit-lint", "pre-commit-eslint"],
  tsc: ["pre-commit-compile"],
  complexity: ["pre-commit-complexity"],
  audit: ["pre-commit-audit"],
};

/** Analyzers handled by the optional config-gated plug-in seam (DEFERRED). */
const PLUGIN_ANALYZERS = ["sonar", "code_climate"] as const;

// ── Config readers ───────────────────────────────────────────────────

/**
 * Read and parse forgecraft.yaml. Returns null when missing or unparseable.
 */
function readConfig(projectRoot: string): ForgeCraftConfig | null {
  const yamlPath = join(projectRoot, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return null;
  try {
    return yaml.load(readFileSync(yamlPath, "utf-8")) as ForgeCraftConfig;
  } catch {
    return null;
  }
}

/**
 * Resolve the active analyzer set for a project.
 *
 * Returns the configured `static_analysis.analyzers` when present and non-empty,
 * otherwise the defaults (eslint, tsc, complexity, audit). Pure — derives only
 * from the passed config.
 *
 * @param config - Parsed ForgeCraftConfig, or null/undefined
 * @returns Ordered analyzer names
 */
export function resolveAnalyzers(
  config: ForgeCraftConfig | null | undefined,
): string[] {
  const configured = config?.static_analysis?.analyzers;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map((a) => String(a));
  }
  return [...DEFAULT_ANALYZERS];
}

// ── Override loader ──────────────────────────────────────────────────

/** A validated static-analysis override (analyzer + non-empty rationale). */
export interface StaticAnalysisOverride {
  readonly analyzer: string;
  readonly rationale: string;
}

/**
 * Load static-analysis overrides from forgecraft.yaml.
 * Mirrors loadGenerativeExecutionOverrides: file-based and auditable.
 *
 * static_analysis:
 *   overrides:
 *     - analyzer: complexity
 *       rationale: "Generated parser; complexity is inherent and reviewed."
 *
 * An override with an empty/whitespace/missing rationale is NOT valid and is
 * silently dropped — a rationale is mandatory for the override to count.
 *
 * @param projectRoot - Absolute project root path
 * @returns Array of valid overrides (may be empty)
 */
export function loadStaticAnalysisOverrides(
  projectRoot: string,
): StaticAnalysisOverride[] {
  const config = readConfig(projectRoot);
  const raw = config?.static_analysis?.overrides ?? [];
  const valid: StaticAnalysisOverride[] = [];
  for (const o of raw) {
    if (!o || typeof o.analyzer !== "string") continue;
    const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
    if (rationale.length === 0) continue; // empty rationale = NOT a valid override
    valid.push({ analyzer: o.analyzer, rationale });
  }
  return valid;
}

// ── Complexity evidence reader ───────────────────────────────────────

/**
 * Read persisted .complexity/ evidence and decide whether complexity is red.
 *
 * The advisory post-commit baseline (post-commit-complexity-baseline.sh) and the
 * blocking pre-commit-complexity.sh hook persist evidence under .complexity/.
 * This reader looks for a marker that a baseline run recorded over-threshold
 * functions: any JSON file under .complexity/ with a truthy `over_threshold`
 * count, or a `violations` array. Absent/unparseable evidence is NOT red — the
 * authoritative red signal for complexity is the active gate-violation from the
 * blocking hook; this reader only adds persisted-evidence corroboration.
 *
 * Pure: read-only.
 *
 * @param projectRoot - Absolute project root path
 * @returns true when persisted complexity evidence indicates a violation
 */
function complexityEvidenceRed(projectRoot: string): boolean {
  const dir = join(projectRoot, ".complexity");
  if (!existsSync(dir)) return false;
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      try {
        const parsed = JSON.parse(
          readFileSync(join(dir, entry), "utf-8"),
        ) as Record<string, unknown>;
        const over = parsed["over_threshold"];
        if (typeof over === "number" && over > 0) return true;
        const violations = parsed["violations"];
        if (Array.isArray(violations) && violations.length > 0) return true;
      } catch {
        // skip unparseable evidence file
      }
    }
  } catch {
    return false;
  }
  return false;
}

// ── Pure evaluator ───────────────────────────────────────────────────

/** Normalized status across the analyzer set. */
export type StaticAnalyzerStatus = "green" | "red";

/** Result of evaluating the static-analyzer gate. */
export interface StaticAnalyzerEvaluation {
  /** Overall normalized status across the resolved analyzer set. */
  readonly status: StaticAnalyzerStatus;
  /** Analyzers that are red and NOT overridden — these block. */
  readonly failing: string[];
  /** Analyzers that are red but excused by a valid override. */
  readonly overridden: string[];
  /** True when at least one resolved analyzer is red and not overridden. */
  readonly blocked: boolean;
}

/**
 * PURE evaluator: decides whether the static-analyzer gate blocks.
 *
 * No file writes, no process.exit, no console, no process spawning. Reads only
 * persisted evidence:
 *   - .forgecraft/gate-violations.jsonl (active violations, via the FC iterate-
 *     to-green substrate buildGateViolationReport) — the authoritative red signal
 *   - .complexity/ persisted evidence — corroborating complexity signal
 *
 * An analyzer is red when one of its hooks has an active violation (or, for
 * complexity, when persisted .complexity/ evidence shows a violation). A red
 * analyzer that carries a valid forgecraft.yaml override (with rationale) is
 * excused (overridden) and does not block. Plug-in analyzers (sonar,
 * code_climate) are SKIPPED when their config block is absent — they never block.
 *
 * @param projectRoot - Absolute project root path (read-only access)
 * @returns Evaluation with overall status, blocking analyzers, and overridden ones
 */
export function evaluateStaticAnalyzers(
  projectRoot: string,
): StaticAnalyzerEvaluation {
  const config = readConfig(projectRoot);
  const analyzers = resolveAnalyzers(config);

  // Active violations from the iterate-to-green substrate (reused, not rebuilt).
  const report = buildGateViolationReport(projectRoot);
  const activeHooks = new Set(report.active.map((v) => v.hook));

  const overrides = new Set(
    loadStaticAnalysisOverrides(projectRoot).map((o) => o.analyzer),
  );

  const failing: string[] = [];
  const overridden: string[] = [];

  for (const analyzer of analyzers) {
    // Plug-in seam: skip when the optional config block is absent (never blocks).
    if ((PLUGIN_ANALYZERS as ReadonlyArray<string>).includes(analyzer)) {
      const block =
        config?.static_analysis?.[analyzer as "sonar" | "code_climate"];
      if (!block) continue; // absent → skip
      // Configured plug-ins have no MVP scanner invocation; their red signal,
      // if any, also flows through gate-violations.jsonl by hook name.
    }

    const isRed = analyzerIsRed(analyzer, activeHooks, projectRoot);
    if (!isRed) continue;

    if (overrides.has(analyzer)) {
      overridden.push(analyzer);
    } else {
      failing.push(analyzer);
    }
  }

  const blocked = failing.length > 0;
  const status: StaticAnalyzerStatus = blocked ? "red" : "green";

  return { status, failing, overridden, blocked };
}

/**
 * Decide whether a single analyzer is red from persisted evidence.
 *
 * @param analyzer - Logical analyzer name
 * @param activeHooks - Set of hook names with active gate-violations
 * @param projectRoot - Absolute project root (for complexity evidence)
 * @returns true when the analyzer has a red signal
 */
function analyzerIsRed(
  analyzer: string,
  activeHooks: Set<string>,
  projectRoot: string,
): boolean {
  const hooks = ANALYZER_HOOKS[analyzer] ?? [];
  if (hooks.some((h) => activeHooks.has(h))) return true;
  if (analyzer === "complexity" && complexityEvidenceRed(projectRoot)) {
    return true;
  }
  return false;
}
