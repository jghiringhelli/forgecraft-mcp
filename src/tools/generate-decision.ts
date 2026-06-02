/**
 * generate_decision tool handler.
 *
 * Emits a structured Decision/Post-mortem record into docs/decisions/ —
 * the GS taxonomy slot for non-architectural one-pagers: bug-fix interpretations,
 * operational tweaks, "we chose X over Y because Z" notes that don't warrant a
 * full ADR.
 *
 * Encouraged on `fix:` commits (per cascade) and required when a bug-postmortem
 * change_request reaches `verified` status.
 *
 * Output file: docs/decisions/YYYY-MM-DD-slug.md
 * Format: Trigger / Root cause / Fix / Regression test / Chronicle link.
 */

import { z } from "zod";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";

const logger = createLogger("tools/generate-decision");

const DECISION_DIR = join("docs", "decisions");

// ── Schema ───────────────────────────────────────────────────────────

export const generateDecisionSchema = z.object({
  project_dir: z
    .string()
    .describe(
      "Absolute path to the project root. Decision is written to {project_dir}/docs/decisions/.",
    ),
  title: z
    .string()
    .describe(
      "Short imperative title of the decision/post-mortem (e.g. 'Drop duplicate task_id rows on import'). " +
        "Becomes the slug in the filename and the H1 heading.",
    ),
  trigger: z
    .string()
    .optional()
    .describe(
      "What surfaced this decision — bug symptom, incident, support ticket, observed behavior. " +
        "If omitted, a placeholder is written.",
    ),
  root_cause: z
    .string()
    .optional()
    .describe(
      "Why it happened — the underlying defect, missing guard, or design oversight. " +
        "If omitted, a placeholder is written.",
    ),
  fix: z
    .string()
    .optional()
    .describe(
      "What was changed (code, config, or behavior) and why this fix was chosen over alternatives. " +
        "If omitted, a placeholder is written.",
    ),
  regression_test: z
    .string()
    .optional()
    .describe(
      "Test or gate that locks this fix in (test name, gate id, monitor). " +
        "If omitted, a placeholder is written — required for fix: commits per cascade.",
    ),
  chronicle_session_id: z
    .string()
    .optional()
    .describe(
      "Optional chronicle session id where the investigation was recorded. " +
        "Links the post-mortem back to its individual-memory provenance.",
    ),
  related_adr: z
    .string()
    .optional()
    .describe(
      "Optional ADR id this decision touches or refines (e.g. 'ADR-0007'). " +
        "Use when the bug exposed an architectural assumption — promotes traceability.",
    ),
});

export type GenerateDecisionInput = z.infer<typeof generateDecisionSchema>;

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Generate and write a structured decision/post-mortem file.
 *
 * @param args - Validated tool input
 * @returns MCP tool response with the written file path and content
 */
export async function generateDecisionHandler(
  args: GenerateDecisionInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { project_dir, title } = args;

  const decisionDir = join(project_dir, DECISION_DIR);
  if (!existsSync(decisionDir)) {
    mkdirSync(decisionDir, { recursive: true });
    logger.info("Created docs/decisions/ directory", { decisionDir });
  }

  const date = new Date().toISOString().slice(0, 10);
  const slug = titleToSlug(title);
  const filename = `${date}-${slug}.md`;
  const filePath = join(decisionDir, filename);
  const relativePath = join(DECISION_DIR, filename).replace(/\\/g, "/");

  if (existsSync(filePath)) {
    return {
      content: [
        {
          type: "text",
          text: `Decision file already exists: ${relativePath}\nChoose a different title or edit the existing file directly.`,
        },
      ],
    };
  }

  const content = renderDecision({
    date,
    title,
    trigger: args.trigger,
    root_cause: args.root_cause,
    fix: args.fix,
    regression_test: args.regression_test,
    chronicle_session_id: args.chronicle_session_id,
    related_adr: args.related_adr,
  });

  writeFileSync(filePath, content, "utf-8");
  logger.info("Decision written", { filePath, date, slug });

  const lines = [
    `# Decision Written`,
    ``,
    `**File:** \`${relativePath}\``,
    `**Date:** ${date}`,
    `**Title:** ${title}`,
    ``,
    `## Content`,
    ``,
    "```markdown",
    content,
    "```",
    ``,
    `> **Next step:** Resolve any \`[NEEDS CLARIFICATION]\` markers — especially the regression test, which is required by the \`fix:\` cascade.`,
    args.chronicle_session_id
      ? `> Chronicle session \`${args.chronicle_session_id}\` is linked — keep that record alive while this decision is current.`
      : `> If this decision came out of a chronicle session, re-run with \`chronicle_session_id\` to link the investigation.`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Convert a title string to a URL-safe kebab-case slug.
 * Strips punctuation, lowercases, replaces spaces/underscores with hyphens.
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

interface DecisionFields {
  readonly date: string;
  readonly title: string;
  readonly trigger?: string;
  readonly root_cause?: string;
  readonly fix?: string;
  readonly regression_test?: string;
  readonly chronicle_session_id?: string;
  readonly related_adr?: string;
}

/**
 * Render a complete decision/post-mortem document from the provided fields.
 */
export function renderDecision(fields: DecisionFields): string {
  const {
    date,
    title,
    trigger,
    root_cause,
    fix,
    regression_test,
    chronicle_session_id,
    related_adr,
  } = fields;

  const lines: string[] = [
    `# ${title}`,
    ``,
    `**Date:** ${date}`,
    `**Type:** Decision / Post-mortem`,
  ];

  if (related_adr) {
    lines.push(`**Related ADR:** ${related_adr}`);
  }
  if (chronicle_session_id) {
    lines.push(`**Chronicle session:** \`${chronicle_session_id}\``);
  }

  lines.push(
    ``,
    `## Trigger`,
    ``,
    trigger ??
      "[NEEDS CLARIFICATION: what surfaced this — bug symptom, incident, support ticket, observed behavior]",
    ``,
    `## Root Cause`,
    ``,
    root_cause ??
      "[NEEDS CLARIFICATION: why it happened — the underlying defect, missing guard, or design oversight]",
    ``,
    `## Fix`,
    ``,
    fix ??
      "[NEEDS CLARIFICATION: what was changed (code, config, behavior) and why this fix was chosen]",
    ``,
    `## Regression Test`,
    ``,
    regression_test ??
      "[NEEDS CLARIFICATION: test name, gate id, or monitor that locks this fix in — REQUIRED by fix: cascade]",
    ``,
    `## Chronicle Link`,
    ``,
    chronicle_session_id
      ? `Investigation recorded in chronicle session \`${chronicle_session_id}\`. Pull notes/prompts from there before editing this file.`
      : "[OPTIONAL: chronicle session id if the investigation was recorded — leave empty if this was a one-shot fix]",
    ``,
    `---`,
    ``,
    `_This decision record was generated by ForgeCraft. Resolve any [NEEDS CLARIFICATION] sections before merging — the cascade gate will block a \`fix:\` PR whose regression test is unresolved._`,
  );

  return lines.join("\n");
}
