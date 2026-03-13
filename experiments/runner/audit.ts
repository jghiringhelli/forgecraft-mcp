#!/usr/bin/env tsx
/**
 * audit.ts
 *
 * Adversarial auditor: sends one condition's complete output to Claude in a
 * FRESH session with no mention of GS, ForgeCraft, or the experiment.
 *
 * The auditor prompt asks Claude to score the codebase on six structural
 * properties (0–2 each) and provide evidence for each score.
 *
 * The auditor receives ONLY:
 *   - The six property definitions (derived from standard software engineering)
 *   - The output code + artifacts from one condition
 *
 * The auditor does NOT receive:
 *   - Any mention of GS methodology, ForgeCraft, or this experiment
 *   - The other condition's output
 *
 * Usage:
 *   npx tsx audit.ts --condition control
 *   npx tsx audit.ts --condition treatment
 *   npx tsx audit.ts --condition control --dry-run
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const EXPR_DIR   = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Auditor system prompt — no GS framing whatsoever
// ---------------------------------------------------------------------------
const AUDITOR_SYSTEM_PROMPT = `You are a senior software architect conducting a code review.
You will be given a TypeScript Node.js codebase and asked to score it on six structural properties.
For each property, provide:
1. A score: 0 (absent), 1 (partially present), or 2 (fully present and enforced)
2. A brief evidence quote or observation from the code that justifies your score
3. One concrete suggestion for improvement (if score < 2)

Be objective and precise. Quote specific file paths or code patterns to support each score.
Do not award points for intent — only for what is demonstrably present in the artifacts provided.`;

// ---------------------------------------------------------------------------
// Auditor property definitions — plain software engineering language
// ---------------------------------------------------------------------------
const PROPERTY_DEFINITIONS = `
## Properties to Score (0 = Absent, 1 = Partial, 2 = Fully Present)

### 1. Self-Describing
The codebase contains architectural documentation that a new contributor could use to understand
the system without running it. This includes: an architecture overview file, conventions guide,
or equivalent. Score 2 if a stateless reader can determine the system's purpose, structure,
and conventions from static artifacts alone.

### 2. Bounded
Each layer of the system has clearly defined responsibilities and does not cross into adjacent layers.
Route handlers should delegate to service functions; service functions should not directly query
the database via the ORM; repositories/services should own data access. Score 2 if all or nearly all
route files delegate to a service layer with no direct ORM calls.

### 3. Verifiable
The codebase has tests that cover the primary business logic and API surface. Test names describe
behaviour (not implementation). Coverage is ≥ 80% of implemented code. Score 2 if tests are organized
by layer (unit + integration), names describe expected behaviour, and coverage targets are met.

### 4. Defended
The repository has automated gates that prevent broken code from being committed. This includes:
commit hooks, lint blocking, test-before-commit enforcement, or equivalent CI config. Score 2 if at
least one pre-commit or pre-push gate is present and would block a failing test from being committed.

### 5. Auditable
The decision history is recoverable from the repository artifacts. This means: commits use a
consistent conventional format, architectural decisions are documented (ADRs or equivalent),
and the current state is summarised in a status or changelog document. Score 2 if all three
elements are present.

### 6. Composable
Services depend on interfaces or abstractions rather than concrete implementations. The repository
pattern (or equivalent abstraction layer) separates data access from business logic. No implicit
global state is shared across modules. Score 2 if dependency injection or interface-based design
is demonstrably present throughout the service layer.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadOutputText(condition: string): string {
  const outputDir = path.resolve(EXPR_DIR, condition, "output");
  if (!fs.existsSync(outputDir)) {
    console.error(`No output directory found for condition: ${condition}`);
    process.exit(1);
  }

  const responses = fs.readdirSync(outputDir)
    .filter((f) => f.endsWith("-response.md"))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(outputDir, f), "utf-8");
      return `\n---\n## ${f}\n\n${text}`;
    });

  if (responses.length === 0) {
    console.error(`No response files found in ${outputDir} — has the condition been run?`);
    process.exit(1);
  }

  return responses.join("\n");
}

function buildAuditPrompt(outputText: string): string {
  return [
    "# Code Review Assignment",
    "",
    "Below is the complete output of a TypeScript Node.js REST API project.",
    "The implementation covers user authentication, profiles, articles, comments, and tags.",
    "",
    "Please score each of the six properties defined below based only on what you see in the code.",
    "",
    PROPERTY_DEFINITIONS,
    "",
    "---",
    "",
    "# Codebase",
    "",
    outputText,
    "",
    "---",
    "",
    "# Your Task",
    "",
    "Produce a structured review with the following format:",
    "",
    "## 1. Self-Describing",
    "**Score:** [0/1/2]",
    "**Evidence:** [quote or observation]",
    "**Suggestion:** [if score < 2, what would improve it]",
    "",
    "## 2. Bounded",
    "**Score:** [0/1/2]",
    "**Evidence:** [quote or observation]",
    "**Suggestion:** [if score < 2]",
    "",
    "## 3. Verifiable",
    "**Score:** [0/1/2]",
    "**Evidence:** [quote or observation]",
    "**Suggestion:** [if score < 2]",
    "",
    "## 4. Defended",
    "**Score:** [0/1/2]",
    "**Evidence:** [quote or observation]",
    "**Suggestion:** [if score < 2]",
    "",
    "## 5. Auditable",
    "**Score:** [0/1/2]",
    "**Evidence:** [quote or observation]",
    "**Suggestion:** [if score < 2]",
    "",
    "## 6. Composable",
    "**Score:** [0/1/2]",
    "**Evidence:** [quote or observation]",
    "**Suggestion:** [if score < 2]",
    "",
    "## Summary",
    "**Total:** [X/12]",
    "**Strongest dimension:** [property name — one sentence]",
    "**Weakest dimension:** [property name — one sentence]",
    "**Overall assessment:** [2-3 sentences]",
  ].join("\n");
}

function writeScores(condition: string, auditText: string): void {
  const outDir = path.resolve(EXPR_DIR, condition, "evaluation");
  fs.mkdirSync(outDir, { recursive: true });
  const header = [
    `# Adversarial Audit Scores — ${condition}`,
    ``,
    `*Generated: ${new Date().toISOString()}*`,
    `*Method: blind Claude API session (auditor received only output + property definitions)*`,
    ``,
    `---`,
    ``,
  ].join("\n");

  const outPath = path.join(outDir, "scores.md");
  fs.writeFileSync(outPath, header + auditText, "utf-8");
  console.log(`  → ${path.relative(EXPR_DIR, outPath)}`);
}

// ---------------------------------------------------------------------------
// Claude CLI helper
// ---------------------------------------------------------------------------
function callClaudeOnce(
  prompt: string,
  systemPrompt: string,
  model: string,
): string {
  const args = [
    "--print",
    "--output-format", "json",
    "--model",         model,
    "--system-prompt", systemPrompt,
    "--no-session-persistence",   // fresh session, not resumable
  ];

  const result = spawnSync("claude", args, {
    input:     prompt,
    encoding:  "utf-8",
    maxBuffer: 100 * 1024 * 1024,
    timeout:   600_000,
    shell:     true,               // required on Windows to resolve claude.cmd
  });

  if (result.error) throw new Error(`claude CLI spawn error: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `claude CLI exited ${result.status}\nstderr: ${result.stderr}\nstdout: ${result.stdout.slice(0, 1000)}`,
    );
  }

  const parsed = JSON.parse(result.stdout.trim()) as { result?: string; is_error?: boolean };
  if (parsed.is_error) throw new Error(`claude is_error: ${result.stdout}`);
  return parsed.result ?? "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args      = process.argv.slice(2);
  const flagIdx   = args.indexOf("--condition");
  const condition = flagIdx !== -1 ? args[flagIdx + 1] : undefined;
  const dryRun    = args.includes("--dry-run");
  const modelIdx  = args.indexOf("--model");
  const model     = modelIdx !== -1 ? args[modelIdx + 1] : (process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-5");

  if (!condition || !["naive", "control", "treatment", "treatment-v2"].includes(condition)) {
    console.error("Usage: npx tsx audit.ts --condition naive|control|treatment|treatment-v2 [--model MODEL] [--dry-run]");
    process.exit(2);
  }

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  GS Experiment Auditor  (claude CLI)`);
  console.log(`  Condition : ${condition}`);
  console.log(`  Model     : ${model}`);
  console.log(`  Dry run   : ${dryRun}`);
  console.log(`════════════════════════════════════════════════════\n`);

  const outputText  = loadOutputText(condition);
  const auditPrompt = buildAuditPrompt(outputText);

  console.log(`  Output text length : ${outputText.length.toLocaleString()} chars`);
  console.log(`  Audit prompt length: ${auditPrompt.length.toLocaleString()} chars`);

  if (dryRun) {
    console.log("\n=== AUDIT PROMPT (first 2000 chars) ===\n");
    console.log(auditPrompt.slice(0, 2000), "...[truncated]");
    return;
  }

  console.log("\n  Sending to auditor model (fresh session, no context)...");

  const auditText = callClaudeOnce(auditPrompt, AUDITOR_SYSTEM_PROMPT, model);

  // Extract score summary
  const scoreMatch = auditText.match(/\*\*Total:\*\*\s*([\d]+)\s*\/\s*12/);
  if (scoreMatch) console.log(`  Score: ${scoreMatch[1]}/12`);

  writeScores(condition, auditText);
  console.log("\nAudit complete.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
