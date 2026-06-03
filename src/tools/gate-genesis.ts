/**
 * Gate genesis — propose new quality gates from observed development friction.
 *
 * Two signal sources:
 *   1. `.forgecraft/gate-violations.jsonl` — the same hook violated repeatedly
 *      means the team keeps hitting a failure mode worth formalizing.
 *   2. `.claude/corrections.md` — repeated AI corrections in the same category
 *      mean an unenforced convention; a gate makes it structural.
 *
 * Candidates become DRAFT YAML stubs in `.forgecraft/gates/drafts/` — never
 * auto-activated (human judgment). When the dev fills in `evidence` and sets
 * `generalizable: true`, the existing contribute flow takes the gate to the
 * public registry as a GitHub issue. This completes the community flywheel:
 * violations → drafts → active gates → registry → installed in other projects.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

/** Minimum repeats before a violation pattern becomes a candidate. */
const VIOLATION_THRESHOLD = 3;
/** Minimum repeats before a correction category becomes a candidate. */
const CORRECTION_THRESHOLD = 2;
/** Max sample messages carried into the draft for context. */
const MAX_EXAMPLES = 3;

export interface GateCandidate {
  /** Proposed gate id, e.g. "auto-gate-hardcoded-url". */
  readonly id: string;
  readonly source: "violations" | "corrections";
  /** The hook name or correction category that triggered the proposal. */
  readonly pattern: string;
  readonly occurrences: number;
  /** Up to MAX_EXAMPLES sample messages for the draft's context. */
  readonly examples: readonly string[];
}

interface ViolationEntry {
  readonly hook?: string;
  readonly severity?: string;
  readonly message?: string;
  readonly timestamp?: string;
}

/**
 * Scan violation log + corrections log and return gate candidates for
 * patterns that repeat above threshold and aren't already covered by an
 * active or draft gate.
 *
 * Never throws — missing or malformed files yield an empty list.
 *
 * @param projectRoot - Project root directory
 * @returns Candidates sorted by occurrence count, highest first
 */
export function proposeGateCandidates(projectRoot: string): GateCandidate[] {
  const covered = collectCoveredPatterns(projectRoot);
  const candidates: GateCandidate[] = [
    ...candidatesFromViolations(projectRoot, covered),
    ...candidatesFromCorrections(projectRoot, covered),
  ];
  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Write draft gate YAML stubs for the given candidates.
 * Drafts land in `.forgecraft/gates/drafts/<id>.yaml` — idempotent, never
 * overwrites, never auto-activates.
 *
 * @param projectRoot - Project root directory
 * @param candidates - Candidates from proposeGateCandidates
 * @returns Relative paths of draft files written
 */
export function writeGateDrafts(
  projectRoot: string,
  candidates: readonly GateCandidate[],
): string[] {
  const written: string[] = [];
  if (candidates.length === 0) return written;

  const draftsDir = join(projectRoot, ".forgecraft", "gates", "drafts");

  for (const candidate of candidates) {
    const filePath = join(draftsDir, `${candidate.id}.yaml`);
    if (existsSync(filePath)) continue;

    try {
      mkdirSync(draftsDir, { recursive: true });
      writeFileSync(filePath, buildDraftYaml(candidate), "utf-8");
      written.push(`.forgecraft/gates/drafts/${candidate.id}.yaml`);
    } catch {
      // Single draft failure is non-fatal
    }
  }

  return written;
}

// ── Signal extraction ─────────────────────────────────────────────────

function candidatesFromViolations(
  projectRoot: string,
  covered: ReadonlySet<string>,
): GateCandidate[] {
  const filePath = join(projectRoot, ".forgecraft", "gate-violations.jsonl");
  if (!existsSync(filePath)) return [];

  const byHook = new Map<string, string[]>();
  try {
    for (const line of readFileSync(filePath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry: ViolationEntry;
      try {
        entry = JSON.parse(trimmed) as ViolationEntry;
      } catch {
        continue; // skip malformed lines
      }
      if (!entry.hook) continue;
      const messages = byHook.get(entry.hook) ?? [];
      messages.push(entry.message ?? "");
      byHook.set(entry.hook, messages);
    }
  } catch {
    return [];
  }

  const candidates: GateCandidate[] = [];
  for (const [hook, messages] of byHook) {
    if (messages.length < VIOLATION_THRESHOLD) continue;
    const pattern = normalizePattern(hook);
    if (covered.has(pattern)) continue;
    candidates.push({
      id: `auto-gate-${pattern}`,
      source: "violations",
      pattern: hook,
      occurrences: messages.length,
      examples: dedupe(messages).slice(0, MAX_EXAMPLES),
    });
  }
  return candidates;
}

function candidatesFromCorrections(
  projectRoot: string,
  covered: ReadonlySet<string>,
): GateCandidate[] {
  const filePath = join(projectRoot, ".claude", "corrections.md");
  if (!existsSync(filePath)) return [];

  // Entry format: YYYY-MM-DD | [category] description
  const entryPattern = /^\d{4}-\d{2}-\d{2}\s*\|\s*\[([^\]]+)\]\s*(.+)$/;
  const byCategory = new Map<string, string[]>();

  try {
    let inComment = false;
    for (const line of readFileSync(filePath, "utf-8").split("\n")) {
      // Skip the commented-out examples in the stub
      if (line.includes("<!--")) inComment = true;
      if (inComment) {
        if (line.includes("-->")) inComment = false;
        continue;
      }
      const match = entryPattern.exec(line.trim());
      if (!match) continue;
      const category = match[1]!.trim().toLowerCase();
      const entries = byCategory.get(category) ?? [];
      entries.push(match[2]!.trim());
      byCategory.set(category, entries);
    }
  } catch {
    return [];
  }

  const candidates: GateCandidate[] = [];
  for (const [category, entries] of byCategory) {
    if (entries.length < CORRECTION_THRESHOLD) continue;
    const pattern = normalizePattern(category);
    if (covered.has(pattern)) continue;
    candidates.push({
      id: `auto-gate-${pattern}`,
      source: "corrections",
      pattern: category,
      occurrences: entries.length,
      examples: dedupe(entries).slice(0, MAX_EXAMPLES),
    });
  }
  return candidates;
}

// ── Coverage check ────────────────────────────────────────────────────

/**
 * Patterns already covered by an active or draft gate — don't re-propose.
 * A gate covers a pattern when its id or hook field contains the normalized
 * pattern string.
 */
function collectCoveredPatterns(projectRoot: string): Set<string> {
  const covered = new Set<string>();
  for (const subdir of ["active", "drafts"]) {
    const dir = join(projectRoot, ".forgecraft", "gates", subdir);
    if (!existsSync(dir)) continue;
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
        // Gate id from filename: auto-gate-<pattern>.yaml or <pattern>.yaml
        const base = file.replace(/\.(yaml|yml)$/, "");
        covered.add(normalizePattern(base.replace(/^auto-gate-/, "")));
        covered.add(normalizePattern(base));
      }
    } catch {
      // Unreadable dir — treat as no coverage
    }
  }
  return covered;
}

// ── Draft rendering ───────────────────────────────────────────────────

function buildDraftYaml(candidate: GateCandidate): string {
  const header = [
    `# DRAFT gate — generated by gate genesis from repeated ${candidate.source}.`,
    `# Pattern "${candidate.pattern}" occurred ${candidate.occurrences} times.`,
    `#`,
    `# To activate: fill in the FILL fields, move this file to`,
    `# .forgecraft/gates/active/, and set generalizable: true if the gate`,
    `# would help other projects (close_cycle will then propose it to the`,
    `# community registry as a GitHub issue).`,
    ``,
  ].join("\n");

  const body = yamlDump(
    {
      id: candidate.id,
      title: `<FILL: human-readable title for the ${candidate.pattern} gate>`,
      description: `Formalizes a repeated ${candidate.source === "violations" ? "hook violation" : "AI correction"}: ${candidate.pattern}`,
      domain:
        "<FILL: security | test-quality | api-contract | environment-hygiene | other>",
      gsProperty: "defended",
      phase: "development",
      hook:
        candidate.source === "violations" ? candidate.pattern : "pre-commit",
      check:
        "<FILL: executable step-by-step check — no interpretation required>",
      passCriterion: "<FILL: binary pass statement>",
      implementation: "logic",
      source: "project",
      status: "draft",
      // Provenance: "genesis" = the system detected the need from repeated
      // friction. AI/dev-created gates use "organic" (see Gate Awareness in
      // .claude/lifecycle.md). Tracked so the registry can distinguish gates
      // born from observed failure vs. proactive judgment.
      origin: "genesis",
      detectedFrom: candidate.source,
      generalizable: false,
      evidence: `Observed ${candidate.occurrences}x in this project. Examples: ${candidate.examples.join(" | ")}`,
      observedExamples: [...candidate.examples],
    },
    { lineWidth: 100, noRefs: true },
  );

  return header + body;
}

// ── Utilities ─────────────────────────────────────────────────────────

function normalizePattern(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^pre-commit-|^pre-push-|^post-commit-/, "")
    .replace(/\.sh$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items.filter((m) => m.trim()))];
}
