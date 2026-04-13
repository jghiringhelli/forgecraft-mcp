/**
 * Roadmap building utilities: content generation, UC parsing, and session stub creation.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveExecutableGates,
  gateFilePath,
  gateToolSummary,
} from "./executable-gates.js";

const GENERIC_UC_TITLES = [
  "Implement primary use case",
  "Implement secondary use case",
  "Implement observer use case",
] as const;

export const EXECUTABLE_SPRINT_HEADER: Readonly<{ id: string; title: string }> =
  {
    id: "EX-000",
    title:
      "Executable: bring up — start server, confirm health endpoint responds",
  } as const;

export const PHASE2_ITEMS = [
  { id: "RM-010", title: "Integration tests: full API contract coverage" },
  { id: "RM-011", title: "Mutation testing: achieve >80% mutation score" },
  { id: "RM-012", title: "Architecture audit: SOLID compliance + layer check" },
] as const;

export const PHASE3_ITEMS = [
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
 * @param tags - Project classification tags (drives Executable Sprint gate selection)
 * @returns Complete roadmap.md string
 */
export function buildRoadmapContent(
  projectName: string,
  ucItems: ReadonlyArray<{ readonly id: string; readonly title: string }>,
  specFilePath: string,
  tags: ReadonlyArray<string> = [],
): string {
  const date = new Date().toISOString().split("T")[0]!;
  const lastPhase1Id = formatRmId(ucItems.length);
  const lastExId = formatExId(ucItems.length);
  const gates = resolveExecutableGates(tags);
  const toolSummary = gateToolSummary(gates);

  const phase1Rows = ucItems
    .map((uc, i) => {
      const rmId = formatRmId(i + 1);
      const title = `Implement ${uc.id}: ${uc.title}`;
      return `| ${rmId} | ${title} | — | pending | docs/session-prompts/${rmId}.md |`;
    })
    .join("\n");

  const exHeaderRow = `| ${EXECUTABLE_SPRINT_HEADER.id} | ${EXECUTABLE_SPRINT_HEADER.title} | ${lastPhase1Id} | pending | docs/session-prompts/${EXECUTABLE_SPRINT_HEADER.id}.md |`;
  const exUcRows = ucItems
    .map((uc, i) => {
      const exId = formatExId(i + 1);
      const dependsOn = i === 0 ? EXECUTABLE_SPRINT_HEADER.id : formatExId(i);
      const title = `Verify live: ${uc.id} — ${uc.title} (HTTP call + persistence check)`;
      return `| ${exId} | ${title} | ${dependsOn} | pending | docs/session-prompts/${exId}.md |`;
    })
    .join("\n");

  const phase2Rows = PHASE2_ITEMS.map((item, i) => {
    const dependsOn = i === 0 ? lastExId : PHASE2_ITEMS[i - 1]!.id;
    return `| ${item.id} | ${item.title} | ${dependsOn} | pending | docs/session-prompts/${item.id}.md |`;
  }).join("\n");

  const phase3Rows = PHASE3_ITEMS.map((item, i) => {
    const dependsOn =
      i === 0
        ? PHASE2_ITEMS[PHASE2_ITEMS.length - 1]!.id
        : PHASE3_ITEMS[i - 1]!.id;
    return `| ${item.id} | ${item.title} | ${dependsOn} | pending | docs/session-prompts/${item.id}.md |`;
  }).join("\n");

  return [
    `# ${projectName} Roadmap`,
    "",
    "> Generated by ForgeCraft. Each item maps to one implementation session.",
    "> Status: pending | in-progress | done",
    "> Depends On: comma-separated RM IDs that must be done first; — means no dependencies.",
    "> Run `generate_session_prompt` with the item ID to get the bound prompt.",
    "",
    "---",
    "",
    "## Phase 1: Core Implementation",
    "",
    "| ID | Title | Depends On | Status | Prompt |",
    "|---|---|---|---|---|",
    phase1Rows,
    "",
    "## Executable Sprint: Live Verification",
    "",
    `> Gates: **${toolSummary}**. Complete every item in this phase before moving to Phase 2.`,
    "> Each session starts the server, exercises the use case end-to-end, and confirms persistence.",
    "> A use case is not done until its EX item passes.",
    "",
    "| ID | Title | Depends On | Status | Prompt |",
    "|---|---|---|---|---|",
    exHeaderRow,
    exUcRows,
    "",
    "## Phase 2: Integration & Quality Hardening",
    "",
    "| ID | Title | Depends On | Status | Prompt |",
    "|---|---|---|---|---|",
    phase2Rows,
    "",
    "## Phase 3: Pre-Release Hardening",
    "",
    "| ID | Title | Depends On | Status | Prompt |",
    "|---|---|---|---|---|",
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
 * Build a session prompt stub for an Executable Sprint bring-up item (EX-000).
 * For GAME projects, the bring-up check verifies the engine runs headlessly —
 * which is itself proof that logic and rendering are properly separated.
 *
 * @param projectName - Human-readable project name
 * @param tags - Project classification tags
 * @returns Stub markdown string
 */
export function buildExecutableBringUpStub(
  projectName: string,
  tags: ReadonlyArray<string> = [],
): string {
  const isGame = tags.includes("GAME");

  if (isGame) {
    return [
      `# Session Prompt — EX-000: Bring Up (Headless Engine Check)`,
      `> Executable Sprint — for game projects, bring-up proves the engine runs without a renderer.`,
      `> If this step fails, the architecture is not yet correct: logic and rendering are coupled.`,
      `> Fix the coupling before proceeding. The simulation gates cannot run until this passes.`,
      "",
      "## Task",
      `Confirm that the ${projectName} game engine can be imported and run headlessly.`,
      "",
      "## Steps",
      "1. Import the GameEngine class in a plain Node script (no renderer, no browser)",
      "2. Create a game instance and advance one step: `GameEngine.create().applyAction(...)`",
      "3. If this throws or requires a DOM/canvas/WebGL context, the architecture needs fixing",
      "4. Confirm a RandomPlayer strategy can drive the engine to completion in a loop",
      "5. Commit: `chore: EX-000 headless engine confirmed — logic/render separation verified`",
      "",
      "## Acceptance Criteria",
      "- [ ] GameEngine imports and runs with zero renderer dependencies",
      "- [ ] One full game loop completes headlessly without errors",
      "- [ ] RandomPlayer (or equivalent) can drive the engine to an end state",
      "",
    ].join("\n");
  }

  return [
    `# Session Prompt — EX-000: Bring Up`,
    `> Executable Sprint — this session proves the server starts and responds before use-case verification begins.`,
    "",
    "## Task",
    `Start the ${projectName} server and confirm it is reachable.`,
    "",
    "## Steps",
    "1. Install dependencies and run the build (`npm install && npm run build`)",
    "2. Start the server (`npm start` or `npm run dev`)",
    "3. Confirm the health endpoint responds: `curl http://localhost:3000/health`",
    "4. If no health endpoint exists, confirm any root route returns HTTP 200",
    "5. Commit: `chore: EX-000 server starts and health check passes`",
    "",
    "## Acceptance Criteria",
    "- [ ] Server starts without errors",
    "- [ ] Health endpoint returns HTTP 200",
    "- [ ] No unhandled startup exceptions in logs",
    "",
  ].join("\n");
}

/**
 * Build a session prompt stub for an Executable Sprint use-case verification item.
 * Lists all applicable gate files so the AI knows what to fill in and run.
 *
 * @param exId - The EX-00N identifier
 * @param ucId - The UC identifier (e.g. UC-001)
 * @param ucTitle - The use-case title
 * @param tags - Project tags used to resolve gate tools
 * @returns Stub markdown string
 */
export function buildExecutableVerifyStub(
  exId: string,
  ucId: string,
  ucTitle: string,
  tags: ReadonlyArray<string> = [],
): string {
  const gates = resolveExecutableGates(tags);
  const gateFileList = gates
    .map(
      (g) =>
        `- \`${gateFilePath(g, ucId)}\` — ${g.label} (\`${g.runCommand}\`)`,
    )
    .join("\n");

  return [
    `# Session Prompt — ${exId}: Verify Live — ${ucId}`,
    `> Executable Sprint — exercises ${ucId} end-to-end: request → service → persistence.`,
    `> Run \`generate_session_prompt\` with item_description="${ucTitle}" to generate a fully bound prompt.`,
    "",
    "## Task",
    `Verify that ${ucId}: ${ucTitle} works end-to-end against the running server.`,
    "",
    "## Gate Files (fill in and run each)",
    gateFileList,
    "",
    "## Steps",
    "1. Ensure the server is running (EX-000 must be done)",
    `2. Fill in the gate file(s) above with ${ucId}-specific values`,
    "3. Run each gate command and confirm it passes",
    "4. Fix any failures before marking this item done",
    `5. Commit: \`test: ${exId} ${ucId} live verification passes\``,
    "",
    "## Acceptance Criteria",
    ...gates.map((g) => `- [ ] ${g.label} passes for ${ucId}`),
    "- [ ] No server errors in logs during verification",
    "",
  ].join("\n");
}

/**
 * Format an EX ID with zero-padded 3-digit suffix.
 *
 * @param index - 0-based for header (EX-000) or 1-based for UC items
 * @returns Formatted EX-00N string
 */
export function formatExId(index: number): string {
  return `EX-${String(index).padStart(3, "0")}`;
}

/**
 * Format an RM ID with zero-padded 3-digit suffix.
 *
 * @param index - 1-based item index
 * @returns Formatted RM-00N string
 */
export function formatRmId(index: number): string {
  return `RM-${String(index).padStart(3, "0")}`;
}
