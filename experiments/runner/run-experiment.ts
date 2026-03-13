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
function parseArgs(): {
  condition: string;
  model: string;
  resume: number;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const condition = get("--condition");
  if (!condition || !["naive", "control", "treatment", "treatment-v2"].includes(condition)) {
    console.error("Usage: npx tsx run-experiment.ts --condition naive|control|treatment|treatment-v2 [--model MODEL] [--resume N] [--dry-run]");
    process.exit(2);
  }
  return {
    condition,
    model:   get("--model") ?? process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-5",
    resume:  parseInt(get("--resume") ?? "1", 10),
    dryRun:  args.includes("--dry-run"),
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
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { condition, model, resume, dryRun } = parseArgs();

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

  writeSessionLog(outputDir, condition, model, sessionId, turns);
  console.log("\n════ Run complete ════\n");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
