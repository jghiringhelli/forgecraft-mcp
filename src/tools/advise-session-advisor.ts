/**
 * Advice generation for the session advisor.
 *
 * Converts a ProjectSignals snapshot into a prioritised list of
 * AdviceItems, then formats them as human-readable markdown.
 * Plain-English first — GS vocabulary only when the project is configured.
 */

import type { ProjectSignals } from "./advise-session-signals.js";

// ── Types ────────────────────────────────────────────────────────────

export interface AdviceItem {
  readonly priority: "critical" | "high" | "medium" | "low";
  readonly message: string;
  readonly action?: string;
}

// ── Priority labels ───────────────────────────────────────────────────

const LABEL: Record<AdviceItem["priority"], string> = {
  critical: "[CRITICAL]",
  high: "[HIGH]",
  medium: "[MEDIUM]",
  low: "[LOW]",
};

// ── Advice rules ─────────────────────────────────────────────────────

function violationItems(signals: ProjectSignals): AdviceItem[] {
  return signals.topViolations.map((msg) => ({
    priority: "critical" as const,
    message: `Gate violation: ${msg}`,
  }));
}

function constitutionItem(signals: ProjectSignals): AdviceItem | null {
  if (signals.hasConstitution) return null;
  return {
    priority: "high",
    message:
      "No AI rules file found (CLAUDE.md / .clinerules / .windsurfrules / copilot-instructions.md / CONVENTIONS.md) — the assistant has no project rules to follow.",
    action:
      'Run forgecraft_actions { action: "setup_project" } to generate the right file for your agent.',
  };
}

function testItem(signals: ProjectSignals): AdviceItem | null {
  if (!signals.hasSourceCode || signals.hasTests) return null;
  return {
    priority: "high",
    message:
      "No test directory found — bugs accumulate silently without a test suite.",
    action:
      "Add a tests/ directory and write at least one test before the next commit.",
  };
}

function schemaItem(signals: ProjectSignals): AdviceItem | null {
  if (!signals.hasSourceCode || signals.hasSchema) return null;
  return {
    priority: "medium",
    message:
      "No schema artifact found — the system vocabulary (API, DB, events) is implicit.",
    action:
      "Add openapi.yaml, prisma/schema.prisma, or docs/schema.md to make contracts explicit.",
  };
}

function specItem(signals: ProjectSignals): AdviceItem | null {
  if (signals.hasSpec) return null;
  return {
    priority: "medium",
    message: "No spec or PRD found — intent exists only in contributor heads.",
    action: "Add docs/PRD.md describing what the project does and why.",
  };
}

function greenItem(): AdviceItem {
  return {
    priority: "low",
    message:
      "Project looks healthy — no missing artifacts or active gate violations detected.",
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function buildAdviceItems(
  signals: ProjectSignals,
  maxItems: number,
): AdviceItem[] {
  const candidates: AdviceItem[] = [
    ...violationItems(signals),
    constitutionItem(signals),
    testItem(signals),
    schemaItem(signals),
    specItem(signals),
  ].filter((i): i is AdviceItem => i !== null);

  if (candidates.length === 0) return [greenItem()];
  return candidates.slice(0, maxItems);
}

export function formatAdvice(
  items: AdviceItem[],
  recentActivity: string | null,
): string {
  const lines: string[] = ["## Session Advisor", ""];

  if (recentActivity) {
    lines.push(`**Last commit:** ${recentActivity}`, "");
  }

  for (const item of items) {
    lines.push(`${LABEL[item.priority]} ${item.message}`);
    if (item.action) lines.push(`  → ${item.action}`);
  }

  return lines.join("\n");
}
