/**
 * session-prompt-sections: Section-level builders for the session prompt.
 *
 * Contains helpers that build individual prompt sections: TDD gate,
 * context retrieval, execution loop, and the context load block.
 * Also contains test-command derivation and server-configuration checks.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveTestCommand as deriveFromHelpers } from "./close-cycle-helpers.js";
import type { ArtifactContext } from "./session-prompt-builders.js";

// ── Test Command ─────────────────────────────────────────────────────

/**
 * Check whether a package.json test script is a placeholder.
 *
 * @param script - The scripts.test value
 * @returns True if the script appears to be a no-op placeholder
 */
export function isPlaceholderTestScript(script: string): boolean {
  const lower = script.toLowerCase();
  return (
    lower.startsWith("echo") ||
    lower.includes("no test") ||
    lower.includes("exit 1")
  );
}

/**
 * Derive the test command for this project from configuration files.
 * Falls back to "npm test" when package.json exists but script is a placeholder.
 *
 * @param projectDir - Absolute project root
 * @returns Test command string, or undefined if no build system is present
 */
export function deriveTestCommand(projectDir: string): string | undefined {
  const result = deriveFromHelpers(projectDir);
  if (result) return result;
  if (existsSync(join(projectDir, "package.json"))) return "npm test";
  if (existsSync(join(projectDir, "Cargo.toml"))) return "cargo test";
  return undefined;
}

/**
 * Check whether a named MCP server is present in .claude/settings.json.
 *
 * @param projectDir - Absolute project root
 * @param serverName - MCP server key to look for
 * @returns True if the server is configured
 */
export function isServerConfigured(projectDir: string, serverName: string): boolean {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    const mcpServers = settings["mcpServers"] as Record<string, unknown> | undefined;
    return mcpServers ? serverName in mcpServers : false;
  } catch {
    return false;
  }
}

// ── Section Builders ─────────────────────────────────────────────────

/**
 * Build the TDD Gate section.
 *
 * @param conventionalType - Conventional commit type for this session
 * @returns Formatted TDD Gate section
 */
export function buildTddGateSection(conventionalType: string): string {
  let section = `### TDD Gate\n\n`;
  section += `Follow strict RED → GREEN → REFACTOR.\n`;
  section += `1. **RED**: Write the failing test first. Run it. Paste the failure output before writing any implementation.\n`;
  section += `2. **GREEN**: Write minimum implementation to pass. Do not proceed until tests pass.\n`;
  section += `3. **REFACTOR**: Clean structure while keeping all tests green.\n\n`;
  section += `Commit sequence required:\n`;
  section += `\`\`\`\ntest(scope): [RED] <describe what the test asserts>\n${conventionalType}(scope): <implement to satisfy the test>\nrefactor(scope): <clean without behavior change>  ← only if needed\n\`\`\`\n\n`;
  return section;
}

/**
 * Build the context load block based on which artifacts are present.
 *
 * @param artifacts - Discovered artifact context
 * @returns Formatted context load instructions
 */
export function buildContextLoadBlock(artifacts: ArtifactContext): string {
  const lines: string[] = [];

  if (artifacts.constitutionPath) {
    lines.push(`1. \`${artifacts.constitutionPath}\` — the operative grammar (read first, governs all output)`);
  } else {
    lines.push(`1. ⚠️  No constitution found — run \`setup_project\` before this session`);
  }

  if (artifacts.statusExists) {
    lines.push(`2. \`Status.md\` — current implementation state and last-known next steps`);
  } else {
    lines.push(`2. ⚠️  Status.md missing — create it to maintain session continuity`);
  }

  if (artifacts.adrDir && artifacts.adrCount > 0) {
    lines.push(`3. \`${artifacts.adrDir}/\` — ${artifacts.adrCount} ADR(s) recording intentional decisions`);
  } else {
    lines.push(`3. ⚠️  No ADRs found — the AI may treat intentional choices as defects to fix`);
  }

  if (artifacts.diagramsExist) {
    lines.push(`4. \`docs/diagrams/\` — architecture diagrams (C4 context and/or container)`);
  }

  if (artifacts.useCasesExist) {
    lines.push(`5. \`docs/use-cases.md\` — behavioral contracts (implementation + test + doc seed)`);
  }

  if (artifacts.activeGateCount > 0) {
    const num = lines.length + 1;
    lines.push(`${num}. \`.forgecraft/gates/project/active/\` — ${artifacts.activeGateCount} active quality gate(s) — check with \`close_cycle\` at end of each cycle`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Build the Context Retrieval Strategy section.
 *
 * @param projectDir - Absolute project root
 * @returns Formatted Context Retrieval Strategy section
 */
export function buildContextRetrievalSection(projectDir: string): string {
  let section = `## Context Retrieval Strategy\n\n`;

  if (isServerConfigured(projectDir, "codeseeker")) {
    section += `- Use \`codeseeker_search\` for conceptual searches ("find code that handles X", "where is auth logic")\n`;
    section += `- Use \`codeseeker_duplicates\` before writing any new utility — check for existing implementations first\n`;
    section += `- Reserve \`grep\`/\`glob\` for exact string/pattern matches only\n\n`;
  }

  section += `- Read files on demand from the wayfinding paths above — do not preload all docs\n`;
  section += `- When uncertain what a module does: read its index.ts or __init__.py first, not all source files\n`;
  section += `- ADRs explain WHY decisions were made — read only when making a related architectural change\n\n`;

  return section;
}

/**
 * Build the Execution Loop section with the derived test command.
 *
 * @param testCommand - The test command to embed, or undefined when not yet configured
 * @returns Formatted Execution Loop section
 */
export function buildExecutionLoopSection(testCommand: string | undefined): string {
  const commandLine = testCommand
    ? `**Test command for this project:** \`${testCommand}\``
    : `**Test command**: Not configured yet — add package.json/pyproject.toml first`;
  return (
    `## Execution Loop\n\n` +
    `Every implementation unit follows this loop. Do not exit until all tests are green.\n\n` +
    `1. **Write the failing test first** (RED) — run it, confirm it fails for the right reason\n` +
    `2. **Write minimum implementation** (GREEN) — run tests, if any fail go back to step 2\n` +
    `3. **Refactor** (CLEAN) — run tests again, confirm still green\n` +
    `4. **Commit** — only when all tests pass\n\n` +
    `${commandLine}\n\n` +
    `If tests fail after implementation: fix and re-run immediately. Do not move to the next\n` +
    `unit, do not update Status.md, do not ask the user for direction — loop until green.\n\n` +
    `If you are blocked for more than 2 iterations on the same failure: surface the exact\n` +
    `error with your interpretation and ask once.\n\n`
  );
}
