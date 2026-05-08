#!/usr/bin/env node
// audit-tests.js — Test suite health audit
//
// Usage:
//   node scripts/audit-tests.js
//   node scripts/audit-tests.js --json          # machine-readable output
//   node scripts/audit-tests.js --threshold 2   # flag tests with ≤N unique kills (default: 0)
//
// Produces four reports:
//   1. Overlap map   — source modules tested by 2+ test files
//   2. Mutation gaps — tests with few/no unique mutation kills (TDD scope only)
//   3. Fixture vs real — separates fixture project test files from actual tests
//   4. Density       — test count relative to source file size

"use strict";
const fs   = require("fs");
const path = require("path");

// ── CLI args ──────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const JSON_OUTPUT  = args.includes("--json");
const THRESHOLD    = parseInt(args[args.indexOf("--threshold") + 1] ?? "0", 10) || 0;
const ROOT         = path.resolve(__dirname, "..");

// ── Helpers ───────────────────────────────────────────────────────────────
const rel    = p => path.relative(ROOT, p).replace(/\\/g, "/");
const exists = p => { try { fs.statSync(p); return true; } catch { return false; } }

function walkDir(dir, ext, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// Extract import paths from a TS file (handles both import and require)
function extractImports(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const re = /(?:from|require\()\s*['"]([^'"]+)['"]/g;
  const imports = [];
  let m;
  while ((m = re.exec(src)) !== null) imports.push(m[1]);
  return imports;
}

// Resolve a relative import path from a test file to a canonical src/ path
function resolveToSrc(importPath, fromFile) {
  if (!importPath.startsWith(".")) return null; // external dep
  const abs = path.resolve(path.dirname(fromFile), importPath);
  const rel_ = path.relative(ROOT, abs).replace(/\\/g, "/");
  if (!rel_.startsWith("src/")) return null;
  // normalise: strip .ts/.js extension
  return rel_.replace(/\.(ts|js)$/, "");
}

// ── 1. Collect all test files ─────────────────────────────────────────────
const testsDir  = path.join(ROOT, "tests");
const allTests  = walkDir(testsDir, ".test.ts");

const fixtureTests = allTests.filter(f => rel(f).includes("/fixtures/"));
const realTests    = allTests.filter(f => !rel(f).includes("/fixtures/"));

// ── 2. Overlap map ────────────────────────────────────────────────────────
// For each real test file, map which src/ modules it imports
const testToSrc = new Map(); // testRelPath → Set<srcModule>
const srcToTests = new Map(); // srcModule → Set<testRelPath>

for (const t of realTests) {
  const imports = extractImports(t);
  const srcModules = new Set();
  for (const imp of imports) {
    const resolved = resolveToSrc(imp, t);
    if (resolved) {
      srcModules.add(resolved);
      if (!srcToTests.has(resolved)) srcToTests.set(resolved, new Set());
      srcToTests.get(resolved).add(rel(t));
    }
  }
  testToSrc.set(rel(t), srcModules);
}

// Tests that import NO src modules (potential orphans — test what?)
const orphanTests = realTests
  .filter(t => (testToSrc.get(rel(t))?.size ?? 0) === 0)
  .map(t => rel(t));

// Source modules covered by 2+ test files
const overlappedModules = [...srcToTests.entries()]
  .filter(([, tests]) => tests.size > 1)
  .sort((a, b) => b[1].size - a[1].size)
  .map(([src, tests]) => ({ src, coveredBy: [...tests].sort() }));

// ── 3. Mutation uniqueness (from existing mutation.json) ───────────────────
const mutationReportPath = path.join(ROOT, "reports/mutation/mutation.json");
let mutationReport = null;
const testUniqueKills  = new Map(); // testId → { name, file, unique, total, covered }
const testIdToMeta     = new Map(); // testId → { name, file }

if (exists(mutationReportPath)) {
  mutationReport = JSON.parse(fs.readFileSync(mutationReportPath, "utf8"));

  // Build id→meta index
  for (const [file, tf] of Object.entries(mutationReport.testFiles ?? {})) {
    for (const t of tf.tests) {
      testIdToMeta.set(t.id, { name: t.name, file: path.relative(ROOT, file).replace(/\\/g, "/") });
      testUniqueKills.set(t.id, { ...testIdToMeta.get(t.id), unique: 0, total: 0, covered: 0 });
    }
  }

  // Walk mutants, accumulate kill stats per test
  for (const [, f] of Object.entries(mutationReport.files)) {
    for (const mutant of f.mutants) {
      const covered = mutant.coveredBy ?? [];
      const killed  = mutant.killedBy  ?? [];

      for (const tid of covered) {
        if (testUniqueKills.has(tid)) testUniqueKills.get(tid).covered++;
      }
      for (const tid of killed) {
        if (testUniqueKills.has(tid)) testUniqueKills.get(tid).total++;
      }
      // Unique kill = only one test killed this mutant
      if (killed.length === 1) {
        const tid = killed[0];
        if (testUniqueKills.has(tid)) testUniqueKills.get(tid).unique++;
      }
    }
  }
}

// Tests with ≤ THRESHOLD unique kills (sorted lowest unique first)
const lowUniqueKillers = [...testUniqueKills.values()]
  .filter(t => t.unique <= THRESHOLD)
  .sort((a, b) => a.unique - b.unique || a.total - b.total);

// Group by file for readability
const lowByFile = new Map();
for (const t of lowUniqueKillers) {
  if (!lowByFile.has(t.file)) lowByFile.set(t.file, []);
  lowByFile.get(t.file).push(t);
}

// ── 4. Test density ───────────────────────────────────────────────────────
// Count test cases per test file (rough: count "it(" and "test(" calls)
function countTests(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  return (src.match(/^\s*(it|test)\s*\(/gm) ?? []).length;
}

const density = realTests
  .map(t => {
    const count = countTests(t);
    // Try to find corresponding source file
    const relT  = rel(t);
    const srcGuess = relT.replace(/^tests\//, "src/").replace(/\.test\.ts$/, ".ts");
    const srcPath  = path.join(ROOT, srcGuess);
    let srcLines   = null;
    if (exists(srcPath)) {
      srcLines = fs.readFileSync(srcPath, "utf8").split("\n").length;
    }
    return { file: relT, tests: count, srcLines, ratio: srcLines ? (count / srcLines * 100).toFixed(1) : null };
  })
  .sort((a, b) => (b.tests - a.tests));

// ── Output ─────────────────────────────────────────────────────────────────
if (JSON_OUTPUT) {
  console.log(JSON.stringify({
    summary: {
      totalTestFiles: allTests.length,
      fixtureTestFiles: fixtureTests.length,
      realTestFiles: realTests.length,
      orphanTestFiles: orphanTests.length,
      overlappedSourceModules: overlappedModules.length,
      mutationScopeTestFiles: mutationReport ? Object.keys(mutationReport.testFiles ?? {}).length : 0,
      lowUniqueKillerTests: lowUniqueKillers.length,
    },
    orphans: orphanTests,
    overlap: overlappedModules,
    mutationLowUnique: lowUniqueKillers,
    density: density.slice(0, 20),
  }, null, 2));
  process.exit(0);
}

// ── Human-readable output ─────────────────────────────────────────────────
const hr = "─".repeat(70);
const hdr = (title) => `\n${hr}\n  ${title}\n${hr}`;

console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║              TEST SUITE AUDIT                                       ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");
console.log(`\n  Total test files : ${allTests.length}`);
console.log(`  Fixture files    : ${fixtureTests.length}  (sample codebases used by analyzers — expected)`);
console.log(`  Real test files  : ${realTests.length}`);

// ── Section 1: Orphans ───────────────────────────────────────────────────
console.log(hdr("1 / ORPHAN TEST FILES  (import nothing from src/)"));
if (orphanTests.length === 0) {
  console.log("  ✅ None found — every test file imports at least one src/ module");
} else {
  console.log(`  ${orphanTests.length} test file(s) import nothing from src/. They may test fixtures,`);
  console.log("  external integrations, or be leftover stubs worth reviewing:\n");
  for (const t of orphanTests) console.log(`  ⚠  ${t}`);
}

// ── Section 2: Overlap map ───────────────────────────────────────────────
console.log(hdr("2 / SOURCE MODULE OVERLAP  (same src/ module covered by 2+ test files)"));
if (overlappedModules.length === 0) {
  console.log("  ✅ No overlapping coverage detected");
} else {
  console.log(`  ${overlappedModules.length} source module(s) are covered by multiple test files.`);
  console.log("  Overlap is not always bad — integration tests legitimately re-cover units.\n");
  for (const { src, coveredBy } of overlappedModules.slice(0, 20)) {
    console.log(`  ${src}`);
    for (const t of coveredBy) console.log(`    ← ${t}`);
    console.log();
  }
  if (overlappedModules.length > 20)
    console.log(`  ... and ${overlappedModules.length - 20} more. Run --json to get the full list.`);
}

// ── Section 3: Mutation uniqueness ───────────────────────────────────────
console.log(hdr(`3 / MUTATION UNIQUENESS  (tests with ≤${THRESHOLD} unique kills in TDD scope)`));
if (!mutationReport) {
  console.log("  ⚠  reports/mutation/mutation.json not found.");
  console.log("  Run: npm run test:mutation  to generate it first.");
} else {
  const total = testUniqueKills.size;
  console.log(`  Analysing ${total} tests across ${Object.keys(mutationReport.testFiles ?? {}).length} TDD-scope files.`);
  console.log(`  (The other ${realTests.length - Object.keys(mutationReport.testFiles ?? {}).length} real test files are not yet in mutation scope.)\n`);

  if (lowUniqueKillers.length === 0) {
    console.log("  ✅ Every test kills at least one mutant that no other test kills");
  } else {
    console.log(`  ${lowUniqueKillers.length} test(s) have ≤${THRESHOLD} unique kills. These are candidates for`);
    console.log("  consolidation — but verify they add coverage depth before removing.\n");
    for (const [file, tests] of lowByFile) {
      console.log(`  ${file}`);
      for (const t of tests) {
        const marker = t.unique === 0 ? "⚠ " : "  ";
        console.log(`    ${marker}[unique=${t.unique} total=${t.total} covered=${t.covered}]  ${t.name}`);
      }
      console.log();
    }
  }
  if (THRESHOLD === 0) console.log("  Tip: --threshold 1 shows tests that share ALL their kills with other tests");
}

// ── Section 4: Density ───────────────────────────────────────────────────
console.log(hdr("4 / TEST DENSITY  (top 15 test files by test count)"));
console.log("  High count alone is not a problem if the module is complex.\n");
console.log("  File                                                tests  src-lines  ratio%");
console.log("  " + "─".repeat(78));
for (const { file, tests, srcLines, ratio } of density.slice(0, 15)) {
  const f   = file.padEnd(52).slice(0, 52);
  const t   = String(tests).padStart(5);
  const sl  = srcLines ? String(srcLines).padStart(10) : "        —";
  const r   = ratio ? `${ratio}%`.padStart(8) : "       —";
  console.log(`  ${f} ${t}  ${sl}  ${r}`);
}

// ── Footer ────────────────────────────────────────────────────────────────
console.log(`\n${hr}`);
console.log("  Next steps:");
console.log("  • Orphans: review whether each file tests something real");
console.log("  • Overlap: check if multiple test files test the same handler — merge if so");
console.log("  • Mutation 0-unique-kills: run --threshold 1 for broader view, consider consolidation");
console.log("  • High density: not a problem if the module is complex; watch for copy-paste tests");
console.log(`\n  Re-run: node scripts/audit-tests.js [--json] [--threshold N]`);
console.log(hr);
