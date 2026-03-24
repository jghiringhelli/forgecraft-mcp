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
  formatRmId,
} from "./roadmap-builder.js";

export {
  parseUseCaseTitles,
  readProjectName,
  buildRoadmapContent,
  buildSessionPromptStub,
  formatRmId,
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
