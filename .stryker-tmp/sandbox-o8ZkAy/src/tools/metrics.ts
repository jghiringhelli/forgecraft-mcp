/**
 * metrics tool handler.
 *
 * Runs a battery of external code quality probes against a project directory
 * and produces a traditional quality report — independent of GS dimensions.
 *
 * Probes: LOC · Coverage · Layer Violations · Dead Code · Complexity · Mutation (opt-in)
 * Each probe degrades gracefully if the required tool is absent.
 */
// @ts-nocheck


import { z } from "zod";
import { resolve } from "node:path";
import {
  probeLoc,
  probeCoverage,
  probeLayerViolations,
  probeDeadCode,
  probeComplexity,
  probeMutation,
  type LocData,
  type CoverageData,
  type LayerData,
  type DeadCodeData,
  type ComplexityData,
  type MutationData,
  type ProbeResult,
} from "../analyzers/code-probes.js";

// ── Schema ─────────────────────────────────────────────────────────────

export const metricsSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root to measure."),
  include_mutation: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Run Stryker mutation testing. Slow (several minutes). Default: false.",
    ),
  coverage_dir: z
    .string()
    .optional()
    .describe(
      "Path to existing coverage report directory. " +
      "Defaults to `coverage/` relative to project_dir.",
    ),
});

export type MetricsInput = z.infer<typeof metricsSchema>;

// ── Report builder ─────────────────────────────────────────────────

interface AllProbes {
  loc: ProbeResult<LocData>;
  coverage: ProbeResult<CoverageData>;
  layers: ProbeResult<LayerData>;
  deadCode: ProbeResult<DeadCodeData>;
  complexity: ProbeResult<ComplexityData>;
  mutation: ProbeResult<MutationData>;
}

function badge(result: ProbeResult): string {
  if (!result.available) return "⚪ N/A";
  return "🟢";
}

function coverageRating(pct: number): string {
  if (pct >= 90) return "🟢";
  if (pct >= 75) return "🟡";
  return "🔴";
}

function buildSummaryTable(probes: AllProbes): string {
  const { loc, coverage, layers, deadCode, complexity, mutation } = probes;

  const rows: string[][] = [
    [
      badge(loc),
      "Code volume",
      loc.available && loc.data
        ? `${loc.data.lines.toLocaleString()} lines · ${loc.data.files} files`
        : "—",
    ],
    [
      coverage.available && coverage.data
        ? coverageRating(coverage.data.lines)
        : "⚪",
      "Test coverage (lines)",
      coverage.available && coverage.data
        ? `${coverage.data.lines}% lines · ${coverage.data.functions}% functions · ${coverage.data.branches}% branches`
        : "—",
    ],
    [
      layers.available && layers.data
        ? (layers.data.violations === 0 ? "🟢" : "🔴")
        : "⚪",
      "Layer violations",
      layers.available && layers.data
        ? `${layers.data.violations} (source: ${layers.data.source})`
        : "—",
    ],
    [
      deadCode.available && deadCode.data
        ? (deadCode.data.unusedFiles + deadCode.data.unusedExports === 0 ? "🟢" : "🟡")
        : "⚪",
      "Dead code (knip)",
      deadCode.available && deadCode.data
        ? `${deadCode.data.unusedFiles} unused files · ${deadCode.data.unusedExports} unused exports · ${deadCode.data.unusedDependencies} unused deps`
        : "—",
    ],
    [
      complexity.available && complexity.data
        ? (complexity.data.highComplexityFunctions === 0 ? "🟢" : "🟡")
        : "⚪",
      `Complexity > ${complexity.data?.threshold ?? 10} (ESLint)`,
      complexity.available && complexity.data
        ? `${complexity.data.highComplexityFunctions} functions over threshold`
        : "—",
    ],
    [
      mutation.available && mutation.data
        ? (mutation.data.score >= 80 ? "🟢" : mutation.data.score >= 60 ? "🟡" : "🔴")
        : "⚪",
      "Mutation score (Stryker)",
      mutation.available && mutation.data
        ? `${mutation.data.score}% (${mutation.data.killed} killed / ${mutation.data.total} total)`
        : mutation.available === false && !mutation.installHint
          ? "Not run (pass --mutation to enable)"
          : "—",
    ],
  ];

  const header = "| | Metric | Result |\n|---|---|---|";
  const body = rows.map(([icon, metric, result]) => `| ${icon} | ${metric} | ${result} |`).join("\n");
  return header + "\n" + body;
}

function buildDetailSections(probes: AllProbes): string {
  const sections: string[] = [];

  // LOC breakdown
  if (probes.loc.available && probes.loc.data) {
    const ext = Object.entries(probes.loc.data.byExtension)
      .sort(([, a], [, b]) => b.lines - a.lines)
      .map(([e, d]) => `| \`${e}\` | ${d.files} | ${d.lines.toLocaleString()} |`)
      .join("\n");
    sections.push(
      `## Code Volume\n\n| Extension | Files | Lines |\n|---|---|---|\n${ext}\n\n` +
      `Blank lines: ${probes.loc.data.blankLines.toLocaleString()} (${Math.round(probes.loc.data.blankLines / probes.loc.data.lines * 100)}%)`,
    );
  }

  // Layer violations detail
  if (probes.layers.available && probes.layers.data && probes.layers.data.violations > 0) {
    const details = probes.layers.data.details.slice(0, 20).map(d => `- ${d}`).join("\n");
    const truncated = probes.layers.data.details.length > 20 ? `\n_(${probes.layers.data.details.length - 20} more not shown)_` : "";
    sections.push(`## Layer Violations\n\n${details}${truncated}`);
  }
  if (probes.layers.installHint) sections.push(`> **Layer check**: ${probes.layers.installHint}`);

  // Dead code detail
  if (probes.deadCode.available && probes.deadCode.data && probes.deadCode.data.details.length > 0) {
    const details = probes.deadCode.data.details.slice(0, 20).map(d => `- ${d}`).join("\n");
    const truncated = probes.deadCode.data.details.length > 20 ? `\n_(${probes.deadCode.data.details.length - 20} more not shown)_` : "";
    sections.push(`## Dead Code\n\n${details}${truncated}`);
  }

  // Complexity detail
  if (probes.complexity.available && probes.complexity.data && probes.complexity.data.highComplexityFunctions > 0) {
    const details = probes.complexity.data.details.slice(0, 20).map(d => `- ${d}`).join("\n");
    sections.push(`## High Complexity Functions\n\n${details}`);
  }

  // Not-installed hints
  const hints = [probes.coverage, probes.deadCode, probes.complexity, probes.mutation]
    .filter(p => !p.available && p.installHint)
    .map(p => `- ${p.installHint}`)
    .join("\n");
  if (hints) sections.push(`## Install to Unlock Additional Metrics\n\n${hints}`);

  return sections.join("\n\n---\n\n");
}

/**
 * Build a full markdown quality report from probe results.
 */
export function buildMetricsReport(projectDir: string, probes: AllProbes): string {
  const summary = buildSummaryTable(probes);
  const detail = buildDetailSections(probes);

  return [
    `# Code Quality Report — \`${projectDir}\``,
    "",
    `_Generated by forgecraft metrics — ${new Date().toISOString().slice(0, 10)}_`,
    "",
    "## Summary",
    "",
    summary,
    "",
    "---",
    "",
    detail,
  ].join("\n");
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Run all enabled code quality probes and return a formatted report.
 *
 * @param args - Validated input matching `metricsSchema`
 * @returns MCP-style content array with the quality report
 */
export async function metricsHandler(
  args: MetricsInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = resolve(args.project_dir);

  const probes: AllProbes = {
    loc: probeLoc(projectDir),
    coverage: probeCoverage(projectDir, args.coverage_dir),
    layers: probeLayerViolations(projectDir),
    deadCode: probeDeadCode(projectDir),
    complexity: probeComplexity(projectDir),
    mutation: args.include_mutation
      ? probeMutation(projectDir)
      : { available: false },
  };

  const report = buildMetricsReport(projectDir, probes);

  return { content: [{ type: "text", text: report }] };
}
