#!/usr/bin/env tsx
/**
 * run-tests.ts
 *
 * Materializes generated code, installs dependencies, runs Prisma migrations,
 * and executes the full Jest test suite against a real PostgreSQL database.
 * Appends actual coverage numbers to evaluation/metrics.md.
 *
 * Prerequisites:
 *   1. Run materialize.ts first (or pass --materialize to do it here)
 *   2. A PostgreSQL instance must be reachable (docker compose up -d, or Rancher)
 *   3. DATABASE_URL_CONTROL and/or DATABASE_URL_TREATMENT env vars set
 *
 * Usage:
 *   # With docker-compose (from experiments/):
 *   docker compose up -d
 *   DATABASE_URL_CONTROL=postgresql://conduit:conduit@localhost:5433/conduit_control \
 *   DATABASE_URL_TREATMENT=postgresql://conduit:conduit@localhost:5435/conduit_treatment \
 *   npx tsx run-tests.ts --condition control
 *
 *   # With Rancher/external PostgreSQL:
 *   DATABASE_URL_CONTROL=postgresql://user:pass@rancher-host:5432/conduit_control \
 *   npx tsx run-tests.ts --condition control
 *
 *   # Combined with materialize:
 *   npx tsx run-tests.ts --condition control --materialize
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const EXPR_DIR   = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(): { condition: string; materialize: boolean; skipMigrate: boolean } {
  const args      = process.argv.slice(2);
  const flagIdx   = args.indexOf("--condition");
  const condition = flagIdx !== -1 ? args[flagIdx + 1] : undefined;

  if (!condition || !["control", "treatment"].includes(condition)) {
    console.error(
      "Usage: npx tsx run-tests.ts --condition control|treatment [--materialize] [--skip-migrate]"
    );
    process.exit(2);
  }
  return {
    condition,
    materialize:  args.includes("--materialize"),
    skipMigrate:  args.includes("--skip-migrate"),
  };
}

// ---------------------------------------------------------------------------
// Resolve DATABASE_URL for this condition
// ---------------------------------------------------------------------------
function resolveDbUrl(condition: string): string {
  const envKey = condition === "control"
    ? "DATABASE_URL_CONTROL"
    : "DATABASE_URL_TREATMENT";

  const url = process.env[envKey] ?? process.env["DATABASE_URL"];

  if (!url) {
    const dockerUrl = condition === "control"
      ? "postgresql://conduit:conduit@localhost:5433/conduit_control"
      : "postgresql://conduit:conduit@localhost:5435/conduit_treatment";

    console.warn(`  [WARN] ${envKey} not set — trying Docker default: ${dockerUrl}`);
    return dockerUrl;
  }
  return url;
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------
function run(
  cmd:     string,
  cwd:     string,
  env?:    Record<string, string>,
  label?:  string,
): { exitCode: number; stdout: string; stderr: string } {
  if (label) console.log(`\n  ▶ ${label}`);
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: "utf-8",
    env: { ...process.env, ...(env ?? {}) },
  });
  if (result.stdout) process.stdout.write(result.stdout.split("\n").map((l) => `    ${l}`).join("\n"));
  if (result.stderr) process.stderr.write(result.stderr.split("\n").map((l) => `    ${l}`).join("\n"));
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// Coverage report parsing
// ---------------------------------------------------------------------------
interface CoverageResult {
  statements: number;
  branches:   number;
  functions:  number;
  lines:      number;
  testFiles:  number;
  testsPassed: number;
  testsFailed: number;
}

function parseCoverageJson(projectDir: string): CoverageResult | null {
  // Jest --json output
  const reportPath = path.join(projectDir, "coverage", "coverage-summary.json");
  const jestReport = path.join(projectDir, "jest-results.json");

  let testsPassed = 0;
  let testsFailed = 0;
  let testFiles   = 0;

  if (fs.existsSync(jestReport)) {
    try {
      const report = JSON.parse(fs.readFileSync(jestReport, "utf-8"));
      testsPassed = report.numPassedTests  ?? 0;
      testsFailed = report.numFailedTests  ?? 0;
      testFiles   = report.numPassedTestSuites + report.numFailedTestSuites ?? 0;
    } catch { /* ignore */ }
  }

  if (!fs.existsSync(reportPath)) return null;

  try {
    const summary = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    const total   = summary.total;
    return {
      statements: total.statements.pct,
      branches:   total.branches.pct,
      functions:  total.functions.pct,
      lines:      total.lines.pct,
      testFiles,
      testsPassed,
      testsFailed,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Patch package.json jest config to write json output and coverage summary
// ---------------------------------------------------------------------------
function ensureJestCoverageConfig(projectDir: string): void {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (!pkg.jest) pkg.jest = {};

  // Ensure coverage reporters include json-summary
  const reporters: string[] = pkg.jest.coverageReporters ?? ["text", "lcov"];
  if (!reporters.includes("json-summary")) reporters.push("json-summary");
  pkg.jest.coverageReporters = reporters;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Append real coverage to metrics.md
// ---------------------------------------------------------------------------
function appendCoverageToMetrics(condition: string, coverage: CoverageResult): void {
  const metricsPath = path.resolve(EXPR_DIR, condition, "evaluation", "metrics.md");
  const section = [
    ``,
    `---`,
    ``,
    `## Real Test Coverage (from Jest + PostgreSQL)`,
    ``,
    `*Measured: ${new Date().toISOString()}*`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Test files run | ${coverage.testFiles} |`,
    `| Tests passed | ${coverage.testsPassed} |`,
    `| Tests failed | ${coverage.testsFailed} |`,
    `| Statement coverage | ${coverage.statements}% |`,
    `| Branch coverage   | ${coverage.branches}% |`,
    `| Function coverage | ${coverage.functions}% |`,
    `| Line coverage     | ${coverage.lines}% |`,
    `| Coverage gate (80% lines) | ${coverage.lines >= 80 ? "✅ Pass" : "❌ Fail"} |`,
    ``,
  ].join("\n");

  if (fs.existsSync(metricsPath)) {
    fs.appendFileSync(metricsPath, section, "utf-8");
  } else {
    fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
    fs.writeFileSync(metricsPath, section, "utf-8");
  }
  console.log(`\n  → coverage appended to ${path.relative(EXPR_DIR, metricsPath)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { condition, materialize, skipMigrate } = parseArgs();
  const dbUrl      = resolveDbUrl(condition);
  const projectDir = path.resolve(EXPR_DIR, condition, "output", "project");

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  Test Runner — ${condition}`);
  console.log(`  Project:  ${projectDir}`);
  console.log(`  DB:       ${dbUrl.replace(/:([^:@]+)@/, ":****@")}`);
  console.log(`════════════════════════════════════════════════════\n`);

  // Step 0: optional materialization
  if (materialize) {
    console.log("  Materializing output...");
    const result = run(
      `npx tsx materialize.ts --condition ${condition}`,
      path.resolve(__dirname),
      {},
      "materialize",
    );
    if (result.exitCode !== 0) {
      console.error("Materialization failed.");
      process.exit(1);
    }
  }

  if (!fs.existsSync(projectDir)) {
    console.error(`Project directory not found: ${projectDir}`);
    console.error("Run materialize.ts first, or pass --materialize.");
    process.exit(1);
  }

  const dbEnv = { DATABASE_URL: dbUrl };

  // Step 1: npm install
  const install = run("npm install", projectDir, {}, "npm install");
  if (install.exitCode !== 0) {
    console.error("npm install failed.");
    process.exit(1);
  }

  // Step 2: prisma generate
  run("npx prisma generate", projectDir, dbEnv, "prisma generate");

  // Step 3: migrate reset (drop + recreate + apply all migrations)
  if (!skipMigrate) {
    const migrate = run(
      "npx prisma migrate reset --force --skip-seed",
      projectDir,
      dbEnv,
      "prisma migrate reset",
    );
    if (migrate.exitCode !== 0) {
      console.warn("  [WARN] prisma migrate reset failed — trying migrate deploy instead");
      run("npx prisma migrate deploy", projectDir, dbEnv, "prisma migrate deploy");
    }
  }

  // Step 4: ensure jest outputs coverage-summary.json
  ensureJestCoverageConfig(projectDir);

  // Step 5: run tests with coverage
  const testResult = run(
    "npx jest --runInBand --coverage --json --outputFile=jest-results.json",
    projectDir,
    dbEnv,
    "jest --coverage",
  );

  const testsPassed = testResult.exitCode === 0;
  console.log(`\n  Tests ${testsPassed ? "✅ passed" : "❌ failed"} (exit ${testResult.exitCode})`);

  // Step 6: parse and record coverage
  const coverage = parseCoverageJson(projectDir);
  if (coverage) {
    console.log(`\n  Coverage summary:`);
    console.log(`    Statements : ${coverage.statements}%`);
    console.log(`    Branches   : ${coverage.branches}%`);
    console.log(`    Functions  : ${coverage.functions}%`);
    console.log(`    Lines      : ${coverage.lines}%`);
    console.log(`    Tests      : ${coverage.testsPassed} passed / ${coverage.testsFailed} failed`);
    appendCoverageToMetrics(condition, coverage);
  } else {
    console.warn("  [WARN] Could not parse coverage-summary.json");
    console.warn("         Check that jest ran and coverage/coverage-summary.json was written.");
  }

  console.log("\n════ Test run complete ════\n");
  process.exit(testsPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
