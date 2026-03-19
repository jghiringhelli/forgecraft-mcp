/**
 * generate_diagram: Generate a Mermaid C4 context diagram from existing spec artifacts.
 *
 * Reads forgecraft.yaml, docs/PRD.md, docs/use-cases.md to extract project context.
 * Writes docs/diagrams/c4-context.md with a generated C4Context Mermaid diagram.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";

// ── Schema ───────────────────────────────────────────────────────────

export const generateDiagramSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root."),
});

export type GenerateDiagramInput = z.infer<typeof generateDiagramSchema>;

type ToolResult = { content: Array<{ type: "text"; text: string }> };

// ── Domain Types ─────────────────────────────────────────────────────

interface ProjectSpec {
  readonly projectName: string;
  readonly tags: readonly string[];
  readonly actors: readonly string[];
  readonly problemSummary: string;
  readonly usersSummary: string;
}

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate a Mermaid C4 context diagram from existing spec artifacts.
 *
 * @param args - Validated input with project directory
 * @returns MCP-style content array with generated diagram content and path
 */
export async function generateDiagramHandler(args: GenerateDiagramInput): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const spec = extractProjectSpec(projectDir);
  const diagram = buildC4ContextDiagram(spec);

  const outputPath = join(projectDir, "docs", "diagrams", "c4-context.md");
  mkdirSync(join(projectDir, "docs", "diagrams"), { recursive: true });
  writeFileSync(outputPath, diagram, "utf-8");

  return {
    content: [{
      type: "text",
      text: `# Diagram Generated\n\n` +
            `Written to \`docs/diagrams/c4-context.md\`\n\n` +
            `## Content\n\n${diagram}`,
    }],
  };
}

// ── Spec Extraction ───────────────────────────────────────────────────

/**
 * Extract project spec context from forgecraft.yaml, PRD.md, and use-cases.md.
 *
 * @param projectDir - Absolute project root
 * @returns Extracted spec context for diagram generation
 */
function extractProjectSpec(projectDir: string): ProjectSpec {
  const projectName = readProjectName(projectDir);
  const tags = readProjectTags(projectDir);
  const { problemSummary, usersSummary } = readPrdContext(projectDir);
  const actors = readActors(projectDir);

  return { projectName, tags, actors, problemSummary, usersSummary };
}

/**
 * Read the project name from forgecraft.yaml, falling back to the directory name.
 *
 * @param projectDir - Absolute project root
 * @returns Project name string
 */
function readProjectName(projectDir: string): string {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return inferNameFromDir(projectDir);

  try {
    const raw = yaml.load(readFileSync(yamlPath, "utf-8")) as Record<string, unknown>;
    if (typeof raw?.project_name === "string" && raw.project_name.trim()) {
      return raw.project_name.trim();
    }
    if (typeof raw?.name === "string" && raw.name.trim()) {
      return raw.name.trim();
    }
  } catch {
    // YAML parse errors fall through to directory name
  }
  return inferNameFromDir(projectDir);
}

/**
 * Infer a project name from the directory name.
 *
 * @param projectDir - Absolute project root
 * @returns Human-readable project name
 */
function inferNameFromDir(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1] ?? "Project";
  return last.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read project classification tags from forgecraft.yaml.
 *
 * @param projectDir - Absolute project root
 * @returns Array of tag strings
 */
function readProjectTags(projectDir: string): string[] {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return [];

  try {
    const raw = yaml.load(readFileSync(yamlPath, "utf-8")) as Record<string, unknown>;
    const tags = raw?.tags;
    if (Array.isArray(tags)) {
      return tags.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // YAML parse errors return empty
  }
  return [];
}

/**
 * Extract Problem and Users section summaries from docs/PRD.md.
 *
 * @param projectDir - Absolute project root
 * @returns Object with problemSummary and usersSummary strings
 */
function readPrdContext(projectDir: string): { problemSummary: string; usersSummary: string } {
  const prdPath = join(projectDir, "docs", "PRD.md");
  if (!existsSync(prdPath)) return { problemSummary: "", usersSummary: "" };

  const content = readFileSync(prdPath, "utf-8");
  return {
    problemSummary: extractSectionLines(content, "## Problem"),
    usersSummary: extractSectionLines(content, "## Users"),
  };
}

/**
 * Extract non-comment, non-empty lines after a section header until the next header.
 *
 * @param content - Full file content
 * @param header - Section header to find (e.g. "## Problem")
 * @returns First meaningful line or empty string
 */
function extractSectionLines(content: string, header: string): string {
  const lines = content.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === header);
  if (headerIdx === -1) return "";

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("##")) break;
    if (line && !line.startsWith("<!--")) return line;
  }
  return "";
}

/**
 * Extract unique actor names from docs/use-cases.md.
 * Looks for "Actor: <name>" patterns in UC sections.
 *
 * @param projectDir - Absolute project root
 * @returns Deduplicated array of actor names
 */
function readActors(projectDir: string): string[] {
  const useCasePath = join(projectDir, "docs", "use-cases.md");
  if (!existsSync(useCasePath)) return [];

  const content = readFileSync(useCasePath, "utf-8");
  const actors = new Set<string>();
  const actorPattern = /^\*\*Actor\*\*:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = actorPattern.exec(content)) !== null) {
    const actor = match[1]!.trim();
    if (actor && !actor.startsWith("<!--")) {
      actors.add(actor);
    }
  }

  return Array.from(actors);
}

// ── Diagram Builder ───────────────────────────────────────────────────

/**
 * Build a Mermaid C4Context diagram string from extracted spec context.
 *
 * @param spec - Extracted project spec context
 * @returns Full c4-context.md content including Mermaid fenced code block
 */
function buildC4ContextDiagram(spec: ProjectSpec): string {
  const actors = spec.actors.length > 0 ? spec.actors : ["User"];
  const systemDescription = spec.usersSummary || spec.problemSummary || "System under development";

  const lines: string[] = [
    `# System Context Diagram`,
    ``,
    `> Auto-generated by ForgeCraft \`generate_diagram\`. Edit as needed.`,
    ``,
    "```mermaid",
    `C4Context`,
    `  title System Context: ${spec.projectName}`,
  ];

  for (const actor of actors) {
    const actorId = actor.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    lines.push(`  Person(${actorId}, "${actor}", "Primary user of the system")`);
  }

  lines.push(`  System(system, "${spec.projectName}", "${systemDescription}")`);

  for (const externalNode of buildExternalNodes(spec.tags)) {
    lines.push(`  ${externalNode}`);
  }

  for (const actor of actors) {
    const actorId = actor.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    lines.push(`  Rel(${actorId}, system, "Uses")`);
  }

  for (const rel of buildExternalRels(spec.tags)) {
    lines.push(`  ${rel}`);
  }

  lines.push("```", "");

  return lines.join("\n");
}

/**
 * Build external System_Ext nodes based on project tags.
 * API/WEB3/DATA-PIPELINE tags imply external dependencies.
 *
 * @param tags - Project classification tags
 * @returns Array of Mermaid System_Ext node declarations
 */
function buildExternalNodes(tags: readonly string[]): string[] {
  const nodes: string[] = [];
  if (tags.includes("API")) {
    nodes.push(`System_Ext(api_clients, "API Clients", "External consumers of the API")`);
  }
  if (tags.includes("WEB3")) {
    nodes.push(`System_Ext(blockchain, "Blockchain Network", "Distributed ledger for transactions")`);
  }
  if (tags.includes("DATA-PIPELINE")) {
    nodes.push(`System_Ext(data_sources, "Data Sources", "Upstream data producers")`);
    nodes.push(`System_Ext(data_sinks, "Data Sinks", "Downstream data consumers")`);
  }
  return nodes;
}

/**
 * Build Rel entries for external system nodes based on project tags.
 *
 * @param tags - Project classification tags
 * @returns Array of Mermaid Rel declarations for external systems
 */
function buildExternalRels(tags: readonly string[]): string[] {
  const rels: string[] = [];
  if (tags.includes("API")) {
    rels.push(`Rel(api_clients, system, "Calls")`);
  }
  if (tags.includes("WEB3")) {
    rels.push(`Rel(system, blockchain, "Reads/writes")`);
  }
  if (tags.includes("DATA-PIPELINE")) {
    rels.push(`Rel(data_sources, system, "Feeds")`);
    rels.push(`Rel(system, data_sinks, "Delivers to")`);
  }
  return rels;
}
