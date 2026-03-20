/**
 * generate_roadmap tool handler.
 *
 * Reads docs/PRD.md + docs/use-cases.md and generates a phased docs/roadmap.md.
 * Each roadmap item maps to one implementation session with a bound session
 * prompt stub path. Gated on cascade completion (same pattern as
 * generate_session_prompt). Idempotent — refuses to overwrite an existing roadmap.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  runCascadeChecks,
  isCascadeComplete,
  buildGuidedRemediation,
  loadCascadeDecisions,
} from "./check-cascade.js";

// ── Schema ───────────────────────────────────────────────────────────

export const generateRoadmapSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
});

export type GenerateRoadmapInput = z.infer<typeof generateRoadmapSchema>;

type ToolResult = { content: Array<{ type: "text"; text: string }> };

// ── Constants ────────────────────────────────────────────────────────

const GENERIC_UC_TITLES = [
  "Implement primary use case",
  "Implement secondary use case",
  "Implement observer use case",
] as const;

const PHASE2_ITEMS = [
  { id: "RM-010", title: "Integration tests: full API contract coverage" },
  { id: "RM-011", title: "Mutation testing: achieve >80% mutation score" },
  { id: "RM-012", title: "Architecture audit: SOLID compliance + layer check" },
] as const;

const PHASE3_ITEMS = [
  {
    id: "RM-020",
    title: "Security audit: dependency vulnerabilities + OWASP scan",
  },
  {
    id: "RM-021",
    title: "Performance baseline: establish load test benchmarks",
  },
  {
    id: "RM-022",
    title: "Documentation: README, API reference, migration guide",
  },
] as const;

// ── UC Parsing ────────────────────────────────────────────────────────

/**
 * Parse use-case titles from docs/use-cases.md.
 * Matches lines like "## UC-001: Title" or "## UC-001 Title".
 * Falls back to generic titles when the file is missing or has no UC headings.
 *
 * @param projectDir - Absolute project root
 * @returns Array of { id, title } pairs
 */
export function parseUseCaseTitles(
  projectDir: string,
): ReadonlyArray<{ readonly id: string; readonly title: string }> {
  const ucPath = join(projectDir, "docs", "use-cases.md");
  if (!existsSync(ucPath)) return buildGenericUcTitles();

  const content = readFileSync(ucPath, "utf-8");
  const results: Array<{ id: string; title: string }> = [];

  for (const line of content.split("\n")) {
    const match = line.match(/^##\s+(UC-\d+)[:\s]+(.+)$/);
    if (match) {
      results.push({ id: match[1]!.trim(), title: match[2]!.trim() });
    }
  }

  return results.length > 0 ? results : buildGenericUcTitles();
}

/**
 * Build the three generic UC fallback items.
 *
 * @returns Generic { id, title } pairs
 */
function buildGenericUcTitles(): ReadonlyArray<{
  readonly id: string;
  readonly title: string;
}> {
  return GENERIC_UC_TITLES.map((title, i) => ({
    id: `UC-${String(i + 1).padStart(3, "0")}`,
    title,
  }));
}

// ── Project Name ──────────────────────────────────────────────────────

/**
 * Read the project name from forgecraft.yaml, the first PRD heading,
 * or fall back to the directory name.
 *
 * @param projectDir - Absolute project root
 * @returns Human-readable project name
 */
export function readProjectName(projectDir: string): string {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const content = readFileSync(yamlPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^(?:project_name|name):\s*(.+)$/);
        if (match?.[1]?.trim()) return match[1].trim();
      }
    } catch {
      // Fall through
    }
  }

  const prdPath = join(projectDir, "docs", "PRD.md");
  if (existsSync(prdPath)) {
    try {
      const firstLine = readFileSync(prdPath, "utf-8").split("\n")[0] ?? "";
      const match = firstLine.match(/^#\s+(.+)$/);
      if (match?.[1]?.trim()) return match[1].trim();
    } catch {
      // Fall through
    }
  }

  return inferNameFromDir(projectDir);
}

/**
 * Infer a human-readable project name from the directory name.
 *
 * @param projectDir - Absolute project root
 * @returns Title-cased project name
 */
function inferNameFromDir(projectDir: string): string {
  const parts = projectDir.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1] ?? "Project";
  return last.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Roadmap Content ────────────────────────────────────────────────────

/**
 * Build the roadmap.md content string.
 *
 * @param projectName - Human-readable project name
 * @param ucItems - Parsed use-case items for Phase 1
 * @param specFilePath - Relative spec file path (for footer)
 * @returns Complete roadmap.md string
 */
export function buildRoadmapContent(
  projectName: string,
  ucItems: ReadonlyArray<{ readonly id: string; readonly title: string }>,
  specFilePath: string,
): string {
  const date = new Date().toISOString().split("T")[0]!;

  const phase1Rows = ucItems
    .map((uc, i) => {
      const rmId = formatRmId(i + 1);
      const title = `Implement ${uc.id}: ${uc.title}`;
      return `| ${rmId} | ${title} | pending | docs/session-prompts/${rmId}.md |`;
    })
    .join("\n");

  const phase2Rows = PHASE2_ITEMS.map(
    (item) =>
      `| ${item.id} | ${item.title} | pending | docs/session-prompts/${item.id}.md |`,
  ).join("\n");

  const phase3Rows = PHASE3_ITEMS.map(
    (item) =>
      `| ${item.id} | ${item.title} | pending | docs/session-prompts/${item.id}.md |`,
  ).join("\n");

  return [
    `# ${projectName} Roadmap`,
    "",
    "> Generated by ForgeCraft. Each item maps to one implementation session.",
    "> Status: pending | in-progress | done",
    "> Run `generate_session_prompt` with the item ID to get the bound prompt.",
    "",
    "---",
    "",
    "## Phase 1: Core Implementation",
    "",
    "| ID | Title | Status | Prompt |",
    "|---|---|---|---|",
    phase1Rows,
    "",
    "## Phase 2: Integration & Quality Hardening",
    "",
    "| ID | Title | Status | Prompt |",
    "|---|---|---|---|",
    phase2Rows,
    "",
    "## Phase 3: Pre-Release Hardening",
    "",
    "| ID | Title | Status | Prompt |",
    "|---|---|---|---|",
    phase3Rows,
    "",
    "---",
    `_Generated: ${date}_`,
    `_Spec: ${specFilePath}_`,
    "",
  ].join("\n");
}

/**
 * Build a session prompt stub for a Phase 1 roadmap item.
 *
 * @param rmId - The RM-00N identifier
 * @param title - The item title
 * @param ucId - The UC identifier (e.g. UC-001)
 * @returns Stub markdown string
 */
export function buildSessionPromptStub(
  rmId: string,
  title: string,
  ucId: string,
): string {
  return [
    `# Session Prompt — ${rmId}: ${title}`,
    `> Run \`generate_session_prompt\` with item_description="${title}" to generate the full bound prompt.`,
    `> Or use this stub as a starting point and fill in the acceptance criteria.`,
    "",
    "## Task",
    title,
    "",
    "## Acceptance Criteria",
    `- [ ] ${ucId} is fully implemented (all paths covered)`,
    "- [ ] All tests pass with >=80% coverage",
    "- [ ] close_cycle reports no blocking gates",
    "",
  ].join("\n");
}

/**
 * Format an RM ID with zero-padded 3-digit suffix.
 *
 * @param index - 1-based item index
 * @returns Formatted RM-00N string
 */
function formatRmId(index: number): string {
  return `RM-${String(index).padStart(3, "0")}`;
}

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate a phased roadmap from PRD.md and use-cases.md.
 * Gated on cascade completion. Idempotent — does not overwrite an existing roadmap.
 *
 * @param args - Validated input with project_dir
 * @returns MCP-style content array with result text
 */
export async function generateRoadmapHandler(
  args: GenerateRoadmapInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);

  const decisions = loadCascadeDecisions(projectDir);
  const cascadeSteps = runCascadeChecks(projectDir, decisions);
  if (!isCascadeComplete(cascadeSteps)) {
    const guidance = buildGuidedRemediation(cascadeSteps);
    return {
      content: [
        {
          type: "text",
          text:
            `## Roadmap Generation Blocked — Cascade Incomplete\n\n` +
            `A roadmap cannot be generated until the derivation cascade is complete.\n` +
            `The cascade ensures the roadmap is fully derivable from the spec.\n\n` +
            guidance,
        },
      ],
    };
  }

  const roadmapPath = join(projectDir, "docs", "roadmap.md");
  if (existsSync(roadmapPath)) {
    return {
      content: [
        {
          type: "text",
          text:
            `## Roadmap Already Exists\n\n` +
            `\`docs/roadmap.md\` already exists. To regenerate, delete it first.\n` +
            `Current path: ${roadmapPath}`,
        },
      ],
    };
  }

  const specFilePath = existsSync(join(projectDir, "docs", "PRD.md"))
    ? "docs/PRD.md"
    : "docs/use-cases.md";

  const projectName = readProjectName(projectDir);
  const ucItems = parseUseCaseTitles(projectDir);

  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(
    roadmapPath,
    buildRoadmapContent(projectName, ucItems, specFilePath),
    "utf-8",
  );

  const stubsDir = join(projectDir, "docs", "session-prompts");
  mkdirSync(stubsDir, { recursive: true });
  const writtenStubs: string[] = [];

  for (let i = 0; i < ucItems.length; i++) {
    const uc = ucItems[i]!;
    const rmId = formatRmId(i + 1);
    const title = `Implement ${uc.id}: ${uc.title}`;
    writeFileSync(
      join(stubsDir, `${rmId}.md`),
      buildSessionPromptStub(rmId, title, uc.id),
      "utf-8",
    );
    writtenStubs.push(`docs/session-prompts/${rmId}.md`);
  }

  const phase1List = ucItems
    .map(
      (uc, i) => `- **${formatRmId(i + 1)}**: Implement ${uc.id}: ${uc.title}`,
    )
    .join("\n");

  return {
    content: [
      {
        type: "text",
        text:
          `## Roadmap Generated\n\n` +
          `Written to \`docs/roadmap.md\` with ${ucItems.length} Phase 1 items.\n\n` +
          `### Phase 1 Items\n${phase1List}\n\n` +
          `### Session Prompt Stubs Written\n` +
          writtenStubs.map((p) => `- \`${p}\``).join("\n") +
          `\n\nRun \`generate_session_prompt\` with an item's description to get the full bound prompt.`,
      },
    ],
  };
}
