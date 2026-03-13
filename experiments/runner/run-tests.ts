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

  if (!condition || !["naive", "control", "treatment", "treatment-v2", "treatment-v3"].includes(condition)) {
    console.error(
      "Usage: npx tsx run-tests.ts --condition naive|control|treatment|treatment-v2|treatment-v3 [--materialize] [--skip-migrate]"
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
    : condition === "treatment"
    ? "DATABASE_URL_TREATMENT"
    : condition === "treatment-v2"
    ? "DATABASE_URL_TREATMENT_V2"
    : condition === "treatment-v3"
    ? "DATABASE_URL_TREATMENT_V3"
    : "DATABASE_URL_NAIVE";

  const url = process.env[envKey] ?? process.env["DATABASE_URL"];

  if (!url) {
    const dockerUrl = condition === "control"
      ? "postgresql://conduit:conduit@localhost:5433/conduit_control"
      : condition === "treatment"
      ? "postgresql://conduit:conduit@localhost:5435/conduit_treatment"
      : condition === "treatment-v2"
      ? "postgresql://conduit:conduit@localhost:5439/conduit_treatment_v2"
      : condition === "treatment-v3"
      ? "postgresql://conduit:conduit@localhost:5441/conduit_treatment_v3"
      : "postgresql://conduit:conduit@localhost:5437/conduit_naive";

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

/**
 * Remove the `coverageThreshold` key (and its nested object value) from a
 * Jest config source string.  Handles arbitrarily nested braces.
 */
function removeCoverageThreshold(src: string): string {
  const marker = "coverageThreshold";
  const idx = src.indexOf(marker);
  if (idx === -1) return src;

  // Find the ':' after the key
  let pos = idx + marker.length;
  while (pos < src.length && /\s/.test(src[pos]!)) pos++;
  if (src[pos] !== ":") return src;               // unexpected format, skip
  pos++;                                           // skip ':'
  while (pos < src.length && /\s/.test(src[pos]!)) pos++;

  if (src[pos] !== "{") return src;               // value is not an object
  let depth = 0;
  const valueStart = pos;
  for (; pos < src.length; pos++) {
    if (src[pos] === "{") depth++;
    else if (src[pos] === "}") { depth--; if (depth === 0) { pos++; break; } }
  }
  // Also consume a trailing comma and any whitespace
  while (pos < src.length && /[,\s]/.test(src[pos]!)) pos++;

  return src.slice(0, idx) + src.slice(pos);
}

function ensureJestCoverageConfig(projectDir: string): void {
  const pkgPath        = path.join(projectDir, "package.json");
  const jestConfigTs   = path.join(projectDir, "jest.config.ts");
  const jestConfigJs   = path.join(projectDir, "jest.config.js");
  const hasConfigFile  = fs.existsSync(jestConfigTs) || fs.existsSync(jestConfigJs);

  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;

  if (hasConfigFile) {
    // If a jest.config.ts/js exists, remove any conflicting jest key from package.json.
    if (pkg["jest"]) {
      delete pkg["jest"];
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
    }
    // Patch the config file: add json-summary reporter and remove coverageThreshold
    // (threshold failures prevent coverage-summary.json from being written)
    const configPath = fs.existsSync(jestConfigTs) ? jestConfigTs : jestConfigJs!;
    let configSrc = fs.readFileSync(configPath, "utf-8");
    let changed = false;

    if (!configSrc.includes("json-summary")) {
      if (configSrc.includes("coverageReporters")) {
        // Key exists — inject into existing array
        configSrc = configSrc.replace(
          /coverageReporters\s*:\s*\[([^\]]*)\]/,
          (m, inner) => `coverageReporters: [${inner.trimEnd().replace(/,?\s*$/, "")}, "json-summary"]`,
        );
      } else {
        // Key absent — insert before the closing brace of the exported config object.
        // Both `const config = { ... };\nexport default config;` (TS) and
        // `module.exports = { ... };` (JS) end the object with `};`.
        const insertPos = configSrc.lastIndexOf("};");
        if (insertPos !== -1) {
          // Ensure the preceding content ends with a comma so the new property
          // doesn't cause a syntax error (e.g. `verbose: true` has no trailing comma).
          const before = configSrc.slice(0, insertPos).trimEnd().replace(/,?$/, ",");
          configSrc =
            before +
            `\n  coverageReporters: ["text", "lcov", "json-summary"],\n` +
            configSrc.slice(insertPos);
        }
      }
      changed = true;
    }
    // Remove coverageThreshold block so thresholds don't suppress coverage output
    if (configSrc.includes("coverageThreshold")) {
      configSrc = removeCoverageThreshold(configSrc);
      changed = true;
    }
    if (changed) fs.writeFileSync(configPath, configSrc, "utf-8");
  } else {
    // No config file — ensure jest key exists in package.json with json-summary
    const jestKey = (pkg["jest"] ?? {}) as Record<string, unknown>;
    const reporters = (jestKey["coverageReporters"] as string[] | undefined) ?? ["text", "lcov"];
    if (!reporters.includes("json-summary")) reporters.push("json-summary");
    jestKey["coverageReporters"] = reporters;
    // Remove coverageThreshold so it doesn't suppress coverage-summary.json output
    delete jestKey["coverageThreshold"];
    pkg["jest"] = jestKey;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
  }
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

  // Inject all env vars the generated code may require
  const dbEnv: Record<string, string> = {
    DATABASE_URL:  dbUrl,
    JWT_SECRET:    "experiment-test-secret-not-for-production",
    PORT:          "3001",
    NODE_ENV:      "test",
    LOG_LEVEL:     "silent",   // suppress pino output in tests
  };

  // Step 1: npm install (include pino-pretty to avoid logger transport failures)
  // Also inject test dependencies if the model forgot them (common in naive condition)
  const pkgPath = path.join(projectDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const devDeps = (pkg["devDependencies"] ?? {}) as Record<string, string>;
    const devChanged = !devDeps["jest"] || !devDeps["ts-jest"] || !devDeps["supertest"];
    if (devChanged) {
      console.log("  [INFO] Injecting missing test dependencies into package.json");
      devDeps["jest"]             ??= "^29.7.0";
      devDeps["ts-jest"]          ??= "^29.1.5";
      devDeps["@types/jest"]      ??= "^29.5.12";
      devDeps["supertest"]        ??= "^7.0.0";
      devDeps["@types/supertest"] ??= "^6.0.2";
      pkg["devDependencies"] = devDeps;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
    }
  }
  const install = run("npm install --save-dev pino-pretty", projectDir, {}, "npm install");
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
  const jestConfigTs  = path.join(projectDir, "jest.config.ts");
  const jestConfigJs  = path.join(projectDir, "jest.config.js");
  const configFlag    = fs.existsSync(jestConfigTs) ? "--config jest.config.ts"
                      : fs.existsSync(jestConfigJs) ? "--config jest.config.js"
                      : "";
  // --coverageThreshold='{}' overrides any threshold config so coverage-summary.json is always written
  const testResult = run(
    `npx jest --runInBand --coverage --json --outputFile=jest-results.json --coverageThreshold="{}" ${configFlag}`.trim(),
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
