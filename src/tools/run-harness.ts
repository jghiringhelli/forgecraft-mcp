/**
 * run_harness tool handler.
 *
 * Executes harness probe files in tests/harness/ and reports per-UC pass/fail.
 * Maps exit codes to PASS/FAIL/TOOL_MISSING/NOT_IMPLEMENTED/TIMEOUT.
 * Writes .forgecraft/harness-run.json after execution.
 */

import { z } from "zod";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseUseCases } from "./layer-status.js";
import { runProbe, isToolAvailable } from "./probe-runners.js";
import { countProbeAssertions } from "./postcondition-coverage.js";
import type { ToolResult } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const runHarnessSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  uc_ids: z
    .array(z.string())
    .optional()
    .describe("Run only these UC probes. Default: all."),
  timeout_ms: z
    .number()
    .optional()
    .describe("Timeout per probe in ms. Default: 30000."),
});

export type RunHarnessInput = z.infer<typeof runHarnessSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export type ProbeStatus =
  | "pass"
  | "fail"
  | "tool_missing"
  | "not_implemented"
  | "timeout"
  | "no_probe"
  | "error";

export type ProbeScenario = "happy" | "error" | "unknown";

export interface ProbeResult {
  ucId: string;
  title: string;
  probeFile: string | null;
  status: ProbeStatus;
  durationMs: number;
  scenario: ProbeScenario;
  /** Number of assertion signals detected in the probe file. 0 = hollow. */
  assertionCount: number;
  output?: string;
}

export interface HarnessRunJson {
  timestamp: string;
  passed: number;
  failed: number;
  errors: number;
  notFound: number;
  results: Array<{ ucId: string; status: string; durationMs: number }>;
}

// ── Scenario detection ────────────────────────────────────────────────

export function detectScenario(fileName: string): ProbeScenario {
  const lower = fileName.toLowerCase();
  if (lower.includes("-happy")) return "happy";
  if (lower.includes("-error-")) return "error";
  return "unknown";
}

// ── Probe file discovery ──────────────────────────────────────────────

export function findProbeFiles(harnessDir: string, ucId: string): string[] {
  const lower = ucId.toLowerCase().replace(/_/g, "-");
  if (!existsSync(harnessDir)) return [];
  try {
    const all = readdirSync(harnessDir);
    return all.filter((f) => {
      const base = f.toLowerCase();
      return base.startsWith(lower + "-") || base.startsWith(lower + ".");
    });
  } catch {
    return [];
  }
}

function findProbeFileLegacy(harnessDir: string, ucId: string): string | null {
  const lower = ucId.toLowerCase();
  for (const ext of [".spec.ts", ".hurl", ".sh", ".sim.ts"]) {
    const name = `${lower}${ext}`;
    if (existsSync(join(harnessDir, name))) return name;
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────

export async function runHarnessHandler(
  args: RunHarnessInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const timeoutMs = args.timeout_ms ?? 30000;

  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  let ucs: Array<{ id: string; title: string }> = [];
  if (existsSync(useCasesPath)) {
    try {
      ucs = parseUseCases(readFileSync(useCasesPath, "utf-8"));
    } catch {
      /* ignore */
    }
  }

  const targetUcIds = args.uc_ids
    ? new Set(args.uc_ids.map((id) => id.toUpperCase()))
    : null;
  const filteredUcs = targetUcIds
    ? ucs.filter((uc) => targetUcIds.has(uc.id.toUpperCase()))
    : ucs;

  const harnessDir = join(projectDir, "tests", "harness");
  const results: ProbeResult[] = [];

  for (const uc of filteredUcs) {
    let fileNames = findProbeFiles(harnessDir, uc.id);
    if (fileNames.length === 0) {
      const legacy = existsSync(harnessDir)
        ? findProbeFileLegacy(harnessDir, uc.id)
        : null;
      if (!legacy) {
        results.push({
          ucId: uc.id,
          title: uc.title,
          probeFile: null,
          status: "no_probe",
          durationMs: 0,
          scenario: "unknown",
          assertionCount: 0,
        });
        continue;
      }
      fileNames = [legacy];
    }
    for (const fileName of fileNames) {
      const r = runProbe(join(harnessDir, fileName), fileName, timeoutMs);
      const { count: assertionCount } = countProbeAssertions(
        join(harnessDir, fileName),
      );
      results.push({
        ucId: uc.id,
        title: uc.title,
        probeFile: fileName,
        ...r,
        scenario: detectScenario(fileName),
        assertionCount,
      });
    }
  }

  // Direct scan when no UCs found
  if (existsSync(harnessDir) && filteredUcs.length === 0 && ucs.length === 0) {
    try {
      for (const entry of readdirSync(harnessDir)) {
        const m = /^(uc-\d{3})[\.-]/.exec(entry);
        if (!m) continue;
        const ucId = m[1]!.toUpperCase();
        const r = runProbe(join(harnessDir, entry), entry, timeoutMs);
        const { count: assertionCount } = countProbeAssertions(
          join(harnessDir, entry),
        );
        results.push({
          ucId,
          title: ucId,
          probeFile: entry,
          ...r,
          scenario: detectScenario(entry),
          assertionCount,
        });
      }
    } catch {
      /* ignore */
    }
  }

  const timestamp = new Date().toISOString();
  writeHarnessRunJson(projectDir, timestamp, results);
  return {
    content: [{ type: "text", text: formatRunReport(results, timestamp) }],
  };
}

// ── JSON writer ───────────────────────────────────────────────────────

function writeHarnessRunJson(
  projectDir: string,
  timestamp: string,
  results: ProbeResult[],
): void {
  try {
    const dir = join(projectDir, ".forgecraft");
    mkdirSync(dir, { recursive: true });
    const runJson: HarnessRunJson = {
      timestamp,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      errors: results.filter((r) =>
        ["error", "tool_missing", "not_implemented", "timeout"].includes(
          r.status,
        ),
      ).length,
      notFound: results.filter((r) => r.status === "no_probe").length,
      results: results.map((r) => ({
        ucId: r.ucId,
        status: r.status,
        durationMs: r.durationMs,
      })),
    };
    writeFileSync(
      join(dir, "harness-run.json"),
      JSON.stringify(runJson, null, 2),
      "utf-8",
    );
  } catch {
    /* non-throwing */
  }
}

// ── Report formatter ──────────────────────────────────────────────────

function formatRunReport(results: ProbeResult[], timestamp: string): string {
  if (results.length === 0) {
    return [
      "## Harness Run Report",
      `_Executed: ${timestamp}_`,
      "",
      "No probe files found. Run `generate_harness` first.",
    ].join("\n");
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const errors = results.filter((r) =>
    ["error", "tool_missing", "not_implemented", "timeout"].includes(r.status),
  ).length;
  const notFound = results.filter((r) => r.status === "no_probe").length;

  const notImpl = results.filter((r) => r.status === "not_implemented").length;
  const hollow = results.filter(
    (r) => r.status === "pass" && r.assertionCount === 0,
  ).length;

  const lines: string[] = [
    "## Harness Run Report",
    `_Executed: ${timestamp}_`,
    "",
    `### Results: ${passed} passed / ${failed} failed / ${errors} errors / ${notFound} not found`,
  ];
  if (notImpl > 0)
    lines.push(
      `> ⛔ ${notImpl} not_implemented probe(s) — fill TODO sections before close_cycle`,
    );
  if (hollow > 0)
    lines.push(
      `> ⚠️ ${hollow} hollow probe(s) passing with 0 assertions — more dangerous than not_implemented`,
    );
  lines.push(
    "",
    "| UC | Title | Probe File | Scenario | Status | Assertions | Duration |",
    "|---|---|---|---|---|---|---|",
  );

  for (const r of results) {
    const dur = r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : "—";
    const assertCol = r.probeFile
      ? r.assertionCount === 0 && r.status === "pass"
        ? "⚠️ 0"
        : String(r.assertionCount)
      : "—";
    lines.push(
      `| ${r.ucId} | ${r.title} | ${r.probeFile ?? "—"} | ${r.scenario} | ${formatStatus(r.status)} | ${assertCol} | ${dur} |`,
    );
  }

  // Failures
  const failedResults = results.filter((r) => r.status === "fail" && r.output);
  if (failedResults.length > 0) {
    lines.push("", "### Failures");
    for (const r of failedResults) {
      const truncated =
        r.output && r.output.length > 500
          ? r.output.slice(0, 500) + "…"
          : (r.output ?? "");
      lines.push(
        "",
        `**${r.ucId}: ${r.title} (FAIL)**`,
        "```",
        truncated,
        "```",
        `Specification violation: use case ${r.ucId} postcondition not satisfied.`,
        `Run: probe ${r.probeFile} directly to debug`,
      );
    }
  }

  // Hollow probe guidance
  const hollowResults = results.filter(
    (r) => r.status === "pass" && r.assertionCount === 0 && r.probeFile,
  );
  if (hollowResults.length > 0) {
    lines.push("", "### ⚠️ Hollow Probes — Pass With Zero Assertions");
    lines.push(
      "These probes run and exit 0 but assert nothing. They produce false confidence:",
    );
    for (const r of hollowResults) {
      lines.push(
        `- \`tests/harness/${r.probeFile}\` — add grep/expect/assert checks for ${r.ucId} postconditions`,
      );
    }
  }

  // Tool availability
  lines.push("", "### Tool Availability");
  for (const [name] of [["playwright"], ["hurl"], ["bash"], ["k6"]] as [
    string,
  ][]) {
    lines.push(
      `- ${name}: ${isToolAvailable(name === "playwright" ? "npx" : name) ? "✅ available" : "⚠️ not found"}`,
    );
  }

  lines.push(...buildLoopInstructions(results));
  return lines.join("\n");
}

function buildLoopInstructions(results: ProbeResult[]): string[] {
  const lines = [
    "",
    "### The Loop",
    "",
    "**Probe failures are specification violations — regenerate from spec, not fix code.**",
    "",
  ];
  const failed = results.filter((r) => r.status === "fail");
  const notImpl = results.filter((r) => r.status === "not_implemented");
  const noProbe = results.filter((r) => r.status === "no_probe");
  const allPassing =
    results.length > 0 && results.every((r) => r.status === "pass");

  if (failed.length > 0) {
    lines.push(
      `❌ ${failed.length} probe${failed.length === 1 ? "" : "s"} failed — for each failing UC:`,
      "  1. Read the use case in docs/use-cases.md",
      "  2. Read the spec in .claude/standards/ relevant to the UC",
      "  3. Call generate_session_prompt with the UC as the item_description",
      "  4. Implement from the bound prompt",
      "  5. Call run_harness again — repeat until green",
      "",
    );
  }

  if (notImpl.length > 0) {
    lines.push(
      `⚠️ ${notImpl.length} probe${notImpl.length === 1 ? "" : "s"} not yet implemented — fill in the TODO sections:`,
    );
    for (const r of notImpl) {
      const lower = r.ucId.toLowerCase().replace("_", "-");
      lines.push(
        `  - tests/harness/${lower}-happy.{ext}: implement the main flow`,
      );
      lines.push(
        `  - tests/harness/${lower}-error-*.{ext}: implement each error case`,
      );
    }
    lines.push("");
  }

  if (noProbe.length > 0) {
    lines.push(
      `📋 ${noProbe.length} UC${noProbe.length === 1 ? "" : "s"} have no probe files — run:`,
      "  generate_harness (scaffolds probe files from .forgecraft/harness/ specs)",
      "  Then implement the TODO sections",
      "",
    );
  }

  if (allPassing) {
    lines.push(
      "✅ All probes passing — L2 behavioral contracts verified.",
      "  Call close_cycle to evaluate gates and advance the cycle.",
      "  Call layer_status to see full coverage picture.",
    );
  } else {
    lines.push("Run layer_status to see full coverage picture.");
  }

  return lines;
}

function formatStatus(status: ProbeStatus): string {
  const map: Record<ProbeStatus, string> = {
    pass: "✅ PASS",
    fail: "❌ FAIL",
    tool_missing: "⚠️ TOOL_MISSING",
    not_implemented: "⏳ NOT_IMPLEMENTED",
    timeout: "⏱ TIMEOUT",
    no_probe: "❌ NO_PROBE (no probe file)",
    error: "⚠️ ERROR",
  };
  return map[status] ?? status;
}
