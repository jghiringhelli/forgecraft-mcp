#!/usr/bin/env tsx
/**
 * run-experiment.ts
 *
 * Runs one arm of the GS vs. Plain-AI RealWorld experiment by issuing prompts
 * to the `claude` CLI in sequence within a single persistent conversation.
 *
 * The script carries ONLY the condition's specified context files.
 * It has no knowledge of the GS methodology, forgecraft-mcp, or this project.
 *
 * Usage:
 *   npx tsx run-experiment.ts --condition control
 *   npx tsx run-experiment.ts --condition treatment
 *   npx tsx run-experiment.ts --condition control --resume 3   # continue from prompt 3 (session reused)
 *   npx tsx run-experiment.ts --condition control --dry-run    # show context + prompts, no CLI calls
 *   npx tsx run-experiment.ts --condition control --model claude-sonnet-4-5
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const EXPR_DIR   = path.resolve(__dirname, ".."); // experiments/

// ---------------------------------------------------------------------------
// Context file lists — only these files are loaded into the session
// ---------------------------------------------------------------------------
const CONTEXT_FILES: Record<string, string[]> = {
  naive: [
    "REALWORLD_API_SPEC.md",
    "naive/README.md",
  ],
  control: [
    "REALWORLD_API_SPEC.md",
    "control/README.md",
  ],
  treatment: [
    "REALWORLD_API_SPEC.md",
    "treatment/README.md",
    "treatment/CLAUDE.md",
    "treatment/Status.md",
    "treatment/prisma/schema.prisma",
    "treatment/docs/adrs/001-stack.md",
    "treatment/docs/adrs/002-auth.md",
    "treatment/docs/adrs/003-layers.md",
    "treatment/docs/adrs/004-errors.md",
    "treatment/docs/diagrams/c4-context.md",
    "treatment/docs/diagrams/c4-container.md",
    "treatment/docs/diagrams/domain-model.md",
    "treatment/docs/diagrams/sequences.md",
    "treatment/docs/use-cases.md",
    "treatment/docs/test-architecture.md",
    "treatment/docs/nfr.md",
    "treatment/docs/TechSpec.md",
  ],
  "treatment-v2": [
    "REALWORLD_API_SPEC.md",
    "treatment-v2/README.md",
    "treatment-v2/CLAUDE.md",
    "treatment-v2/Status.md",
    "treatment-v2/prisma/schema.prisma",
    "treatment-v2/docs/adrs/001-stack.md",
    "treatment-v2/docs/adrs/002-auth.md",
    "treatment-v2/docs/adrs/003-layers.md",
    "treatment-v2/docs/adrs/004-errors.md",
    "treatment-v2/docs/diagrams/c4-context.md",
    "treatment-v2/docs/diagrams/c4-container.md",
    "treatment-v2/docs/diagrams/domain-model.md",
    "treatment-v2/docs/diagrams/sequences.md",
    "treatment-v2/docs/use-cases.md",
    "treatment-v2/docs/test-architecture.md",
    "treatment-v2/docs/nfr.md",
    "treatment-v2/docs/TechSpec.md",
  ],
  "treatment-v3": [
    "REALWORLD_API_SPEC.md",
    "treatment-v3/README.md",
    "treatment-v3/CLAUDE.md",
    "treatment-v3/Status.md",
    "treatment-v3/prisma/schema.prisma",
    "treatment-v3/docs/adrs/001-stack.md",
    "treatment-v3/docs/adrs/002-auth.md",
    "treatment-v3/docs/adrs/003-layers.md",
    "treatment-v3/docs/adrs/004-errors.md",
    "treatment-v3/docs/diagrams/c4-context.md",
    "treatment-v3/docs/diagrams/c4-container.md",
    "treatment-v3/docs/diagrams/domain-model.md",
    "treatment-v3/docs/diagrams/sequences.md",
    "treatment-v3/docs/use-cases.md",
    "treatment-v3/docs/test-architecture.md",
    "treatment-v3/docs/nfr.md",
    "treatment-v3/docs/TechSpec.md",
  ],
  // treatment-v4 = treatment-v3 + verify loop (same context artifacts, runner adds tsc+jest feedback)
  "treatment-v4": [
    "REALWORLD_API_SPEC.md",
    "treatment-v3/README.md",
    "treatment-v3/CLAUDE.md",
    "treatment-v3/Status.md",
    "treatment-v3/prisma/schema.prisma",
    "treatment-v3/docs/adrs/001-stack.md",
    "treatment-v3/docs/adrs/002-auth.md",
    "treatment-v3/docs/adrs/003-layers.md",
    "treatment-v3/docs/adrs/004-errors.md",
    "treatment-v3/docs/diagrams/c4-context.md",
    "treatment-v3/docs/diagrams/c4-container.md",
    "treatment-v3/docs/diagrams/domain-model.md",
    "treatment-v3/docs/diagrams/sequences.md",
    "treatment-v3/docs/use-cases.md",
    "treatment-v3/docs/test-architecture.md",
    "treatment-v3/docs/nfr.md",
    "treatment-v3/docs/TechSpec.md",
  ],
  // treatment-v5 = treatment-v3 context + v5 CLAUDE.md (§6+§7 Verification Protocol, Known Type Pitfalls)
  //              + verify loop + dedicated infrastructure prompt (P0)
  "treatment-v5": [
    "REALWORLD_API_SPEC.md",
    "treatment-v5/CLAUDE.md",
    "treatment-v3/Status.md",
    "treatment-v3/prisma/schema.prisma",
    "treatment-v3/docs/adrs/001-stack.md",
    "treatment-v3/docs/adrs/002-auth.md",
    "treatment-v3/docs/adrs/003-layers.md",
    "treatment-v3/docs/adrs/004-errors.md",
    "treatment-v3/docs/diagrams/c4-context.md",
    "treatment-v3/docs/diagrams/c4-container.md",
    "treatment-v3/docs/diagrams/domain-model.md",
    "treatment-v3/docs/diagrams/sequences.md",
    "treatment-v3/docs/use-cases.md",
    "treatment-v3/docs/test-architecture.md",
    "treatment-v3/docs/nfr.md",
    "treatment-v3/docs/TechSpec.md",
  ],
};

// System prompt — deliberately generic, no GS/architecture framing
const SYSTEM_PROMPT =
  "You are an expert TypeScript developer. " +
  "When implementing the tasks given to you, write complete, working code. " +
  "Output every file you create or modify inside a fenced code block " +
  "annotated with the file path on the first line, like:\n\n" +
  "```typescript\n// src/foo/bar.ts\n<code here>\n```\n\n" +
  "Do not summarise what you are going to do. Just do it.";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
// Conditions where the verify loop (tsc + jest feedback) runs automatically after P6
const VERIFY_LOOP_CONDITIONS = new Set(["treatment-v4", "treatment-v5"]);

// DB URLs for verify-loop jest runs — must match docker-compose.yml ports
const DB_URLS: Record<string, string> = {
  control:          "postgresql://conduit:conduit@localhost:5433/conduit_control",
  treatment:        "postgresql://conduit:conduit@localhost:5435/conduit_treatment",
  naive:            "postgresql://conduit:conduit@localhost:5437/conduit_naive",
  "treatment-v2":   "postgresql://conduit:conduit@localhost:5439/conduit_treatment_v2",
  "treatment-v3":   "postgresql://conduit:conduit@localhost:5441/conduit_treatment_v3",
  "treatment-v4":   "postgresql://conduit:conduit@localhost:5443/conduit_treatment_v4",
  "treatment-v5":   "postgresql://conduit:conduit@localhost:5445/conduit_treatment_v5",
};

function parseArgs(): {
  condition: string;
  model: string;
  resume: number;
  dryRun: boolean;
  verifyLoop: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const condition = get("--condition");
  const validConditions = ["naive", "control", "treatment", "treatment-v2", "treatment-v3", "treatment-v4", "treatment-v5"];
  if (!condition || !validConditions.includes(condition)) {
    console.error(`Usage: npx tsx run-experiment.ts --condition ${validConditions.join("|")} [--model MODEL] [--resume N] [--dry-run] [--verify-loop]`);
    process.exit(2);
  }
  return {
    condition,
    model:       get("--model") ?? process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-5",
    resume:      parseInt(get("--resume") ?? "1", 10),
    dryRun:      args.includes("--dry-run"),
    verifyLoop:  args.includes("--verify-loop") || VERIFY_LOOP_CONDITIONS.has(condition),
  };
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------
function readFile(relativePath: string): string {
  const abs = path.resolve(EXPR_DIR, relativePath);
  if (!fs.existsSync(abs)) {
    console.warn(`  [WARN] context file not found, skipping: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(abs, "utf-8");
}

function loadContextBlock(condition: string): string {
  const files = CONTEXT_FILES[condition] ?? [];
  const parts: string[] = [
    "# Initial Context\n",
    "The following files are provided as your starting context for this session.\n",
  ];
  for (const rel of files) {
    const content = readFile(rel);
    if (!content) continue;
    parts.push(`\n---\n## File: ${rel}\n\n${content}`);
  }
  return parts.join("\n");
}

function loadPrompts(condition: string): Array<{ name: string; content: string }> {
  const promptsDir = path.resolve(EXPR_DIR, condition, "prompts");
  if (!fs.existsSync(promptsDir)) {
    console.error(`Prompts directory not found: ${promptsDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(promptsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files.map((f) => ({
    name:    f.replace(".md", ""),
    content: fs.readFileSync(path.join(promptsDir, f), "utf-8"),
  }));
}

function ensureOutputDir(condition: string): string {
  const dir = path.resolve(EXPR_DIR, condition, "output");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeResponse(outputDir: string, promptName: string, content: string): void {
  const filePath = path.join(outputDir, `${promptName}-response.md`);
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`  → saved ${path.relative(EXPR_DIR, filePath)}`);
}

function writeSessionLog(
  outputDir: string,
  condition: string,
  model: string,
  sessionId: string,
  turns: Array<{ promptName: string; promptContent: string; response: string; durationMs: number }>,
): void {
  const log = {
    condition,
    model,
    sessionId,
    timestamp:  new Date().toISOString(),
    turnCount:  turns.length,
    turns,
  };
  const filePath = path.join(outputDir, "session.log.json");
  fs.writeFileSync(filePath, JSON.stringify(log, null, 2), "utf-8");
  console.log(`\n  → session log saved to ${path.relative(EXPR_DIR, filePath)}`);
}

function loadSessionId(outputDir: string): string | undefined {
  const logPath = path.join(outputDir, "session.log.json");
  if (!fs.existsSync(logPath)) return undefined;
  try {
    const log = JSON.parse(fs.readFileSync(logPath, "utf-8")) as { sessionId?: string };
    return log.sessionId;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Claude CLI wrapper
// ---------------------------------------------------------------------------
interface ClaudeJsonOutput {
  type?: string;
  result?: string;
  session_id: string;
  is_error?: boolean;
  cost_usd?: number;
}

/**
 * Calls the `claude` CLI with `--print --output-format json`.
 * Pass `sessionId` to continue an existing conversation via `--resume`.
 * The system prompt is only set on the initial call (no sessionId).
 */
function callClaude(
  input: string,
  options: { model: string; sessionId?: string; systemPrompt?: string },
): { text: string; sessionId: string } {
  const args: string[] = [
    "--print",
    "--output-format", "json",
    "--model",         options.model,
    "--tools",         "",            // disable all built-in tools (Bash, Read, Write, etc.)
    "--strict-mcp-config",            // ignore ALL registered MCP servers (e.g. forgecraft-mcp) — pure text only
  ];

  if (!options.sessionId && options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  const result = spawnSync("claude", args, {
    input,
    encoding:  "utf-8",
    maxBuffer: 100 * 1024 * 1024, // 100 MB
    timeout:   600_000,            // 10 minutes per prompt
    shell:     true,               // required on Windows to resolve claude.cmd
  });

  if (result.error) {
    throw new Error(`claude CLI spawn error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `claude CLI exited with status ${result.status}` +
      `\nstderr: ${result.stderr}` +
      `\nstdout: ${result.stdout.slice(0, 2000)}`,
    );
  }

  let parsed: ClaudeJsonOutput;
  try {
    parsed = JSON.parse(result.stdout.trim()) as ClaudeJsonOutput;
  } catch {
    throw new Error(`Failed to parse claude JSON output: ${result.stdout.slice(0, 500)}`);
  }

  if (parsed.is_error) {
    throw new Error(`claude returned is_error=true: ${result.stdout}`);
  }

  return {
    text:      parsed.result ?? "",
    sessionId: parsed.session_id,
  };
}

// ---------------------------------------------------------------------------
// Verify loop — post-generation compile + test feedback gate
// ---------------------------------------------------------------------------

/**
 * Runs materialize → tsc → jest in the generated project directory.
 * Feeds compilation/test errors back into the open Claude session up to
 * `maxPasses` times until both checks are clean or passes are exhausted.
 *
 * @returns the (possibly updated) sessionId
 */
function runVerifyLoop(
  condition: string,
  outputDir: string,
  sessionIdIn: string,
  model: string,
  turns: Array<{ promptName: string; promptContent: string; response: string; durationMs: number }>,
  maxPasses = 5,
): string {
  const projectDir = path.resolve(EXPR_DIR, condition, "output", "project");
  const dbUrl      = DB_URLS[condition];
  const testEnv    = {
    DATABASE_URL: dbUrl ?? "",
    JWT_SECRET:   "experiment-verify-loop-secret",
    NODE_ENV:     "test",
    LOG_LEVEL:    "silent",
  };
  let sessionId = sessionIdIn;

  const exec = (
    cmd: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
  ): { stdout: string; stderr: string; ok: boolean } => {
    const result = spawnSync(cmd, args, {
      encoding:  "utf-8",
      cwd,
      timeout:   180_000,
      shell:     true,
      env:       { ...process.env, ...env },
    });
    return {
      stdout:  result.stdout ?? "",
      stderr:  result.stderr ?? "",
      ok:      (result.status ?? 1) === 0,
    };
  };

  for (let pass = 1; pass <= maxPasses; pass++) {
    console.log(`\n── Verify loop pass ${pass}/${maxPasses} ──`);

    // 1. Materialize current session responses to disk
    console.log("  → materializing...");
    exec("npx", ["tsx", path.resolve(__dirname, "materialize.ts"), "--condition", condition], __dirname);

    // 2. npm install
    console.log("  → npm install...");
    exec("npm", ["install", "--ignore-scripts"], projectDir);

    // 3. prisma generate + db push (needed for compiled types and test DB)
    // Note: using db push instead of migrate deploy because the model typically
    // generates schema.prisma without migration files — migrate deploy would
    // silently succeed with no-op and leave the DB empty.
    if (dbUrl) {
      console.log("  → prisma generate + db push...");
      exec("npx", ["prisma", "generate"], projectDir, testEnv);
      exec("npx", ["prisma", "db", "push", "--accept-data-loss", "--skip-generate"], projectDir, testEnv);
    }

    // 4. tsc --noEmit
    console.log("  → tsc --noEmit...");
    const tsc     = exec("npx", ["tsc", "--noEmit"], projectDir);
    const tscOut  = (tsc.stdout + "\n" + tsc.stderr).trim();

    // 5. jest (integration tests need the live DB)
    console.log("  → jest --runInBand --no-coverage...");
    const jest    = exec("npx", ["jest", "--runInBand", "--no-coverage", "--forceExit"], projectDir, testEnv);
    // Trim jest output: keep up to 200 lines to avoid overflowing the context window
    const jestLines = (jest.stdout + "\n" + jest.stderr).trim().split("\n");
    const jestOut = jestLines.slice(0, 200).join("\n");

    if (tsc.ok && jest.ok) {
      console.log(`  ✅ Pass ${pass}: tsc + jest both clean — verify loop done.`);
      return sessionId;
    }

    const problems = [!tsc.ok && "tsc errors", !jest.ok && "jest failures"].filter(Boolean).join(" + ");
    console.log(`  ✗ Pass ${pass}: ${problems}`);

    if (pass === maxPasses) {
      console.warn(`  ⚠️  Verify loop exhausted ${maxPasses} passes — stopping.`);
      break;
    }

    // 6. Build fix prompt:
    //    - Include current on-disk content of every file mentioned in tsc errors
    //      so the model can see the full state it needs to make consistent fixes.
    //    - Error messages alone cause interface-drift: the model fixes one side
    //      of a call boundary without seeing the other side's current definition.
    const fixParts: string[] = [
      "The code has been extracted and compiled. Fix ALL errors below.",
      "Emit only complete corrected files — do not summarise.",
      "IMPORTANT: the 'Current file contents' section below shows what is on disk NOW.",
      "Ensure ALL call sites are consistent with the method signatures you emit.\n",
    ];

    // Attach current on-disk content for every file referenced in tsc errors
    if (!tsc.ok) {
      const tscFileRe = /^([^(\n\r]+)\(\d+,\d+\)/gm;
      const errorFiles = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = tscFileRe.exec(tscOut)) !== null) errorFiles.add(m[1]!.trim());

      if (errorFiles.size > 0) {
        fixParts.push("## Current file contents (read-only reference — DO NOT copy verbatim, fix the errors)\n");
        for (const relFile of [...errorFiles].sort()) {
          const absFile = path.resolve(projectDir, relFile);
          if (fs.existsSync(absFile)) {
            const src = fs.readFileSync(absFile, "utf-8");
            fixParts.push(`### ${relFile}\n\`\`\`typescript\n${src}\n\`\`\`\n`);
          }
        }
      }

      fixParts.push("## TypeScript compilation errors (`tsc --noEmit`)\n");
      fixParts.push("```\n" + tscOut + "\n```\n");
    }
    if (!jest.ok) {
      fixParts.push("## Test failures (`jest --runInBand --no-coverage`)\n");
      fixParts.push("```\n" + jestOut + "\n```\n");
    }
    const fixPrompt     = fixParts.join("\n");
    const passNum       = String(6 + pass).padStart(2, "0");
    const fixPromptName = `${passNum}-fix-pass-${pass}`;

    console.log(`\n── Fix prompt: ${fixPromptName} ──`);
    const t0  = Date.now();
    const out = callClaude(fixPrompt, { model, sessionId });
    const elapsed = Date.now() - t0;

    sessionId = out.sessionId;
    turns.push({ promptName: fixPromptName, promptContent: fixPrompt, response: out.text, durationMs: elapsed });
    writeResponse(outputDir, fixPromptName, out.text);
    console.log(`   → done in ${(elapsed / 1000).toFixed(1)}s`);
  }

  return sessionId;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { condition, model, resume, dryRun, verifyLoop } = parseArgs();

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  GS Experiment Runner  (claude CLI)`);
  console.log(`  Condition : ${condition}`);
  console.log(`  Model     : ${model}`);
  console.log(`  Resume at : prompt ${resume}`);
  console.log(`  Dry run   : ${dryRun}`);
  console.log(`════════════════════════════════════════════════════\n`);

  const outputDir = ensureOutputDir(condition);
  const prompts   = loadPrompts(condition);
  const context   = loadContextBlock(condition);

  if (dryRun) {
    console.log("=== SYSTEM PROMPT ===\n");
    console.log(SYSTEM_PROMPT);
    console.log("\n=== INITIAL CONTEXT (first user message) ===\n");
    console.log(context.slice(0, 3000), "...[truncated for dry run]");
    console.log(`\n=== PROMPTS (${prompts.length} total) ===\n`);
    for (const p of prompts) console.log(`  ${p.name}: ${p.content.split("\n")[0]}`);
    return;
  }

  const turns: Array<{ promptName: string; promptContent: string; response: string; durationMs: number }> = [];
  let sessionId: string | undefined;
  let startIndex = resume - 1;

  if (resume > 1) {
    // Reload existing session — the claude CLI keeps conversation history server-side
    sessionId = loadSessionId(outputDir);
    if (!sessionId) {
      console.error(`Cannot resume: no session.log.json found in ${outputDir}`);
      process.exit(1);
    }
    console.log(`Resuming session ${sessionId} from prompt ${resume}: ${prompts[startIndex]?.name ?? "end"}\n`);
  } else {
    // Start a new session: send context as first message
    console.log("Sending initial context to model...");
    const t0 = Date.now();
    const ack = callClaude(context, { model, systemPrompt: SYSTEM_PROMPT });
    const elapsed = Date.now() - t0;
    sessionId = ack.sessionId;
    console.log(`  Context acknowledged in ${(elapsed / 1000).toFixed(1)}s  (session: ${sessionId})\n`);
    turns.push({ promptName: "00-context", promptContent: context, response: ack.text, durationMs: elapsed });
  }

  // Issue each prompt in sequence, continuing the session
  for (let i = startIndex; i < prompts.length; i++) {
    const prompt = prompts[i]!;
    console.log(`\n── Prompt ${i + 1}/${prompts.length}: ${prompt.name} ──`);
    console.log(`   ${prompt.content.split("\n")[0]}`);

    const t0  = Date.now();
    const out = callClaude(prompt.content, { model, sessionId });
    const elapsed = Date.now() - t0;

    // Session ID should be stable across turns, but update in case it changes
    sessionId = out.sessionId;

    turns.push({ promptName: prompt.name, promptContent: prompt.content, response: out.text, durationMs: elapsed });
    writeResponse(outputDir, prompt.name, out.text);
    console.log(`   → done in ${(elapsed / 1000).toFixed(1)}s`);
  }

  // Verify loop: materialize → tsc → jest → feed errors back → repeat
  if (verifyLoop && sessionId) {
    console.log(`\n════ Verify Loop (tsc + jest feedback) ════`);
    sessionId = runVerifyLoop(condition, outputDir, sessionId, model, turns);
    console.log(`════ Verify Loop complete ════\n`);
  }

  writeSessionLog(outputDir, condition, model, sessionId, turns);
  console.log("\n════ Run complete ════\n");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
