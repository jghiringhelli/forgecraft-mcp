/**
 * get_playbook tool handler.
 *
 * Returns the expert workflow playbook(s) for the specified tags.
 * Playbooks are on-demand — they are never emitted into instruction files.
 * They encode multi-phase, ordered agent workflows specific to a domain
 * (e.g., fintech formula research → parametrization → simulation pipeline,
 * or game headless balance simulation → art generation pipeline).
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag, PlaybookTemplate, PlaybookPhase } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";

// ── Schema ───────────────────────────────────────────────────────────

export const getPlaybookSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Tags to get playbooks for. UNIVERSAL is excluded (no playbook exists for it)."),
  phase: z
    .string()
    .optional()
    .describe("Filter to a specific phase ID within the playbook. Omit to get all phases."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function getPlaybookHandler(
  args: z.infer<typeof getPlaybookSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags as Tag[];

  const templateSets = await loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  if (composed.playbooks.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: [
            `No playbooks found for tags: ${tags.map((t) => `[${t}]`).join(" ")}`,
            "",
            "Playbooks exist for domain-specific tags like FINTECH and GAME.",
            "Try: `get_reference { resource: \"playbook\", tags: [\"FINTECH\"] }`",
          ].join("\n"),
        },
      ],
    };
  }

  const lines: string[] = [
    `# Domain Playbooks`,
    "",
    `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}`,
    `**Playbooks found:** ${composed.playbooks.length}`,
    "",
  ];

  for (const playbook of composed.playbooks) {
    lines.push(...renderPlaybook(playbook, args.phase));
    lines.push("");
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// ── Rendering ────────────────────────────────────────────────────────

/**
 * Render a PlaybookTemplate to Markdown lines.
 *
 * @param playbook - The playbook to render
 * @param phaseFilter - Optional phase ID to render only one phase
 */
function renderPlaybook(playbook: PlaybookTemplate, phaseFilter?: string): string[] {
  const lines: string[] = [
    `## [${playbook.tag}] ${playbook.title}`,
    "",
    playbook.description,
    "",
  ];

  const phases = phaseFilter
    ? playbook.phases.filter((p) => p.id === phaseFilter)
    : playbook.phases;

  if (phases.length === 0) {
    lines.push(`> No phase found with id "${phaseFilter}".`);
    lines.push(`> Available phases: ${playbook.phases.map((p) => `\`${p.id}\``).join(", ")}`);
    return lines;
  }

  // Phase overview table
  if (!phaseFilter) {
    lines.push("### Phases Overview");
    lines.push("");
    lines.push("| # | Phase | Rationale |");
    lines.push("|---|-------|-----------|");
    playbook.phases.forEach((phase, i) => {
      lines.push(`| ${i + 1} | **${phase.title}** | ${phase.rationale} |`);
    });
    lines.push("");
  }

  // Phase detail
  phases.forEach((phase, i) => {
    lines.push(...renderPhase(phase, phaseFilter ? 0 : i + 1));
    lines.push("");
  });

  return lines;
}

/**
 * Render a single phase with its steps.
 *
 * @param phase - The phase to render
 * @param phaseNumber - Display number (0 = omit numbering)
 */
function renderPhase(phase: PlaybookPhase, phaseNumber: number): string[] {
  const heading = phaseNumber > 0
    ? `### Phase ${phaseNumber}: ${phase.title}`
    : `### ${phase.title}`;

  const lines: string[] = [
    heading,
    "",
    `*${phase.rationale}*`,
    "",
  ];

  phase.steps.forEach((step, i) => {
    lines.push(`**Step ${i + 1}** — ${step.instruction}`);
    if (step.expected_output) {
      lines.push(`  - Expected output: ${step.expected_output}`);
    }
    if (step.tools?.length) {
      lines.push(`  - Tools: ${step.tools.join(", ")}`);
    }
    lines.push("");
  });

  return lines;
}
