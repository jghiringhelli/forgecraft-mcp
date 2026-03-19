#!/usr/bin/env tsx
/**
 * evaluate.ts
 *
 * Extracts objective metrics from both arms' output and writes
 * experiments/{condition}/evaluation/metrics.md
 *
 * Metrics collected (grep-based, no code execution required):
 *   - Test count (it/test/describe blocks)
 *   - Layer violations (prisma. calls in route files)
 *   - ADR count
 *   - Has CLAUDE.md (boolean)
 *   - Has commit hooks (boolean)
 *   - Conventional commit format in session log
 *   - Approximate LoC (non-blank lines in code blocks)
 *   - Error format compliance (sample check)
 *
 * Usage:
 *   npx tsx evaluate.ts                  # evaluates both conditions
 *   npx tsx evaluate.ts --condition control
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const EXPR_DIR   = path.resolve(__dirname, "..");

interface ConditionMetrics {
  condition:         string;
  responseFiles:     number;
  estimatedLocTotal: number;
  testBlockCount:    number;
  itCallCount:       number;
  layerViolations:   LayerViolation[];
  hasClaudeMd:       boolean;
  hasCommitHooks:    boolean;
  adrCount:          number;
  hasStatusMd:       boolean;
  hasPrismaSchema:   boolean;
  errorFormatSamples: ErrorFormatSample[];
  conventionalCommitLines: number;
  rawOutput:         string; // combined text of all responses
}

interface LayerViolation {
  file:    string;
  line:    number;
  snippet: string;
}

interface ErrorFormatSample {
  file:    string;
  line:    number;
  snippet: string;
  isCompliant: boolean; // {"errors": {"body": [...]}} format
}

// ---------------------------------------------------------------------------
// Code extraction: pull all fenced code blocks from response markdown
// ---------------------------------------------------------------------------
function extractCodeBlocks(text: string): Array<{ path: string; code: string }> {
  const blocks: Array<{ path: string; code: string }> = [];
  // Match ```lang\n// path/to/file.ts\n...code\n```
  const fenceRe = /```(?:typescript|javascript|ts|js|prisma|sql|sh|bash|json)?\n(.*?)\n```/gs;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(text)) !== null) {
    const content = match[1]!;
    // First line of content may be a file path comment: // src/foo.ts or path: src/foo.ts
    const firstLine = content.split("\n")[0]!.trim();
    const pathMatch =
      firstLine.match(/^\/\/\s*(.+\.[a-z]+)$/) ??
      firstLine.match(/^#\s*(.+\.[a-z]+)$/) ??
      firstLine.match(/^(?:File|Path):\s*(.+)$/i);

    const filePath = pathMatch ? pathMatch[1]!.trim() : "(unlabeled)";
    blocks.push({ path: filePath, code: content });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Count test blocks across all code
// ---------------------------------------------------------------------------
function countTestBlocks(blocks: Array<{ path: string; code: string }>): {
  testBlockCount: number;
  itCallCount:    number;
} {
  let testBlockCount = 0;
  let itCallCount    = 0;
  for (const { code } of blocks) {
    testBlockCount += (code.match(/\bdescribe\s*\(/g) ?? []).length;
    itCallCount    += (code.match(/\b(?:it|test)\s*\(/g) ?? []).length;
  }
  return { testBlockCount, itCallCount };
}

// ---------------------------------------------------------------------------
// Detect layer violations: prisma. in route/controller/handler files
// ---------------------------------------------------------------------------
function detectLayerViolations(
  blocks: Array<{ path: string; code: string }>,
): LayerViolation[] {
  const violations: LayerViolation[] = [];
  const routePattern = /routes?|controllers?|handlers?/i;

  for (const { path: filePath, code } of blocks) {
    if (!routePattern.test(filePath)) continue;
    const lines = code.split("\n");
    lines.forEach((line, idx) => {
      if (/prisma\s*\./.test(line) && !/^\s*\/\//.test(line)) {
        violations.push({
          file:    filePath,
          line:    idx + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Sample error format compliance
// ---------------------------------------------------------------------------
function sampleErrorFormat(
  blocks: Array<{ path: string; code: string }>,
): ErrorFormatSample[] {
  const samples: ErrorFormatSample[] = [];
  // Look for error response patterns
  const errorResponseRe  = /\.(?:status|json)\s*\([^)]*error/i;
  const compliantFormatRe = /errors.*body.*\[/s;

  for (const { path: filePath, code } of blocks) {
    const lines = code.split("\n");
    lines.forEach((line, idx) => {
      if (errorResponseRe.test(line)) {
        // Look at surrounding context (±2 lines)
        const ctx = lines.slice(Math.max(0, idx - 2), idx + 3).join("\n");
        samples.push({
          file:        filePath,
          line:        idx + 1,
          snippet:     line.trim().slice(0, 120),
          isCompliant: compliantFormatRe.test(ctx),
        });
      }
    });
  }
  return samples.slice(0, 20); // cap at 20 samples
}

// ---------------------------------------------------------------------------
// Count LoC (non-blank, non-comment lines in code blocks)
// ---------------------------------------------------------------------------
function countLoc(blocks: Array<{ path: string; code: string }>): number {
  let count = 0;
  for (const { code } of blocks) {
    for (const line of code.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("#")) {
        count++;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Check condition artifacts (treatment has these in its folder)
// ---------------------------------------------------------------------------
function checkArtifacts(condition: string): {
  hasClaudeMd:     boolean;
  hasCommitHooks:  boolean;
  adrCount:        number;
  hasStatusMd:     boolean;
  hasPrismaSchema: boolean;
} {
  const base       = path.resolve(EXPR_DIR, condition);
  const hasFile    = (rel: string) => fs.existsSync(path.join(base, rel));
  const countFiles = (dir: string) => {
    const abs = path.join(base, dir);
    return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => f.endsWith(".md")).length : 0;
  };

  return {
    hasClaudeMd:     hasFile("CLAUDE.md"),
    hasCommitHooks:  hasFile(".claude/hooks") && fs.readdirSync(path.join(base, ".claude/hooks")).length > 0,
    adrCount:        countFiles("docs/adrs"),
    hasStatusMd:     hasFile("Status.md"),
    hasPrismaSchema: hasFile("prisma/schema.prisma"),
  };
}

// ---------------------------------------------------------------------------
// Main evaluation for one condition
// ---------------------------------------------------------------------------
function evaluateCondition(condition: string): ConditionMetrics {
  const outputDir = path.resolve(EXPR_DIR, condition, "output");
  if (!fs.existsSync(outputDir)) {
    console.warn(`  [WARN] no output directory for ${condition} — has it been run?`);
    return {
      condition,
      responseFiles:    0,
      estimatedLocTotal: 0,
      testBlockCount:   0,
      itCallCount:      0,
      layerViolations:  [],
      errorFormatSamples: [],
      rawOutput:        "",
      conventionalCommitLines: 0,
      ...checkArtifacts(condition),
    };
  }

  const responseFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith("-response.md"));
  const rawOutput = responseFiles
    .map((f) => fs.readFileSync(path.join(outputDir, f), "utf-8"))
    .join("\n\n");

  const blocks       = extractCodeBlocks(rawOutput);
  const testCounts   = countTestBlocks(blocks);
  const violations   = detectLayerViolations(blocks);
  const errorSamples = sampleErrorFormat(blocks);
  const loc          = countLoc(blocks);

  // Conventional commit check: scan session log if present
  let conventionalCommitLines = 0;
  const logPath = path.join(outputDir, "session.log.json");
  if (fs.existsSync(logPath)) {
    const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    // Look in assistant messages for commit commands with conventional format
    for (const msg of (log.messages ?? [])) {
      if (msg.role !== "assistant") continue;
      const text = typeof msg.content === "string" ? msg.content : "";
      const matches = text.match(/^(?:feat|fix|refactor|chore|docs|test|style)\([^)]+\):/gm);
      if (matches) conventionalCommitLines += matches.length;
    }
  }

  return {
    condition,
    responseFiles: responseFiles.length,
    estimatedLocTotal: loc,
    ...testCounts,
    layerViolations:  violations,
    errorFormatSamples: errorSamples,
    rawOutput,
    conventionalCommitLines,
    ...checkArtifacts(condition),
  };
}

// ---------------------------------------------------------------------------
// Render metrics markdown
// ---------------------------------------------------------------------------
function renderMetrics(m: ConditionMetrics): string {
  const compliantErrorSamples = m.errorFormatSamples.filter((s) => s.isCompliant).length;
  const totalErrorSamples     = m.errorFormatSamples.length;

  return [
    `# Objective Metrics — ${m.condition}`,
    ``,
    `*Generated: ${new Date().toISOString()}*`,
    ``,
    `## Source`,
    ``,
    `| Item | Value |`,
    `|---|---|`,
    `| Response files collected | ${m.responseFiles} |`,
    `| Estimated LoC (non-blank, non-comment) | ${m.estimatedLocTotal} |`,
    ``,
    `## Testing`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| \`describe\` blocks | ${m.testBlockCount} |`,
    `| \`it\`/\`test\` calls | ${m.itCallCount} |`,
    `| Coverage % | *run \`npx jest --coverage\` in output/ to measure* |`,
    ``,
    `## Layer Discipline`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Layer violations (prisma. in route files) | ${m.layerViolations.length} |`,
    ``,
    m.layerViolations.length > 0
      ? [
          `### Violation Details`,
          ``,
          ...m.layerViolations.map(
            (v) => `- **${v.file}:${v.line}** \`${v.snippet}\``,
          ),
          ``,
        ].join("\n")
      : "",
    `## Error Format Compliance`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Error response sites sampled | ${totalErrorSamples} |`,
    `| Conforming to \`{"errors": {"body": [...]}}\` | ${compliantErrorSamples} / ${totalErrorSamples} |`,
    ``,
    `## GS Artifact Presence`,
    ``,
    `| Artifact | Present |`,
    `|---|---|`,
    `| CLAUDE.md | ${m.hasClaudeMd ? "✅" : "❌"} |`,
    `| Commit hooks | ${m.hasCommitHooks ? "✅" : "❌"} |`,
    `| ADRs | ${m.adrCount > 0 ? `✅ (${m.adrCount} files)` : "❌"} |`,
    `| Status.md | ${m.hasStatusMd ? "✅" : "❌"} |`,
    `| Prisma schema (pre-defined) | ${m.hasPrismaSchema ? "✅" : "❌"} |`,
    `| Conventional commits detected in session | ${m.conventionalCommitLines} |`,
    ``,
    `## Naming Signal`,
    ``,
    `*Score manually: pick 10 random function/variable names from output code and assess whether each uses a domain term (User, Article, Comment, Profile, Tag, slug, feed, favorite, follow). Score = domain terms / 10.*`,
    ``,
    `| Manual sample score | *fill after review* |`,
    `|---|---|`,
    ``,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function main(): void {
  const args      = process.argv.slice(2);
  const flag      = args.indexOf("--condition");
  const conditions = flag !== -1
    ? [args[flag + 1]!]
    : ["control", "treatment"];

  for (const condition of conditions) {
    console.log(`\nEvaluating: ${condition}`);
    const metrics  = evaluateCondition(condition);
    const markdown = renderMetrics(metrics);

    const outDir = path.resolve(EXPR_DIR, condition, "evaluation");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "metrics.md");
    fs.writeFileSync(outPath, markdown, "utf-8");

    console.log(`  Layer violations : ${metrics.layerViolations.length}`);
    console.log(`  Tests (it/test)  : ${metrics.itCallCount}`);
    console.log(`  Est. LoC         : ${metrics.estimatedLocTotal}`);
    console.log(`  → ${path.relative(EXPR_DIR, outPath)}`);
  }
  console.log("\nDone.\n");
}

main();
