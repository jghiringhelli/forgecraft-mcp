/**
 * generate_roadmap tool handler.
 *
 * Reads docs/PRD.md + docs/use-cases.md and generates a phased docs/roadmap.md.
 * Each roadmap item maps to one implementation session with a bound session
 * prompt stub path. Gated on cascade completion (same pattern as
 * generate_session_prompt). Idempotent — refuses to overwrite an existing roadmap.
 */

import { z } from "zod";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  runCascadeChecks,
  isCascadeComplete,
  buildGuidedRemediation,
  loadCascadeDecisions,
} from "./check-cascade.js";
import {
  parseUseCaseTitles,
  readProjectName,
  buildRoadmapContent,
  buildSessionPromptStub,
  buildExecutableBringUpStub,
  buildExecutableVerifyStub,
  formatRmId,
  formatExId,
  EXECUTABLE_SPRINT_HEADER,
} from "./roadmap-builder.js";
import { readProjectTags } from "./hardening-config.js";
import { resolveExecutableGates, gateFilePath } from "./executable-gates.js";

export {
  parseUseCaseTitles,
  readProjectName,
  buildRoadmapContent,
  buildSessionPromptStub,
  buildExecutableBringUpStub,
  buildExecutableVerifyStub,
  formatRmId,
  formatExId,
  EXECUTABLE_SPRINT_HEADER,
} from "./roadmap-builder.js";

// ── Schema ───────────────────────────────────────────────────────────

export const generateRoadmapSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
});

export type GenerateRoadmapInput = z.infer<typeof generateRoadmapSchema>;

type ToolResult = { content: Array<{ type: "text"; text: string }> };

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
  const tags = readProjectTags(projectDir);
  const gates = resolveExecutableGates(tags);

  mkdirSync(join(projectDir, "docs"), { recursive: true });
  writeFileSync(
    roadmapPath,
    buildRoadmapContent(projectName, ucItems, specFilePath, tags),
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

  // Executable Sprint stubs + gate files
  writeFileSync(
    join(stubsDir, `${EXECUTABLE_SPRINT_HEADER.id}.md`),
    buildExecutableBringUpStub(projectName, tags),
    "utf-8",
  );
  writtenStubs.push(`docs/session-prompts/${EXECUTABLE_SPRINT_HEADER.id}.md`);

  for (let i = 0; i < ucItems.length; i++) {
    const uc = ucItems[i]!;
    const exId = formatExId(i + 1);
    writeFileSync(
      join(stubsDir, `${exId}.md`),
      buildExecutableVerifyStub(exId, uc.id, uc.title, tags),
      "utf-8",
    );
    writtenStubs.push(`docs/session-prompts/${exId}.md`);

    // Write runnable gate file stubs for each applicable tool
    for (const gate of gates) {
      const relPath = gateFilePath(gate, uc.id);
      const absPath = join(projectDir, relPath);
      mkdirSync(join(absPath, ".."), { recursive: true });
      if (!existsSync(absPath)) {
        writeFileSync(absPath, gate.buildStub(uc.id, uc.title), "utf-8");
        writtenStubs.push(relPath);
      }
    }
  }

  const phase1List = ucItems
    .map(
      (uc, i) => `- **${formatRmId(i + 1)}**: Implement ${uc.id}: ${uc.title}`,
    )
    .join("\n");

  const exList = [
    EXECUTABLE_SPRINT_HEADER,
    ...ucItems.map((uc, i) => ({
      id: formatExId(i + 1),
      title: `Verify live: ${uc.id} — ${uc.title}`,
    })),
  ]
    .map((item) => `- **${item.id}**: ${item.title}`)
    .join("\n");

  return {
    content: [
      {
        type: "text",
        text:
          `## Roadmap Generated\n\n` +
          `Written to \`docs/roadmap.md\` with ${ucItems.length} Phase 1 items + ${ucItems.length + 1} Executable Sprint items.\n\n` +
          `### Phase 1 Items\n${phase1List}\n\n` +
          `### Executable Sprint Items\n${exList}\n\n` +
          `> Complete the Executable Sprint before Phase 2. Each EX item proves a use case works end-to-end.\n\n` +
          `### Session Prompt Stubs Written\n` +
          writtenStubs.map((p) => `- \`${p}\``).join("\n") +
          `\n\nRun \`generate_session_prompt\` with an item's description to get the full bound prompt.`,
      },
    ],
  };
}
