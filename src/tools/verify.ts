/**
 * verify tool handler.
 *
 * Orchestrates a full GS verification pass:
 *   1. Runs the project test suite
 *   2. Detects direct-DB calls in route/controller files (Bounded violations)
 *   3. Detects source modules without test files (Verifiable gaps)
 *   4. Scores all six §4.3 GS properties (0–2 each, max 12)
 *   5. Returns a structured report with overall pass/fail
 */

import { z } from "zod";
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { scoreGsProperties, findDirectDbCallsInRoutes, findMissingTestFiles } from "../analyzers/gs-scorer.js";
import type { VerifyResult, GsPropertyScore } from "../shared/types.js";

// ── Schema ─────────────────────────────────────────────────────────────

export const verifySchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root to verify."),
  test_command: z
    .string()
    .optional()
    .describe(
      "Test command to run. Defaults to the `test` script in package.json, " +
      "or `npm test` if not found.",
    ),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .default(120_000)
    .describe("Maximum milliseconds to wait for the test suite. Default: 120 000 (2 min)."),
  pass_threshold: z
    .number()
    .int()
    .min(0)
    .max(12)
    .default(10)
    .describe("Minimum GS score (out of 12) required for overall pass. Default: 10."),
});

export type VerifyInput = z.infer<typeof verifySchema>;

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Run a full GS verification pass on a project directory.
 *
 * @param args - Validated input matching `verifySchema`
 * @returns MCP-style content array with a single formatted text report
 */
export async function verifyHandler(
  args: VerifyInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectDir = resolve(args.project_dir);
  const testCommand = resolveTestCommand(projectDir, args.test_command);

  // Run test suite first — result feeds Verifiable scoring
  const testSuite = runTestSuite(projectDir, testCommand, args.timeout_ms);

  // Static analysis
  const layerViolations = findDirectDbCallsInRoutes(projectDir);
  const missingTestFiles = findMissingTestFiles(projectDir);

  // GS property scoring
  const propertyScores = scoreGsProperties(
    projectDir,
    testSuite.passed,
    layerViolations,
    missingTestFiles,
  );

  const totalScore = propertyScores.reduce((sum, p) => sum + p.score, 0);
  const overallPass = testSuite.passed && totalScore >= args.pass_threshold;

  const result: VerifyResult = {
    testSuite,
    propertyScores,
    totalScore,
    layerViolations,
    missingTestFiles,
    overallPass,
  };

  return { content: [{ type: "text", text: formatReport(result, args.pass_threshold) }] };
}

// ── Test Runner ────────────────────────────────────────────────────────

/**
 * Resolve the test command from explicit arg, package.json scripts, or `npm test`.
 *
 * @param projectDir - Absolute project root
 * @param explicitCommand - User-provided override, if any
 * @returns Shell command string to execute
 */
function resolveTestCommand(projectDir: string, explicitCommand: string | undefined): string {
  if (explicitCommand) return explicitCommand;

  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const testScript = pkg.scripts?.["test"];
      if (testScript) return `npm test`;
    } catch {
      // Fall through to default
    }
  }

  return "npm test";
}

/**
 * Run the test command synchronously, capturing stdout + stderr.
 */
function runTestSuite(
  projectDir: string,
  command: string,
  timeoutMs: number,
): VerifyResult["testSuite"] {
  const start = Date.now();

  const [cmd, ...cmdArgs] = command.split(/\s+/).filter(Boolean) as [string, ...string[]];

  const result = spawnSync(cmd, cmdArgs, {
    cwd: projectDir,
    timeout: timeoutMs,
    encoding: "utf-8",
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    shell: process.platform === "win32",
  });

  const durationMs = Date.now() - start;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const timedOut = result.error?.message?.includes("ETIMEDOUT");
  const exitCode = timedOut ? -1 : (result.status ?? 1);

  return {
    passed: exitCode === 0,
    exitCode,
    durationMs,
    command,
    output: timedOut ? `[TIMEOUT after ${timeoutMs}ms]\n${output}` : output,
  };
}

// ── Formatter ──────────────────────────────────────────────────────────

/**
 * Format the full verify result as a human-readable Markdown report.
 */
function formatReport(result: VerifyResult, threshold: number): string {
  const lines: string[] = [];

  const badge = result.overallPass ? "✅ PASS" : "❌ FAIL";
  lines.push(`# ForgeCraft Verify — ${badge}`);
  lines.push("");

  // Test suite section
  lines.push("## Test Suite");
  const testBadge = result.testSuite.passed ? "✅ PASS" : "❌ FAIL";
  const secs = (result.testSuite.durationMs / 1000).toFixed(1);
  lines.push(
    `**${testBadge}** exit code ${result.testSuite.exitCode} · ${secs}s · \`${result.testSuite.command}\``,
  );
  if (result.testSuite.output) {
    const truncated = truncateLines(result.testSuite.output, 30);
    lines.push("");
    lines.push("```");
    lines.push(truncated);
    lines.push("```");
  }
  lines.push("");

  // GS property scores
  lines.push("## §4.3 GS Property Scores");
  lines.push("");
  lines.push(`**Total: ${result.totalScore}/12** (pass threshold: ${threshold})`);
  lines.push("");
  lines.push("| Property | Score | Evidence |");
  lines.push("|---|---|---|");
  for (const p of result.propertyScores) {
    const scoreCell = scoreEmoji(p.score) + ` ${p.score}/2`;
    const evidenceCell = p.evidence[0] ?? "";
    lines.push(`| ${formatPropertyName(p)} | ${scoreCell} | ${evidenceCell} |`);
    for (const e of p.evidence.slice(1)) {
      lines.push(`| | | ${e} |`);
    }
  }
  lines.push("");

  // Layer violations
  lines.push("## Bounded Violations — Direct DB Calls in Routes");
  if (result.layerViolations.length === 0) {
    lines.push("✅ None detected");
  } else {
    lines.push(`❌ ${result.layerViolations.length} violation(s):`);
    lines.push("");
    for (const v of result.layerViolations) {
      lines.push(`- \`${v.file}:${v.line}\` — \`${v.snippet.trim().slice(0, 100)}\``);
    }
  }
  lines.push("");

  // Missing test files
  lines.push("## Verifiable Gaps — Source Modules Without Tests");
  if (result.missingTestFiles.length === 0) {
    lines.push("✅ All source modules have test counterparts");
  } else {
    lines.push(`⚠️  ${result.missingTestFiles.length} module(s) without tests:`);
    lines.push("");
    for (const m of result.missingTestFiles.slice(0, 20)) {
      lines.push(`- \`${m.sourceFile}\` → expected \`${m.expectedTestFile}\``);
    }
    if (result.missingTestFiles.length > 20) {
      lines.push(`- … and ${result.missingTestFiles.length - 20} more`);
    }
  }
  lines.push("");

  // Summary
  lines.push("---");
  lines.push(`**Overall: ${result.overallPass ? "✅ PASS" : "❌ FAIL"}** · Score ${result.totalScore}/12 · Threshold ${threshold}/12`);

  return lines.join("\n");
}

/** Return emoji for a 0–2 score. */
function scoreEmoji(score: 0 | 1 | 2): string {
  return score === 2 ? "✅" : score === 1 ? "⚠️" : "❌";
}

/** Format property name with §4.3 label and title case. */
function formatPropertyName(p: GsPropertyScore): string {
  const label = p.property
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  return `**${label}**`;
}

/** Truncate output to a max number of lines, appending a truncation notice. */
function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [...lines.slice(0, maxLines), `… (${lines.length - maxLines} more lines)`].join("\n");
}
