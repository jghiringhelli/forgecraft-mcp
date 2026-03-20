/**
 * generate_session_prompt tool handler.
 *
 * Produces a bound, self-contained session prompt for a single roadmap item.
 * Reads the project's artifact set (constitution, Status.md, ADRs) and embeds
 * the relevant references, scope, acceptance criteria, and TDD gate into one
 * ready-to-paste prompt.
 *
 * A roadmap item without a bound prompt is a task title — it forces the
 * practitioner to reconstruct context at execution time, reintroducing the
 * memory cost GS is designed to eliminate. A bound prompt is an independent
 * execution unit. (GS White Paper §6.3)
 */

import { z } from "zod";
import { resolve, join } from "node:path";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import yaml from "js-yaml";
import {
  runCascadeChecks,
  isCascadeComplete,
  buildGuidedRemediation,
  loadCascadeDecisions,
} from "./check-cascade.js";
import { findNextRoadmapItem } from "./close-cycle.js";
import { resolveTemplatesDir } from "../registry/loader.js";
import type { ToolResult, ToolAmbiguity } from "../shared/types.js";
import { detectSpecRoadmapDrift } from "../shared/drift-detector.js";

// ── Schema ───────────────────────────────────────────────────────────

export const generateSessionPromptSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  item_description: z
    .string()
    .min(10)
    .optional()
    .describe(
      "What this session should build or fix. One sentence, precision over brevity: " +
        "actor, behavior, and postcondition. Example: 'Add a paginated GET /users endpoint " +
        "that returns UserResponse DTOs sorted by creation date.' " +
        "If omitted and docs/roadmap.md exists, the next pending roadmap item is auto-selected.",
    ),
  roadmap_item_id: z
    .string()
    .optional()
    .describe(
      "Optional roadmap item ID to generate the prompt for (e.g. 'RM-001'). " +
        "When provided, reads the item from docs/roadmap.md. " +
        "Takes precedence over auto-selection but not over item_description.",
    ),
  acceptance_criteria: z
    .array(z.string())
    .optional()
    .describe(
      "Checkable acceptance criteria for this item. Each criterion should be " +
        "independently verifiable. If omitted, the tool generates a placeholder list.",
    ),
  scope_note: z
    .string()
    .optional()
    .describe(
      "Explicit out-of-scope statement — what this session should NOT touch. " +
        "Prevents scope creep at execution time.",
    ),
  session_type: z
    .enum(["feature", "fix", "refactor", "test", "docs", "chore"])
    .default("feature")
    .describe(
      "Conventional commit type for the session output. Default: feature.",
    ),
});

export type GenerateSessionPromptInput = z.infer<
  typeof generateSessionPromptSchema
>;

// ── Constants ────────────────────────────────────────────────────────

const CONSTITUTION_PATHS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".cursor/rules",
  ".windsurfrules",
  ".clinerules",
] as const;

const ADR_DIRS = ["docs/adrs", "docs/adr"] as const;

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate a bound session prompt for a single roadmap item.
 *
 * Resolution order for the item:
 * 1. `item_description` provided explicitly → use as-is
 * 2. `roadmap_item_id` provided → look up in docs/roadmap.md
 * 3. Neither provided + roadmap exists → auto-select next pending item
 * 4. Neither provided + no roadmap → return error asking for item_description
 *
 * When item is resolved from roadmap: marks it in-progress, writes bound
 * prompt to docs/session-prompts/<id>.md for persistence.
 *
 * @param args - Validated input matching `generateSessionPromptSchema`
 * @returns MCP-style content array with the prompt text, plus optional ambiguities
 */
export async function generateSessionPromptHandler(
  args: GenerateSessionPromptInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);

  // Cascade gate: cannot generate a session prompt without a complete spec
  const decisions = loadCascadeDecisions(projectDir);
  const cascadeSteps = runCascadeChecks(projectDir, decisions);
  if (!isCascadeComplete(cascadeSteps)) {
    const guidance = buildGuidedRemediation(cascadeSteps);
    return {
      content: [
        {
          type: "text",
          text:
            `## Session Prompt Blocked — Cascade Incomplete\n\n` +
            `A session prompt cannot be generated until the derivation cascade is complete.\n` +
            `The cascade ensures each implementation session is fully derivable from the spec,\n` +
            `eliminating context guessing and specification drift.\n\n` +
            guidance,
        },
      ],
    };
  }

  // Drift check: warn if spec was modified after roadmap was generated
  const driftResult = detectSpecRoadmapDrift(projectDir);

  // ── Resolve roadmap item ─────────────────────────────────────────────
  let resolvedDescription = args.item_description;
  let resolvedItemId: string | undefined;

  if (!resolvedDescription) {
    const roadmapItem = args.roadmap_item_id
      ? findRoadmapItemById(projectDir, args.roadmap_item_id)
      : findNextRoadmapItem(projectDir);

    if (!roadmapItem) {
      const hint = args.roadmap_item_id
        ? `Roadmap item '${args.roadmap_item_id}' not found in docs/roadmap.md.`
        : existsSync(join(projectDir, "docs", "roadmap.md"))
          ? "docs/roadmap.md has no pending items — all roadmap items are complete."
          : "No docs/roadmap.md found. Run generate_roadmap first, or provide item_description.";
      return {
        content: [
          {
            type: "text",
            text:
              `## Session Prompt Blocked — No Item to Generate\n\n${hint}\n\n` +
              `Provide \`item_description\` explicitly or run \`generate_roadmap\` to create a roadmap.`,
          },
        ],
      };
    }

    resolvedDescription = roadmapItem.title;
    resolvedItemId = roadmapItem.id;
    markRoadmapItemInProgress(projectDir, roadmapItem.id);
  }

  const artifacts = discoverArtifacts(projectDir);
  const statusSummary = readStatusSummary(projectDir);
  const criteria =
    args.acceptance_criteria ?? buildDefaultCriteria(resolvedDescription);

  const prompt = buildPrompt({
    projectDir,
    itemDescription: resolvedDescription,
    sessionType: args.session_type,
    scopeNote: args.scope_note,
    acceptanceCriteria: criteria,
    artifacts,
    statusSummary,
  });

  // Persist bound prompt to docs/session-prompts/<id>.md when from roadmap
  if (resolvedItemId) {
    writeSessionPromptFile(projectDir, resolvedItemId, prompt);
  }

  const ambiguities = buildRoadmapItemAmbiguity(resolvedDescription);

  const header = resolvedItemId
    ? `## Session Prompt — ${resolvedItemId}: ${resolvedDescription}\n` +
      `> Persisted to docs/session-prompts/${resolvedItemId}.md\n\n`
    : "";

  const driftBanner = driftResult.driftDetected
    ? `> ${driftResult.message}\n\n`
    : "";

  return {
    content: [{ type: "text", text: driftBanner + header + prompt }],
    ...(ambiguities ? { ambiguities: [ambiguities] } : {}),
  };
}

// ── Roadmap helpers ──────────────────────────────────────────────────

/**
 * Find a specific roadmap item by ID from docs/roadmap.md.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID, e.g. "RM-001"
 * @returns Item id and title, or null if not found
 */
function findRoadmapItemById(
  projectDir: string,
  itemId: string,
): { readonly id: string; readonly title: string } | null {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return null;
  const content = readFileSync(roadmapPath, "utf-8");
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`\\|\\s*(${escapedId})\\s*\\|\\s*([^|]+)\\s*\\|`),
  );
  if (!match) return null;
  return { id: match[1]!.trim(), title: match[2]!.trim() };
}

/**
 * Mark a roadmap item as in-progress in docs/roadmap.md.
 * Replaces the first occurrence of `| <id> | <title> | pending |`
 * with `| <id> | <title> | in-progress |`. Idempotent if already in-progress.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID to mark
 */
function markRoadmapItemInProgress(projectDir: string, itemId: string): void {
  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(roadmapPath)) return;
  const content = readFileSync(roadmapPath, "utf-8");
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const updated = content.replace(
    new RegExp(`(\\|\\s*${escapedId}\\s*\\|[^|]+\\|)\\s*pending\\s*(\\|)`),
    "$1 in-progress $2",
  );
  if (updated !== content) writeFileSync(roadmapPath, updated, "utf-8");
}

/**
 * Write the bound session prompt to docs/session-prompts/<id>.md.
 * Creates the directory if absent. Overwrites any existing stub.
 *
 * @param projectDir - Absolute path to project root
 * @param itemId - Roadmap item ID, used as filename
 * @param promptContent - Full prompt text to persist
 */
function writeSessionPromptFile(
  projectDir: string,
  itemId: string,
  promptContent: string,
): void {
  const dir = join(projectDir, "docs", "session-prompts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${itemId}.md`), promptContent, "utf-8");
}

/**
 * Build a ToolAmbiguity for a vague roadmap_item description.
 * Triggered when `item_description` is fewer than 30 characters, which
 * typically signals a task title rather than a bounded implementation spec.
 *
 * @param itemDescription - The roadmap item description from the caller
 * @returns A ToolAmbiguity if the description is short, otherwise null
 */
function buildRoadmapItemAmbiguity(
  itemDescription: string,
): ToolAmbiguity | null {
  if (itemDescription.length >= 30) return null;

  return {
    field: "roadmap_item",
    understood_as: `Interpreting '${itemDescription}' as its most common literal meaning`,
    understood_example: `I scoped the session prompt to: ${itemDescription} (minimal implementation, no auth variant specified)`,
    alternatives: [
      {
        label: "If broader scope intended",
        action: `I would include related concerns: error handling, integration tests, ADR for any new architectural decisions`,
      },
    ],
    resolution_hint: `Pass a more specific item_description, e.g. 'Add JWT authentication with email/password login, bcrypt hashing, and a /auth/refresh endpoint'`,
  };
}

// ── Artifact Discovery ───────────────────────────────────────────────

interface ArtifactContext {
  readonly constitutionPath: string | null;
  readonly statusExists: boolean;
  readonly adrCount: number;
  readonly adrDir: string | null;
  readonly diagramsExist: boolean;
  readonly useCasesExist: boolean;
  readonly activeGateCount: number;
}

/**
 * Discover which GS artifact files exist in the project directory.
 *
 * @param projectDir - Absolute project root
 * @returns Artifact context for prompt generation
 */
function discoverArtifacts(projectDir: string): ArtifactContext {
  const constitutionPath =
    CONSTITUTION_PATHS.find((p) => existsSync(join(projectDir, p))) ?? null;

  const statusExists = existsSync(join(projectDir, "Status.md"));

  let adrCount = 0;
  let adrDir: string | null = null;
  for (const dir of ADR_DIRS) {
    const fullDir = join(projectDir, dir);
    if (existsSync(fullDir)) {
      const adrs = readdirSync(fullDir).filter((f) => f.endsWith(".md"));
      if (adrs.length > adrCount) {
        adrCount = adrs.length;
        adrDir = dir;
      }
    }
  }

  const diagramsDir = join(projectDir, "docs/diagrams");
  const diagramsExist =
    existsSync(diagramsDir) &&
    readdirSync(diagramsDir).some((f) => /\.(md|mermaid|puml)$/i.test(f));

  const useCasesExist =
    existsSync(join(projectDir, "docs/use-cases.md")) ||
    existsSync(join(projectDir, "docs/UseCases.md"));

  const activeGateDir = join(projectDir, ".forgecraft/gates/project/active");
  const activeGateCount = existsSync(activeGateDir)
    ? readdirSync(activeGateDir).filter((f) => f.endsWith(".yaml")).length
    : 0;

  return {
    constitutionPath,
    statusExists,
    adrCount,
    adrDir,
    diagramsExist,
    useCasesExist,
    activeGateCount,
  };
}

/**
 * Extract the last meaningful section of Status.md for context.
 * Returns the last 800 chars or the full file if shorter.
 *
 * @param projectDir - Absolute project root
 * @returns Status summary string or empty string
 */
function readStatusSummary(projectDir: string): string {
  const statusPath = join(projectDir, "Status.md");
  if (!existsSync(statusPath)) return "";
  const content = readFileSync(statusPath, "utf-8");
  return content.length > 800
    ? `…(truncated)…\n${content.slice(-800)}`
    : content;
}

/**
 * Build a default acceptance criteria list from the item description.
 * Used when the caller does not supply explicit criteria.
 *
 * @param itemDescription - The item description provided by the caller
 * @returns Default criteria list with placeholders
 */
function buildDefaultCriteria(itemDescription: string): string[] {
  return [
    `All tests for the feature pass: ${itemDescription.slice(0, 60).trim()}…`,
    "No existing tests regressed (full suite green)",
    "Coverage thresholds maintained (80% lines min)",
    "No layer boundary violations introduced",
    "Status.md updated with the completed change",
  ];
}

// ── Prompt Builder ───────────────────────────────────────────────────

interface PromptBuildInput {
  readonly projectDir: string;
  readonly itemDescription: string;
  readonly sessionType: string;
  readonly scopeNote: string | undefined;
  readonly acceptanceCriteria: readonly string[];
  readonly artifacts: ArtifactContext;
  readonly statusSummary: string;
}

/**
 * Assemble the bound session prompt from all collected inputs.
 *
 * @param input - All prompt-building inputs
 * @returns Complete, ready-to-paste session prompt
 */
function buildPrompt(input: PromptBuildInput): string {
  const {
    projectDir,
    itemDescription,
    sessionType,
    scopeNote,
    acceptanceCriteria,
    artifacts,
    statusSummary,
  } = input;

  const contextLoadBlock = buildContextLoadBlock(artifacts);
  const scopeBlock = scopeNote
    ? `\n## Out of Scope\nDo NOT touch: ${scopeNote}\n`
    : "";

  const criteriaLines = acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n");
  const conventionalType = sessionType === "fix" ? "fix" : sessionType;

  let prompt = `# Session Prompt — Bound\n\n`;
  prompt += `> Generated by ForgeCraft \`generate_session_prompt\`. Load context, then issue this prompt.\n\n`;
  prompt += `---\n\n`;

  prompt += `## Context Load Order\n\n`;
  prompt += `Load these artifacts **before** issuing the implementation prompt:\n\n`;
  prompt += contextLoadBlock;
  prompt += `\n`;

  if (statusSummary) {
    prompt += `## Current State (from Status.md)\n\n`;
    prompt += `\`\`\`\n${statusSummary}\n\`\`\`\n\n`;
  }

  prompt += `---\n\n`;
  prompt += `## Implementation Prompt\n\n`;
  prompt += `*(Paste everything below this line to the AI assistant)*\n\n`;
  prompt += `---\n\n`;

  prompt += `### Task\n\n`;
  prompt += `${itemDescription}\n\n`;

  if (scopeBlock) prompt += scopeBlock + "\n";

  prompt += buildTddGateSection(conventionalType);
  prompt += buildMcpToolsSection(projectDir);
  prompt += buildContextRetrievalSection(projectDir);
  prompt += buildExecutionLoopSection(deriveTestCommand(projectDir));

  prompt += `> Before \`git commit\`: run \`close_cycle\` to assess gates and check cascade.\n\n`;

  prompt += `### Acceptance Criteria\n\n`;
  prompt += `All must be satisfied before the session is considered complete:\n\n`;
  prompt += criteriaLines + "\n\n";

  prompt += `### Session Close\n\n`;
  prompt += `Before ending this session:\n`;
  prompt += `1. Run the full test suite — paste the summary output\n`;
  prompt += `2. Update Status.md: what was completed, current state, next steps\n`;
  prompt += `3. If a non-obvious architectural decision was made: write an ADR in ${artifacts.adrDir ?? "docs/adrs/"}\n\n`;

  prompt += `---\n`;
  prompt += `\`files_created\`: []\n`;
  prompt += `\`next_steps\`: ["Run check_cascade to verify cascade is still complete after this session"]\n`;

  return prompt;
}

/**
 * Build the context load block based on which artifacts are present.
 *
 * @param artifacts - Discovered artifact context
 * @returns Formatted context load instructions
 */
function buildContextLoadBlock(artifacts: ArtifactContext): string {
  const lines: string[] = [];

  if (artifacts.constitutionPath) {
    lines.push(
      `1. \`${artifacts.constitutionPath}\` — the operative grammar (read first, governs all output)`,
    );
  } else {
    lines.push(
      `1. ⚠️  No constitution found — run \`setup_project\` before this session`,
    );
  }

  if (artifacts.statusExists) {
    lines.push(
      `2. \`Status.md\` — current implementation state and last-known next steps`,
    );
  } else {
    lines.push(
      `2. ⚠️  Status.md missing — create it to maintain session continuity`,
    );
  }

  if (artifacts.adrDir && artifacts.adrCount > 0) {
    lines.push(
      `3. \`${artifacts.adrDir}/\` — ${artifacts.adrCount} ADR(s) recording intentional decisions`,
    );
  } else {
    lines.push(
      `3. ⚠️  No ADRs found — the AI may treat intentional choices as defects to fix`,
    );
  }

  if (artifacts.diagramsExist) {
    lines.push(
      `4. \`docs/diagrams/\` — architecture diagrams (C4 context and/or container)`,
    );
  }

  if (artifacts.useCasesExist) {
    lines.push(
      `5. \`docs/use-cases.md\` — behavioral contracts (implementation + test + doc seed)`,
    );
  }

  if (artifacts.activeGateCount > 0) {
    const num = lines.length + 1;
    lines.push(
      `${num}. \`.forgecraft/gates/project/active/\` — ${artifacts.activeGateCount} active quality gate(s) — check with \`close_cycle\` at end of each cycle`,
    );
  }

  return lines.join("\n") + "\n";
}

// ── Section Builders ─────────────────────────────────────────────────

/**
 * Build the TDD Gate section.
 *
 * @param conventionalType - Conventional commit type for this session
 * @returns Formatted TDD Gate section
 */
function buildTddGateSection(conventionalType: string): string {
  let section = `### TDD Gate\n\n`;
  section += `Follow strict RED → GREEN → REFACTOR.\n`;
  section += `1. **RED**: Write the failing test first. Run it. Paste the failure output before writing any implementation.\n`;
  section += `2. **GREEN**: Write minimum implementation to pass. Do not proceed until tests pass.\n`;
  section += `3. **REFACTOR**: Clean structure while keeping all tests green.\n\n`;
  section += `Commit sequence required:\n`;
  section += `\`\`\`\ntest(scope): [RED] <describe what the test asserts>\n${conventionalType}(scope): <implement to satisfy the test>\nrefactor(scope): <clean without behavior change>  ← only if needed\n\`\`\`\n\n`;
  return section;
}

/** Entry shape from mcp-servers.yaml. */
interface McpServerYamlEntry {
  readonly name: string;
  readonly description: string;
}

/** Parsed structure of mcp-servers.yaml. */
interface McpServersYaml {
  readonly servers?: McpServerYamlEntry[];
}

/**
 * Load MCP server descriptions from templates/universal/mcp-servers.yaml.
 * Returns an empty map if the file cannot be found or parsed.
 *
 * @returns Map of server name → description entry
 */
function loadMcpServerDescriptions(): Map<string, McpServerYamlEntry> {
  const map = new Map<string, McpServerYamlEntry>();
  try {
    const templatesDir = resolveTemplatesDir();
    const yamlPath = join(templatesDir, "universal", "mcp-servers.yaml");
    if (!existsSync(yamlPath)) return map;
    const parsed = yaml.load(readFileSync(yamlPath, "utf-8")) as McpServersYaml;
    for (const server of parsed.servers ?? []) {
      map.set(server.name, server);
    }
  } catch {
    // Return empty map if YAML loading fails
  }
  return map;
}

/** Primary-use text shown for the forgecraft server entry. */
const FORGECRAFT_PRIMARY_USE =
  "check_cascade, generate_session_prompt, audit_project";

/**
 * Build the Active MCP Tools section.
 * Always includes forgecraft; also includes servers found in .claude/settings.json.
 * Falls back to a setup note when settings.json is absent.
 *
 * @param projectDir - Absolute project root
 * @returns Formatted Active MCP Tools section
 */
function buildMcpToolsSection(projectDir: string): string {
  const settingsPath = join(projectDir, ".claude", "settings.json");

  if (!existsSync(settingsPath)) {
    return (
      `## Active MCP Tools\n\n` +
      `Run \`configure_mcp\` to enable MCP tool recommendations.\n\n`
    );
  }

  let configuredNames: string[] = [];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = settings["mcpServers"] as
      | Record<string, unknown>
      | undefined;
    configuredNames = mcpServers ? Object.keys(mcpServers) : [];
  } catch {
    return (
      `## Active MCP Tools\n\n` +
      `Run \`configure_mcp\` to enable MCP tool recommendations.\n\n`
    );
  }

  const descriptions = loadMcpServerDescriptions();
  const allNames = new Set(["forgecraft", ...configuredNames]);
  const lines: string[] = [];

  for (const name of allNames) {
    const primaryUse =
      name === "forgecraft"
        ? FORGECRAFT_PRIMARY_USE
        : (descriptions.get(name)?.description ?? "MCP server");
    lines.push(`- **${name}** — ${primaryUse}`);
  }

  return (
    `## Active MCP Tools\n\n` +
    `These tools are available in this session. Use them:\n` +
    lines.join("\n") +
    "\n\n"
  );
}

/**
 * Check whether a package.json test script is a placeholder rather than a real command.
 *
 * @param script - The scripts.test value
 * @returns True if the script appears to be a no-op placeholder
 */
function isPlaceholderTestScript(script: string): boolean {
  const lower = script.toLowerCase();
  return (
    lower.startsWith("echo") ||
    lower.includes("no test") ||
    lower.includes("exit 1")
  );
}

/**
 * Derive the test command for this project from configuration files.
 * Priority: package.json scripts.test → pyproject.toml → requirements.txt → go.mod → Cargo.toml.
 * Returns undefined when no build-system file exists (command should not be guessed).
 *
 * @param projectDir - Absolute project root
 * @returns Test command string, or undefined if no build system is present
 */
function deriveTestCommand(projectDir: string): string | undefined {
  const packageJsonPath = join(projectDir, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const testScript = pkg.scripts?.["test"];
      if (testScript && !isPlaceholderTestScript(testScript)) {
        return "npm test";
      }
    } catch {
      // Fall through to next check
    }
    return "npm test";
  }

  if (existsSync(join(projectDir, "pyproject.toml"))) {
    return "pytest";
  }

  if (existsSync(join(projectDir, "requirements.txt"))) {
    try {
      const req = readFileSync(join(projectDir, "requirements.txt"), "utf-8");
      if (req.toLowerCase().includes("pytest")) return "pytest";
    } catch {
      // Fall through
    }
  }

  if (existsSync(join(projectDir, "go.mod"))) {
    return "go test ./...";
  }

  if (existsSync(join(projectDir, "Cargo.toml"))) {
    return "cargo test";
  }

  return undefined;
}

/**
 * Check whether a named MCP server is present in .claude/settings.json.
 *
 * @param projectDir - Absolute project root
 * @param serverName - MCP server key to look for
 * @returns True if the server is configured
 */
function isServerConfigured(projectDir: string, serverName: string): boolean {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = settings["mcpServers"] as
      | Record<string, unknown>
      | undefined;
    return mcpServers ? serverName in mcpServers : false;
  } catch {
    return false;
  }
}

/**
 * Build the Context Retrieval Strategy section.
 * Includes codeseeker-specific guidance when codeseeker is configured.
 *
 * @param projectDir - Absolute project root
 * @returns Formatted Context Retrieval Strategy section
 */
function buildContextRetrievalSection(projectDir: string): string {
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
function buildExecutionLoopSection(testCommand: string | undefined): string {
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
