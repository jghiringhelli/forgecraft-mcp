/**
 * session-prompt-builders: Core prompt assembly and artifact helpers.
 *
 * Contains types, the main buildPrompt function, MCP tools section,
 * artifact discovery, and related helpers for generate_session_prompt.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { resolveTemplatesDir } from "../registry/loader.js";
import type { ToolAmbiguity } from "../shared/types.js";
import {
  buildContextLoadBlock,
  buildTddGateSection,
  buildContextRetrievalSection,
  buildExecutionLoopSection,
  deriveTestCommand,
} from "./session-prompt-sections.js";

// ── Types ────────────────────────────────────────────────────────────

/** Entry shape from mcp-servers.yaml. */
export interface McpServerYamlEntry {
  readonly name: string;
  readonly description: string;
}

/** Parsed structure of mcp-servers.yaml. */
export interface McpServersYaml {
  readonly servers?: McpServerYamlEntry[];
}

export interface ArtifactContext {
  readonly constitutionPath: string | null;
  readonly statusExists: boolean;
  readonly adrCount: number;
  readonly adrDir: string | null;
  readonly diagramsExist: boolean;
  readonly useCasesExist: boolean;
  readonly activeGateCount: number;
}

export interface PromptBuildInput {
  readonly projectDir: string;
  readonly itemDescription: string;
  readonly sessionType: string;
  readonly scopeNote: string | undefined;
  readonly acceptanceCriteria: readonly string[];
  readonly artifacts: ArtifactContext;
  readonly statusSummary: string;
}

// ── Constants ────────────────────────────────────────────────────────

/** Primary-use text shown for the forgecraft server entry. */
export const FORGECRAFT_PRIMARY_USE =
  "check_cascade, generate_session_prompt, audit";

const CONSTITUTION_PATHS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".cursor/rules",
  ".windsurfrules",
  ".clinerules",
] as const;

const ADR_DIRS = ["docs/adrs", "docs/adr"] as const;

// ── MCP Tools Section ────────────────────────────────────────────────

/**
 * Load MCP server descriptions from templates/universal/mcp-servers.yaml.
 *
 * @returns Map of server name → description entry
 */
export function loadMcpServerDescriptions(): Map<string, McpServerYamlEntry> {
  const map = new Map<string, McpServerYamlEntry>();
  try {
    const templatesDir = resolveTemplatesDir();
    const yamlPath = join(templatesDir, "universal", "mcp-servers.yaml");
    if (!existsSync(yamlPath)) return map;
    const parsed = yaml.load(readFileSync(yamlPath, "utf-8")) as McpServersYaml;
    for (const server of parsed.servers ?? []) map.set(server.name, server);
  } catch {
    /* Return empty map */
  }
  return map;
}

/**
 * Build the Active MCP Tools section.
 *
 * @param projectDir - Absolute project root
 * @returns Formatted Active MCP Tools section
 */
export function buildMcpToolsSection(projectDir: string): string {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return `## Active MCP Tools\n\nRun \`configure_mcp\` to enable MCP tool recommendations.\n\n`;
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
    return `## Active MCP Tools\n\nRun \`configure_mcp\` to enable MCP tool recommendations.\n\n`;
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
    `## Active MCP Tools\n\nThese tools are available in this session. Use them:\n` +
    lines.join("\n") +
    "\n\n"
  );
}

// ── Artifact Discovery ───────────────────────────────────────────────

/**
 * Discover which GS artifact files exist in the project directory.
 *
 * @param projectDir - Absolute project root
 * @returns Artifact context for prompt generation
 */
export function discoverArtifacts(projectDir: string): ArtifactContext {
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
 *
 * @param projectDir - Absolute project root
 * @returns Status summary string or empty string
 */
export function readStatusSummary(projectDir: string): string {
  const statusPath = join(projectDir, "Status.md");
  if (!existsSync(statusPath)) return "";
  const content = readFileSync(statusPath, "utf-8");
  return content.length > 800 ? `(truncated)\n${content.slice(-800)}` : content;
}

/**
 * Build a default acceptance criteria list from the item description.
 *
 * @param itemDescription - The item description provided by the caller
 * @returns Default criteria list with placeholders
 */
export function buildDefaultCriteria(itemDescription: string): string[] {
  return [
    `All tests for the feature pass: ${itemDescription.slice(0, 60).trim()}...`,
    "No existing tests regressed (full suite green)",
    "Coverage thresholds maintained (80% lines min)",
    "No layer boundary violations introduced",
    "Status.md updated with the completed change",
  ];
}

/**
 * Build a ToolAmbiguity for a vague roadmap_item description.
 *
 * @param itemDescription - The roadmap item description from the caller
 * @returns A ToolAmbiguity if the description is short, otherwise null
 */
export function buildRoadmapItemAmbiguity(
  itemDescription: string,
): ToolAmbiguity | null {
  if (itemDescription.length >= 30) return null;
  return {
    field: "roadmap_item",
    understood_as: `Interpreting '${itemDescription}' as its most common literal meaning`,
    understood_example: `I scoped the session prompt to: ${itemDescription} (minimal implementation)`,
    alternatives: [
      {
        label: "If broader scope intended",
        action: `Include related concerns: error handling, integration tests, ADR for architectural decisions`,
      },
    ],
    resolution_hint: `Pass a more specific item_description, e.g. 'Add JWT authentication with email/password login, bcrypt hashing, and a /auth/refresh endpoint'`,
  };
}

// ── Prompt Builder ───────────────────────────────────────────────────

/**
 * Assemble the bound session prompt from all collected inputs.
 *
 * @param input - All prompt-building inputs
 * @returns Complete, ready-to-paste session prompt
 */
export function buildPrompt(input: PromptBuildInput): string {
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

  let prompt = `# Session Prompt — Bound\n\n> Generated by ForgeCraft \`generate_session_prompt\`. Load context, then issue this prompt.\n\n---\n\n`;
  prompt += `## Context Load Order\n\nLoad these artifacts **before** issuing the implementation prompt:\n\n${contextLoadBlock}\n`;

  if (statusSummary) {
    prompt += statusSummary + "\n\n";
  }

  prompt += `---\n\n## Implementation Prompt\n\n*(Paste everything below this line to the AI assistant)*\n\n---\n\n`;
  prompt += `### Task\n\n${itemDescription}\n\n`;
  if (scopeBlock) prompt += scopeBlock + "\n";

  prompt += buildTddGateSection(conventionalType);
  prompt += buildMcpToolsSection(projectDir);
  prompt += buildContextRetrievalSection(projectDir);
  prompt += buildExecutionLoopSection(deriveTestCommand(projectDir));
  prompt += `> Before \`git commit\`: run \`close_cycle\` to assess gates and check cascade.\n\n`;
  prompt += `### Acceptance Criteria\n\nAll must be satisfied before the session is considered complete:\n\n${criteriaLines}\n\n`;
  prompt += `### Session Close\n\nBefore ending this session:\n1. Run the full test suite — paste the summary output\n2. Update Status.md: what was completed, current state, next steps\n3. If a non-obvious architectural decision was made: write an ADR in ${artifacts.adrDir ?? "docs/adrs/"}\n\n`;
  prompt += `---\n\`files_created\`: []\n\`next_steps\`: ["Run check_cascade to verify cascade is still complete after this session"]\n`;

  return prompt;
}
