/**
 * get_verification_strategy tool handler.
 *
 * Returns the uncertainty-aware verification strategy for the given tags.
 * Each strategy describes:
 *   - The uncertainty level(s) present in this domain
 *   - The specification completeness ceiling achievable (S ∈ [0,1])
 *   - Ordered verification phases with concrete contracts + execution steps
 *
 * Strategies are on-demand — they are never emitted into instruction files.
 * They encode which verification technique closes the gap between GS Verifiable
 * and Executable quality dimensions for each domain class.
 *
 * Example technique mapping:
 *   API/CLI       → Hurl spec + schema validation (deterministic)
 *   WEB-REACT     → Playwright navigational paths + screenshot + claude vision (behavioral)
 *   GAME          → headless simulation + balance convergence + Aseprite MCP (stochastic + generative)
 *   FINTECH       → statistical price/volume simulation + VaR/CVaR bounds (stochastic + heuristic)
 *   ML            → warm runs + hyperparameter pruning + plateau detection (heuristic)
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag, VerificationStrategy, VerificationPhase, UncertaintyLevel } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";

// ── Schema ───────────────────────────────────────────────────────────

export const getVerificationStrategySchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe(
      "Project tags to get verification strategies for. " +
      "Returns one strategy per tag that has a verification.yaml. " +
      "UNIVERSAL provides baseline contract-first checks applicable to all domains.",
    ),
  phase: z
    .string()
    .optional()
    .describe(
      "Filter to a specific phase ID (e.g., 'contract-definition', 'execution', 'evidence'). " +
      "Omit to return all phases.",
    ),
  uncertainty_level: z
    .enum(["deterministic", "behavioral", "stochastic", "heuristic", "generative"] as const)
    .optional()
    .describe(
      "Filter to strategies that address a specific uncertainty level. " +
      "Omit to return all strategies regardless of uncertainty type.",
    ),
});

// ── Handler ──────────────────────────────────────────────────────────

/**
 * Return verification strategies for the given tags.
 *
 * @param args - Validated tool input
 * @returns Formatted verification strategy document
 */
export async function getVerificationStrategyHandler(
  args: z.infer<typeof getVerificationStrategySchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags as Tag[];

  const templateSets = await loadAllTemplates();
  const composed = composeTemplates(tags, templateSets);

  let strategies = composed.verificationStrategies;

  if (args.uncertainty_level) {
    strategies = strategies.filter((s) =>
      s.uncertainty_levels.includes(args.uncertainty_level as UncertaintyLevel),
    );
  }

  if (strategies.length === 0) {
    const allLevels = args.uncertainty_level ? ` with uncertainty_level=${args.uncertainty_level}` : "";
    return {
      content: [
        {
          type: "text",
          text: [
            `No verification strategies found for tags: ${tags.map((t) => `[${t}]`).join(" ")}${allLevels}`,
            "",
            "Verification strategies exist for domain-specific tags.",
            "All key tags have strategies: UNIVERSAL, API, WEB-REACT, GAME, FINTECH, ML, MOBILE, WEB3.",
          ].join("\n"),
        },
      ],
    };
  }

  const lines: string[] = [
    "# Verification Strategies",
    "",
    `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}`,
    `**Strategies found:** ${strategies.length}`,
    "",
    "## Uncertainty Model",
    "",
    "Specification completeness S ∈ [0,1] determines convergence rate: I(S) ≈ 1/S.",
    "Each strategy closes an uncertainty dimension — raising S before generation reduces",
    "required iteration count. The completeness_ceiling is the maximum S achievable by",
    "applying this strategy fully for a single run.",
    "",
  ];

  // Summary table
  lines.push("| Tag | Uncertainty Level(s) | Completeness Ceiling |");
  lines.push("|-----|---------------------|----------------------|");
  for (const strategy of strategies) {
    const levels = strategy.uncertainty_levels.join(", ");
    const ceiling = `S ≤ ${strategy.completeness_ceiling.toFixed(2)}`;
    lines.push(`| [${strategy.tag}] | ${levels} | ${ceiling} |`);
  }
  lines.push("");

  for (const strategy of strategies) {
    lines.push(...renderStrategy(strategy, args.phase));
    lines.push("");
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// ── Rendering ────────────────────────────────────────────────────────

/**
 * Render a VerificationStrategy to Markdown lines.
 *
 * @param strategy - The strategy to render
 * @param phaseFilter - Optional phase ID to render only one phase
 * @returns Array of Markdown lines
 */
function renderStrategy(strategy: VerificationStrategy, phaseFilter?: string): string[] {
  const lines: string[] = [
    `## [${strategy.tag}] — ${strategy.title}`,
    "",
    strategy.description,
    "",
    `**Uncertainty levels:** ${strategy.uncertainty_levels.join(", ")}`,
    `**Completeness ceiling:** S ≤ ${strategy.completeness_ceiling.toFixed(2)}`,
    "",
  ];

  const phases = phaseFilter
    ? strategy.phases.filter((p) => p.id === phaseFilter)
    : strategy.phases;

  if (phaseFilter && phases.length === 0) {
    lines.push(`> Phase '${phaseFilter}' not found. Available: ${strategy.phases.map((p) => p.id).join(", ")}`);
    return lines;
  }

  for (const phase of phases) {
    lines.push(...renderPhase(phase));
  }

  return lines;
}

/**
 * Render a single VerificationPhase to Markdown lines.
 *
 * @param phase - The phase to render
 * @returns Array of Markdown lines
 */
function renderPhase(phase: VerificationPhase): string[] {
  const lines: string[] = [
    `### Phase: ${phase.title} \`[${phase.id}]\``,
    "",
    `> ${phase.rationale}`,
    "",
  ];

  for (let i = 0; i < phase.steps.length; i++) {
    const step = phase.steps[i];
    const stepNum = i + 1;
    lines.push(`**Step ${stepNum}: ${step.id}**`);
    lines.push("");
    lines.push(`- **Instruction:** ${step.instruction}`);
    lines.push(`- **Contract:** ${step.contract}`);
    lines.push(`- **Tools:** ${step.tools.join(", ")}`);
    lines.push(`- **Expected output:** ${step.expected_output}`);
    lines.push(`- **Pass criterion:** ${step.pass_criterion}`);
    if (step.requires_human_review) {
      lines.push(`- **Human review required:** yes — do not advance until approved`);
    }
    lines.push("");
  }

  return lines;
}
