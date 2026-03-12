#!/usr/bin/env tsx
/**
 * run-experiment.ts
 *
 * Runs one arm of the GS vs. Plain-AI RealWorld experiment by issuing prompts
 * to the Anthropic API in sequence within a single conversation.
 *
 * The script carries ONLY the condition's specified context files.
 * It has no knowledge of the GS methodology, forgecraft-mcp, or this project.
 *
 * Usage:
 *   npx tsx run-experiment.ts --condition control
 *   npx tsx run-experiment.ts --condition treatment
 *   npx tsx run-experiment.ts --condition control --resume 3   # restart from prompt 3
 *   npx tsx run-experiment.ts --condition control --dry-run    # show context + prompts, no API calls
 *   npx tsx run-experiment.ts --condition control --model claude-opus-4-5
 */

import Anthropic from "@anthropic-ai/sdk";
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
  if (!condition || !["control", "treatment"].includes(condition)) {
    console.error("Usage: npx tsx run-experiment.ts --condition control|treatment [--model MODEL] [--resume N] [--dry-run]");
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
  messages: Anthropic.MessageParam[],
): void {
  const log = {
    condition,
    model,
    timestamp:  new Date().toISOString(),
    messageCount: messages.length,
    messages,
  };
  const filePath = path.join(outputDir, "session.log.json");
  fs.writeFileSync(filePath, JSON.stringify(log, null, 2), "utf-8");
  console.log(`\n  → session log saved to ${path.relative(EXPR_DIR, filePath)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { condition, model, resume, dryRun } = parseArgs();

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey && !dryRun) {
    console.error("ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  GS Experiment Runner`);
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
    for (const p of prompts) console.log(`  ${p.name}: ${p.content.slice(0, 120).replace(/\n/g, " ")}...`);
    return;
  }

  const client = new Anthropic({ apiKey });

  // Build the messages history. If resuming, load existing responses as prior turns.
  const messages: Anthropic.MessageParam[] = [];

  // First user message = full context block
  messages.push({ role: "user", content: context });

  // If resuming, replay existing responses into history so the model has code context
  if (resume > 1) {
    console.log(`Replaying ${resume - 1} prior turns from saved responses...\n`);
    // Seed a minimal assistant ack for the context message
    messages.push({ role: "assistant", content: "[Context loaded. Ready to implement.]" });

    for (let i = 0; i < resume - 1; i++) {
      const prompt = prompts[i];
      if (!prompt) break;
      const savedPath = path.join(outputDir, `${prompt.name}-response.md`);
      if (!fs.existsSync(savedPath)) {
        console.error(`Cannot resume: saved response not found for ${prompt.name}`);
        process.exit(1);
      }
      const savedResponse = fs.readFileSync(savedPath, "utf-8");
      messages.push({ role: "user",      content: prompt.content });
      messages.push({ role: "assistant", content: savedResponse });
    }
    console.log(`Resuming from prompt ${resume}: ${prompts[resume - 1]?.name ?? "end"}\n`);
  } else {
    // First turn: send context, get ack
    console.log("Sending initial context to model...");
    const ack = await client.messages.create({
      model,
      max_tokens: 256,
      system:     SYSTEM_PROMPT,
      messages,
    });
    const ackText = ack.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    messages.push({ role: "assistant", content: ackText });
    console.log(`  Context acknowledged (${ackText.length} chars)\n`);
  }

  // Issue each prompt in sequence
  const startIndex = resume - 1;
  for (let i = startIndex; i < prompts.length; i++) {
    const prompt = prompts[i]!;
    console.log(`\n── Prompt ${i + 1}/${prompts.length}: ${prompt.name} ──`);
    console.log(`   ${prompt.content.split("\n")[0]}`);

    messages.push({ role: "user", content: prompt.content });

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system:     SYSTEM_PROMPT,
      messages,
    });

    const responseText = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    messages.push({ role: "assistant", content: responseText });
    writeResponse(outputDir, prompt.name, responseText);

    console.log(`   tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
    console.log(`   stop:   ${response.stop_reason}`);
  }

  writeSessionLog(outputDir, condition, model, messages);
  console.log("\n════ Run complete ════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
