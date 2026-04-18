/**
 * layer_status tool handler.
 *
 * Reports L1–L4 completion per use case by reading docs/use-cases.md
 * and scanning for harness probes, infra config, and monitoring artifacts.
 * Works on any project with docs/use-cases.md — does not require forgecraft.yaml.
 */

import { z } from "zod";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolResult } from "../shared/types.js";
import {
  computePostconditionCoverage,
  formatCoverageTable,
} from "./postcondition-coverage.js";
import {
  detectL1GateViolations,
  type L1GateViolation,
} from "./layer-status-gates.js";

export type { L1GateViolation };

// ── Harness run helpers ───────────────────────────────────────────────

/**
 * Read harness-run.json for full summary (passed/failed/notFound + timestamp).
 * Returns null when missing or unparseable.
 */
function readHarnessRunForSummary(projectDir: string): {
  timestamp: string;
  passed: number;
  failed: number;
  notFound: number;
} | null {
  const runJsonPath = join(projectDir, ".forgecraft", "harness-run.json");
  if (!existsSync(runJsonPath)) return null;
  try {
    const raw = readFileSync(runJsonPath, "utf-8");
    return JSON.parse(raw) as {
      timestamp: string;
      passed: number;
      failed: number;
      notFound: number;
    };
  } catch {
    return null;
  }
}

// ── Harness run summary ───────────────────────────────────────────────

export interface HarnessRunSummary {
  readonly probeFilesFound: number;
  readonly lastRunTimestamp: string | null;
}

/**
 * Check tests/harness/ and .forgecraft/harness-run.json for probe file count
 * and last run timestamp.
 */
export function buildHarnessRunSummary(projectDir: string): HarnessRunSummary {
  const harnessDir = join(projectDir, "tests", "harness");
  let probeFilesFound = 0;
  if (existsSync(harnessDir)) {
    try {
      const entries = readdirSync(harnessDir);
      probeFilesFound = entries.filter(
        (e) =>
          e.endsWith(".spec.ts") ||
          e.endsWith(".hurl") ||
          e.endsWith(".sh") ||
          e.endsWith(".sim.ts"),
      ).length;
    } catch {
      // ignore
    }
  }

  let lastRunTimestamp: string | null = null;
  const runJsonPath = join(projectDir, ".forgecraft", "harness-run.json");
  if (existsSync(runJsonPath)) {
    try {
      const raw = readFileSync(runJsonPath, "utf-8");
      const parsed = JSON.parse(raw) as { timestamp?: string };
      lastRunTimestamp = parsed.timestamp ?? null;
    } catch {
      // ignore
    }
  }

  return { probeFilesFound, lastRunTimestamp };
}

// ── Schema ───────────────────────────────────────────────────────────

export const layerStatusSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
});

export type LayerStatusInput = z.infer<typeof layerStatusSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface UcRecord {
  readonly id: string;
  readonly title: string;
}

export interface UcL1Status extends UcRecord {
  readonly documented: true;
  readonly testsFound: boolean;
}

export interface UcL2Status extends UcRecord {
  readonly hasProbe: boolean;
  readonly probeTypes: ReadonlyArray<string>;
  /** true if tests/harness/uc-NNN-happy.* exists */
  readonly hasHappyProbe: boolean;
  /** count of tests/harness/uc-NNN-error-*.* files */
  readonly errorProbeCount: number;
  /** last run status from harness-run.json, or null if not run */
  readonly lastRunStatus: string | null;
}

export type L3Status = "not-started" | "partial" | "complete";
export type L4Status = "not-started" | "partial" | "complete";

export interface LayerReport {
  readonly projectName: string;
  readonly projectDir?: string;
  readonly generatedAt: string;
  readonly ucs: ReadonlyArray<UcRecord>;
  readonly l1: ReadonlyArray<UcL1Status>;
  readonly l2: ReadonlyArray<UcL2Status>;
  readonly l3: L3Status;
  readonly l3Checks: Readonly<Record<string, boolean>>;
  readonly l4: L4Status;
  readonly l4Checks: Readonly<Record<string, boolean>>;
  /** Active L1 gate violations detected from .forgecraft/gates/active/ */
  readonly l1GateViolations: ReadonlyArray<L1GateViolation>;
  /** Evidence from .forgecraft/env-probe-run.json, or null if not run */
  readonly envProbeEvidence: {
    passed: number;
    failed: number;
    timestamp: string;
  } | null;
  /** Evidence from .forgecraft/slo-probe-run.json, or null if not run */
  readonly sloProbeEvidence: {
    passed: number;
    failed: number;
    timestamp: string;
  } | null;
}

// ── UC parsing ────────────────────────────────────────────────────────

/**
 * Parse use case records from docs/use-cases.md content.
 * Extracts UC-NNN id and title from `## UC-NNN: Title` headers.
 */
export function parseUseCases(content: string): UcRecord[] {
  const ucs: UcRecord[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = /^##\s+(UC-\d{3}):\s+(.+)$/.exec(line.trim());
    if (match) {
      ucs.push({ id: match[1]!, title: match[2]!.trim() });
    }
  }
  return ucs;
}

// ── L1 check ─────────────────────────────────────────────────────────

/**
 * Check whether any test file in the project references a given UC id.
 */
function hasTestsForUc(projectDir: string, ucId: string): boolean {
  const testDirs = ["tests", "test", "src", "__tests__", "spec"];
  const lowerId = ucId.toLowerCase();
  for (const dir of testDirs) {
    const dirPath = join(projectDir, dir);
    if (!existsSync(dirPath)) continue;
    if (scanDirForText(dirPath, lowerId, 0)) return true;
  }
  return false;
}

/**
 * Recursively scan a directory for files containing the given text.
 * Limited to depth 4 to avoid traversing large trees.
 */
function scanDirForText(dirPath: string, text: string, depth: number): boolean {
  if (depth > 4) return false;
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = join(dirPath, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (scanDirForText(full, text, depth + 1)) return true;
      } else if (
        entry.endsWith(".ts") ||
        entry.endsWith(".js") ||
        entry.endsWith(".test.ts")
      ) {
        const content = readFileSync(full, "utf-8");
        if (content.toLowerCase().includes(text)) return true;
      }
    } catch {
      // skip unreadable entries
    }
  }
  return false;
}

/**
 * Build L1 status for all parsed use cases.
 * L1 = UC is documented. Test coverage is surfaced as a sub-check.
 */
export function buildL1Status(
  projectDir: string,
  ucs: ReadonlyArray<UcRecord>,
): UcL1Status[] {
  return ucs.map((uc) => ({
    ...uc,
    documented: true,
    testsFound: hasTestsForUc(projectDir, uc.id),
  }));
}

// ── L2 check ─────────────────────────────────────────────────────────

/**
 * Read probe types from a harness YAML file.
 * Non-throwing — returns empty array on parse failure.
 */
function readProbeTypes(probePath: string): string[] {
  try {
    const raw = readFileSync(probePath, "utf-8");
    const types: string[] = [];
    for (const line of raw.split("\n")) {
      const m = /^\s+type:\s+(\S+)/.exec(line);
      if (m) types.push(m[1]!);
    }
    return [...new Set(types)];
  } catch {
    return [];
  }
}

/**
 * Read per-UC results from harness-run.json.
 * Returns a map of ucId -> status string, or empty map on failure.
 */
function readHarnessRunResults(projectDir: string): Map<string, string> {
  const runJsonPath = join(projectDir, ".forgecraft", "harness-run.json");
  if (!existsSync(runJsonPath)) return new Map();
  try {
    const raw = readFileSync(runJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      results?: Array<{ ucId: string; status: string }>;
    };
    const map = new Map<string, string>();
    for (const r of parsed.results ?? []) {
      map.set(r.ucId.toUpperCase(), r.status);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Check tests/harness/ for happy-path and error probe files for a UC.
 */
function readHarnessProbeFiles(
  harnessDir: string,
  ucId: string,
): { hasHappyProbe: boolean; errorProbeCount: number } {
  const lower = ucId.toLowerCase().replace(/_/g, "-");
  const EXTENSIONS = [".spec.ts", ".hurl", ".sh", ".sim.ts"];

  if (!existsSync(harnessDir)) {
    return { hasHappyProbe: false, errorProbeCount: 0 };
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(harnessDir);
  } catch {
    return { hasHappyProbe: false, errorProbeCount: 0 };
  }

  const hasHappyProbe = EXTENSIONS.some((ext) =>
    entries.includes(`${lower}-happy${ext}`),
  );

  const errorProbeCount = entries.filter((e) => {
    const base = e.replace(/\.(spec\.ts|hurl|sh|sim\.ts)$/, "");
    return base.startsWith(`${lower}-error-`);
  }).length;

  return { hasHappyProbe, errorProbeCount };
}

/**
 * Build L2 status for all use cases.
 * L2 = .forgecraft/harness/uc-NNN.yaml exists.
 */
export function buildL2Status(
  projectDir: string,
  ucs: ReadonlyArray<UcRecord>,
): UcL2Status[] {
  const harnessDir = join(projectDir, "tests", "harness");
  const runResults = readHarnessRunResults(projectDir);

  return ucs.map((uc) => {
    const probeFile = join(
      projectDir,
      ".forgecraft",
      "harness",
      `${uc.id.toLowerCase()}.yaml`,
    );
    const hasProbe = existsSync(probeFile);
    const { hasHappyProbe, errorProbeCount } = readHarnessProbeFiles(
      harnessDir,
      uc.id,
    );
    const lastRunStatus = runResults.get(uc.id.toUpperCase()) ?? null;

    return {
      ...uc,
      hasProbe,
      probeTypes: hasProbe ? readProbeTypes(probeFile) : [],
      hasHappyProbe,
      errorProbeCount,
      lastRunStatus,
    };
  });
}

// ── L3 check ─────────────────────────────────────────────────────────

const L3_CHECKS: ReadonlyArray<[string, string[]]> = [
  ["CI config", [".github/workflows", ".gitlab-ci.yml", "Procfile"]],
  ["Test command", ["package.json", "Makefile", "Cargo.toml"]],
  ["Env schema", [".env.example", ".env.schema", "src/config"]],
  [
    "Deployment config",
    ["Dockerfile", "docker-compose.yml", "render.yaml", "fly.toml"],
  ],
];

/**
 * Evaluate L3 (environment/infrastructure) readiness.
 */
export function buildL3Status(projectDir: string): {
  status: L3Status;
  checks: Record<string, boolean>;
  envProbeEvidence: {
    passed: number;
    failed: number;
    timestamp: string;
  } | null;
} {
  const checks: Record<string, boolean> = {};
  for (const [label, paths] of L3_CHECKS) {
    checks[label] = paths.some((p) => existsSync(join(projectDir, p)));
  }
  const passing = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  let status: L3Status =
    passing === 0 ? "not-started" : passing === total ? "complete" : "partial";

  // Incorporate env-probe-run.json evidence
  const envProbeRunPath = join(projectDir, ".forgecraft", "env-probe-run.json");
  let envProbeEvidence: {
    passed: number;
    failed: number;
    timestamp: string;
  } | null = null;
  if (existsSync(envProbeRunPath)) {
    try {
      envProbeEvidence = JSON.parse(readFileSync(envProbeRunPath, "utf-8"));
    } catch {
      /* ignore */
    }
  }
  if (envProbeEvidence !== null) {
    if (envProbeEvidence.passed > 0 && envProbeEvidence.failed === 0) {
      status = "complete";
    } else if (envProbeEvidence.failed > 0) {
      status = "partial";
    }
  }

  return { status, checks, envProbeEvidence };
}

// ── L4 check ─────────────────────────────────────────────────────────

const L4_HEALTH_PATHS = [
  ".forgecraft/health",
  "src/health",
  "health",
  "src/monitoring",
];
const L4_DRIFT_PATHS = [".forgecraft/monitoring", "src/drift", "monitoring"];

/**
 * Evaluate L4 (self-monitoring/drift detection) readiness.
 */
export function buildL4Status(projectDir: string): {
  status: L4Status;
  checks: Record<string, boolean>;
  sloProbeEvidence: {
    passed: number;
    failed: number;
    timestamp: string;
  } | null;
} {
  const healthProbes = L4_HEALTH_PATHS.some((p) =>
    existsSync(join(projectDir, p)),
  );
  const driftDetection = L4_DRIFT_PATHS.some((p) =>
    existsSync(join(projectDir, p)),
  );
  const checks = {
    "Health probes": healthProbes,
    "Drift detection": driftDetection,
  };
  const passing = Object.values(checks).filter(Boolean).length;
  let status: L4Status =
    passing === 0 ? "not-started" : passing === 2 ? "complete" : "partial";

  // Incorporate slo-probe-run.json evidence
  const sloProbeRunPath = join(projectDir, ".forgecraft", "slo-probe-run.json");
  let sloProbeEvidence: {
    passed: number;
    failed: number;
    timestamp: string;
  } | null = null;
  if (existsSync(sloProbeRunPath)) {
    try {
      sloProbeEvidence = JSON.parse(readFileSync(sloProbeRunPath, "utf-8"));
    } catch {
      /* ignore */
    }
  }
  if (sloProbeEvidence !== null) {
    if (sloProbeEvidence.passed > 0 && sloProbeEvidence.failed === 0) {
      status = "complete";
    } else if (sloProbeEvidence.failed > 0) {
      status = "partial";
    }
  }

  return { status, checks, sloProbeEvidence };
}

// ── Core data builder ─────────────────────────────────────────────────

/**
 * Build the full layer report for a project directory.
 * All reads are non-throwing — missing artifacts produce empty/default fields.
 *
 * @param projectDir - Absolute path to project root
 * @returns Structured layer report
 */
export function buildLayerReport(projectDir: string): LayerReport {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  let ucs: UcRecord[] = [];
  if (existsSync(useCasesPath)) {
    try {
      const content = readFileSync(useCasesPath, "utf-8");
      ucs = parseUseCases(content);
    } catch {
      // leave ucs empty
    }
  }

  const l1 = buildL1Status(projectDir, ucs);
  const l2 = buildL2Status(projectDir, ucs);
  const {
    status: l3,
    checks: l3Checks,
    envProbeEvidence,
  } = buildL3Status(projectDir);
  const {
    status: l4,
    checks: l4Checks,
    sloProbeEvidence,
  } = buildL4Status(projectDir);

  // Derive project name from forgecraft.yaml or fallback to dirname
  const projectName = deriveProjectName(projectDir);

  const l1GateViolations = detectL1GateViolations(projectDir);

  return {
    projectName,
    projectDir,
    generatedAt: new Date().toISOString(),
    ucs,
    l1,
    l2,
    l3,
    l3Checks,
    l4,
    l4Checks,
    l1GateViolations,
    envProbeEvidence,
    sloProbeEvidence,
  };
}

/**
 * Read project name from forgecraft.yaml if present, otherwise use dirname.
 */
function deriveProjectName(projectDir: string): string {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const content = readFileSync(yamlPath, "utf-8");
      const m = /^project_name:\s*(.+)/m.exec(content);
      if (m) return m[1]!.trim();
    } catch {
      // fallback
    }
  }
  return projectDir.split(/[\\/]/).filter(Boolean).pop() ?? "project";
}

// ── Formatter ─────────────────────────────────────────────────────────

/**
 * Format a LayerReport as a human-readable markdown block.
 */
export function formatLayerReport(report: LayerReport): string {
  const lines: string[] = [
    `## Layer Status — ${report.projectName}`,
    ``,
    `_Generated: ${report.generatedAt}_`,
    ``,
  ];

  const total = report.ucs.length;

  if (total === 0) {
    lines.push("_No use cases found in docs/use-cases.md_");
    lines.push("");
    lines.push(
      "To begin tracking: create `docs/use-cases.md` with `## UC-001: ...` headers.",
    );
    appendLayerSummaryNoUcs(lines, report);
    return lines.join("\n");
  }

  // L1
  lines.push("### L1: Blueprint");
  lines.push(`${total}/${total} use cases documented`);
  lines.push("");
  lines.push("| UC | Title | Documented | Tests Found |");
  lines.push("|---|---|---|---|");
  for (const uc of report.l1) {
    const tests = uc.testsFound ? "✅" : "❌";
    lines.push(`| ${uc.id} | ${uc.title} | ✅ | ${tests} |`);
  }
  lines.push("");

  // L1 gate violations
  if (report.l1GateViolations.length > 0) {
    lines.push("**Active L1 gate violations:**");
    for (const v of report.l1GateViolations) {
      lines.push(`- ❌ ${v.gateId}: ${v.message}`);
    }
    lines.push("");
  }

  // L2
  const l2Passing = report.l2.filter((u) => u.hasProbe).length;
  const l2Pct = total > 0 ? Math.round((l2Passing / total) * 100) : 0;

  const harnessSummary = buildHarnessRunSummary(report.projectDir ?? "");
  const lastRunStr = harnessSummary.lastRunTimestamp ?? "never run";

  // Scenario counts across all UCs
  const happyCount = report.l2.filter((u) => u.hasHappyProbe).length;
  const errorTotal = report.l2.reduce((sum, u) => sum + u.errorProbeCount, 0);

  lines.push("### L2: Behavioral Harness");
  lines.push(
    `${l2Passing}/${total} use cases have harness specs (.forgecraft/harness/)`,
  );
  lines.push(
    `${harnessSummary.probeFilesFound}/${total} have executable probe files (tests/harness/)`,
  );
  lines.push(`Last harness run: ${lastRunStr}`);
  lines.push("");
  lines.push("| UC | Title | Happy | Error Paths | Last Run |");
  lines.push("|---|---|---|---|---|");
  for (const uc of report.l2) {
    const happyCell = uc.hasHappyProbe
      ? "✅"
      : uc.hasProbe
        ? "❌ missing"
        : "❌ missing";
    const errorCell =
      uc.errorProbeCount > 0
        ? `${uc.errorProbeCount} probe${uc.errorProbeCount === 1 ? "" : "s"}`
        : "0 probes ⚠️";
    const lastRunCell = uc.lastRunStatus
      ? uc.lastRunStatus === "pass"
        ? "✅ pass"
        : `❌ ${uc.lastRunStatus}`
      : "—";
    lines.push(
      `| ${uc.id} | ${uc.title} | ${happyCell} | ${errorCell} | ${lastRunCell} |`,
    );
  }
  lines.push("");
  lines.push(
    `**Scenario coverage**: ${happyCount}/${total} happy paths | ${errorTotal}/${total * 3} error paths`,
  );
  if (harnessSummary.lastRunTimestamp) {
    const harnessRun = readHarnessRunForSummary(report.projectDir ?? "");
    if (harnessRun) {
      lines.push(
        `**Last harness run**: ${harnessRun.timestamp} (${harnessRun.passed} passed / ${harnessRun.failed} failed / ${harnessRun.notFound} not run)`,
      );
    }
  }
  lines.push("");

  // Postcondition coverage
  const coverage = computePostconditionCoverage(
    report.projectDir ?? "",
    report.ucs,
  );
  const hollowCount = coverage.filter((c) => c.hollow).length;
  const uncoveredCount = coverage.filter(
    (c) => c.coverageRatio < 0.4 && c.probeFiles.length > 0,
  ).length;
  lines.push(
    "**Postcondition Coverage** (assertions in probe files vs. spec postconditions):",
  );
  lines.push(formatCoverageTable(coverage));
  if (hollowCount > 0) {
    lines.push(
      `⚠️ ${hollowCount} hollow probe(s) — pass with zero assertions. Add assertion checks.`,
    );
  }
  if (uncoveredCount > 0) {
    lines.push(
      `⚠️ ${uncoveredCount} UC(s) have probes but assertion count < 40% of postconditions.`,
    );
  }
  lines.push("");
  lines.push(
    `**L2 coverage: ${l2Pct}% — ${total - l2Passing} use case(s) need probe definitions**`,
  );
  lines.push("");
  lines.push(
    "To add a probe: create `.forgecraft/harness/uc-NNN.yaml` with at least one probe entry.",
  );
  lines.push("");

  // L3
  lines.push("### L3: Environment & Infrastructure");
  for (const [label, passing] of Object.entries(report.l3Checks)) {
    lines.push(`- ${passing ? "✅" : "❌"} ${label}`);
  }
  if (report.envProbeEvidence !== null) {
    const ev = report.envProbeEvidence;
    lines.push(
      `- Env probe evidence: ✅ ${ev.passed} passed / ${ev.failed} failed (last run: ${ev.timestamp})`,
    );
  } else {
    lines.push(`- Env probe evidence: ⚠️ not yet run — call run_env_probe`);
  }
  lines.push("");

  // L4
  lines.push("### L4: Self-Monitoring");
  for (const [label, passing] of Object.entries(report.l4Checks)) {
    lines.push(`- ${passing ? "✅" : "❌"} ${label}`);
  }
  if (report.sloProbeEvidence !== null) {
    const ev = report.sloProbeEvidence;
    lines.push(
      `- SLO probe evidence: ✅ ${ev.passed} passed / ${ev.failed} failed (last run: ${ev.timestamp})`,
    );
  } else {
    lines.push(`- SLO probe evidence: ⚠️ not yet run — call run_slo_probe`);
  }
  lines.push("");

  // Summary
  const l3Score =
    report.l3 === "complete"
      ? "complete"
      : report.l3 === "partial"
        ? "partial"
        : "not-started";
  const l4Score =
    report.l4 === "complete"
      ? "complete"
      : report.l4 === "partial"
        ? "partial"
        : "not-started";
  const l1Pct = 100;

  lines.push("### Summary");
  lines.push("| Layer | Status | Score |");
  lines.push("|---|---|---|");
  lines.push(`| L1 Blueprint | ${total}/${total} | ${l1Pct}% |`);
  lines.push(`| L2 Harness | ${l2Passing}/${total} | ${l2Pct}% |`);
  lines.push(`| L3 Environment | ${l3Score} | — |`);
  lines.push(`| L4 Monitoring | ${l4Score} | — |`);
  lines.push("");

  // Next action
  const nextAction = deriveNextAction(report, l2Passing, total);
  lines.push(`**Next action**: ${nextAction}`);

  return lines.join("\n");
}

/**
 * Append layer summary for projects with no use cases.
 */
function appendLayerSummaryNoUcs(lines: string[], report: LayerReport): void {
  lines.push("");
  lines.push("### L3: Environment & Infrastructure");
  for (const [label, passing] of Object.entries(report.l3Checks)) {
    lines.push(`- ${passing ? "✅" : "❌"} ${label}`);
  }
  if (report.envProbeEvidence !== null) {
    const ev = report.envProbeEvidence;
    lines.push(
      `- Env probe evidence: ✅ ${ev.passed} passed / ${ev.failed} failed (last run: ${ev.timestamp})`,
    );
  } else {
    lines.push(`- Env probe evidence: ⚠️ not yet run — call run_env_probe`);
  }
  lines.push("");
  lines.push("### L4: Self-Monitoring");
  for (const [label, passing] of Object.entries(report.l4Checks)) {
    lines.push(`- ${passing ? "✅" : "❌"} ${label}`);
  }
  if (report.sloProbeEvidence !== null) {
    const ev = report.sloProbeEvidence;
    lines.push(
      `- SLO probe evidence: ✅ ${ev.passed} passed / ${ev.failed} failed (last run: ${ev.timestamp})`,
    );
  } else {
    lines.push(`- SLO probe evidence: ⚠️ not yet run — call run_slo_probe`);
  }
}

/**
 * Derive the highest-impact next action from the current layer report.
 */
function deriveNextAction(
  report: LayerReport,
  l2Passing: number,
  total: number,
): string {
  if (total === 0) {
    return "Create docs/use-cases.md with formal UC entries to begin layer tracking.";
  }
  if (l2Passing < total) {
    const missing = report.l2
      .filter((u) => !u.hasProbe)
      .map((u) => u.id)
      .slice(0, 3)
      .join(", ");
    return `Add L2 harness probes for: ${missing}. Create .forgecraft/harness/uc-NNN.yaml.`;
  }
  if (report.l3 === "not-started") {
    return "Add L3 infrastructure config: CI workflow, Dockerfile, or .env.example.";
  }
  if (report.l3 === "partial") {
    return "Complete L3 environment coverage: add missing CI, env schema, or deployment config.";
  }
  if (report.l4 === "not-started") {
    return "Add L4 monitoring: create .forgecraft/health/ or src/health/ with probe definitions.";
  }
  return "All layers complete. Run close_cycle to finalize the cycle.";
}

// ── Handler ───────────────────────────────────────────────────────────

/**
 * Handler for the layer_status action.
 *
 * @param args - Validated input with project_dir
 * @returns MCP-style tool result with formatted layer report
 */
export async function layerStatusHandler(
  args: LayerStatusInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const report = buildLayerReport(projectDir);
  return {
    content: [{ type: "text", text: formatLayerReport(report) }],
  };
}
