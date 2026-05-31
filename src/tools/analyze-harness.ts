/**
 * analyze_harness — post-scaffold gap analysis.
 *
 * Compares what ForgeCraft installed against what the FC QG registry and the
 * GS White Paper require for the project's active tags. Surfaces missing gates,
 * sentinel sections, and WP artifacts. When GitHub is available, submits each
 * gap as an improvement proposal to the jghiringhelli/quality-gates repo.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createLogger } from "../shared/logger/index.js";
import {
  fetchRemoteGates,
  filterGatesByTags,
} from "../registry/remote-gates.js";
import type { ToolResult } from "../shared/types.js";

const logger = createLogger("tools/analyze-harness");

const FC_QG_REPO = "jghiringhelli/quality-gates";

// ── Required WP artifacts (deterministic checklist) ────────────────────

const REQUIRED_SENTINEL_SECTIONS = [
  { id: "tool-sequencing", label: "Tool Sequencing table in CLAUDE.md" },
  { id: "corrections-log", label: "Corrections Log in CLAUDE.md" },
  {
    id: "prohibited-ops",
    label: "Prohibited Operations / Tier classification",
  },
  { id: "session-loop", label: "Session loop invariant" },
  { id: "reading-map", label: "Reading map / CNT routing" },
];

const REQUIRED_DOCS = [
  { path: "docs/PRD.md", label: "Functional Spec (PRD)" },
  { path: "docs/use-cases.md", label: "Use Cases with Bound Prompts" },
  {
    path: "docs/operation-classification.md",
    label: "Operation Classification (Tier 0–3)",
  },
  { path: "docs/architecture.md", label: "Architecture doc" },
  { path: "docs/status.md", label: "Session Narrative (status.md)" },
];

const REQUIRED_AGENTS = [
  "test-hunter.md",
  "spec-guardian.md",
  "security-reviewer.md",
  "change-reviewer.md",
];

const REQUIRED_HOOKS = [
  { file: "pre-commit-coverage.sh", label: "test-coverage pre-commit hook" },
  { file: "pre-commit-tdd-check.sh", label: "TDD phase gate hook" },
  { file: "pre-tool-use.sh", label: "Pre-tool-use destructive-op guard" },
  { file: "post-edit.sh", label: "Post-edit quality gate" },
  { file: "prompt-guard.sh", label: "Prompt guard (UserPromptSubmit)" },
];

// ── Input / Output types ───────────────────────────────────────────────

export interface AnalyzeHarnessInput {
  readonly project_dir: string;
  /** When true, submits gaps as GitHub issues to FC QG repo. Default: true. */
  readonly submit_issues?: boolean;
  /** When true, re-fetch remote gates even if cache is fresh. */
  readonly force_fetch?: boolean;
}

interface Gap {
  readonly category: "sentinel" | "docs" | "agents" | "hooks" | "remote-gate";
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

// ── Handler ────────────────────────────────────────────────────────────

export async function analyzeHarnessHandler(
  input: AnalyzeHarnessInput,
): Promise<ToolResult> {
  const { project_dir } = input;
  const submitIssues = input.submit_issues !== false;

  logger.info("analyze_harness", { project_dir });

  // Read active tags from forgecraft.yaml
  const tags = readActiveTags(project_dir);
  const gaps: Gap[] = [];

  // 1. Sentinel section audit (CLAUDE.md)
  const claudeMdPath = join(project_dir, "CLAUDE.md");
  const claudeMdContent = existsSync(claudeMdPath)
    ? readFileSync(claudeMdPath, "utf-8")
    : "";
  for (const section of REQUIRED_SENTINEL_SECTIONS) {
    if (!hasSentinelSection(claudeMdContent, section.id)) {
      gaps.push({ category: "sentinel", id: section.id, label: section.label });
    }
  }

  // 2. Required docs audit
  for (const doc of REQUIRED_DOCS) {
    if (!existsSync(join(project_dir, doc.path))) {
      gaps.push({ category: "docs", id: doc.path, label: doc.label });
    }
  }

  // 3. Sub-agent audit
  const agentsDir = join(project_dir, ".claude", "agents");
  for (const agent of REQUIRED_AGENTS) {
    if (!existsSync(join(agentsDir, agent))) {
      gaps.push({
        category: "agents",
        id: agent,
        label: `Sub-agent: ${agent.replace(".md", "")}`,
      });
    }
  }

  // 4. Hook audit
  const hooksDir = join(project_dir, ".claude", "hooks");
  for (const hook of REQUIRED_HOOKS) {
    if (!existsSync(join(hooksDir, hook.file))) {
      gaps.push({ category: "hooks", id: hook.file, label: hook.label });
    }
  }

  // 5. Remote FC QG gate audit — check which registered gates are not locally installed
  try {
    const index = await fetchRemoteGates(project_dir);
    const relevant = filterGatesByTags(index, tags);
    const installedGates = readInstalledGateIds(project_dir);

    for (const gate of relevant) {
      if (gate.status !== "approved") continue;
      if (!installedGates.has(gate.id)) {
        gaps.push({
          category: "remote-gate",
          id: gate.id,
          label: gate.title,
          detail: `GS property: ${gate.gsProperty} | hook: ${gate.hook}`,
        });
      }
    }
  } catch {
    // Network unavailable — skip remote gate comparison
  }

  // Build gap report
  const report = buildGapReport(gaps, tags, project_dir);

  // Submit GitHub issues when requested and gaps exist
  const submitted: string[] = [];
  if (submitIssues && gaps.length > 0) {
    const ghAvailable = isGhAvailable();
    if (ghAvailable) {
      for (const gap of gaps) {
        const issueUrl = submitGitHubIssue(gap, project_dir, tags);
        if (issueUrl) submitted.push(issueUrl);
      }
    }
  }

  const issueSection =
    submitted.length > 0
      ? `\n### GitHub Issues Created (${submitted.length})\n${submitted.map((u) => `  ${u}`).join("\n")}\n`
      : "";

  return {
    content: [{ type: "text", text: report + issueSection }],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function readActiveTags(projectDir: string): string[] {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return ["UNIVERSAL"];
  try {
    const content = readFileSync(yamlPath, "utf-8");
    const tagsMatch = /tags:\s*\[([^\]]+)\]/.exec(content);
    if (tagsMatch) {
      return tagsMatch[1]!
        .split(",")
        .map((t) => t.trim().replace(/['"]/g, ""))
        .filter(Boolean);
    }
    // Multi-line tags format
    const lines = content.split("\n");
    const inTags: string[] = [];
    let capturing = false;
    for (const line of lines) {
      if (/^tags:/.test(line)) {
        capturing = true;
        continue;
      }
      if (capturing && /^\s+-\s+/.test(line)) {
        inTags.push(
          line
            .replace(/^\s+-\s+/, "")
            .trim()
            .replace(/['"]/g, ""),
        );
      } else if (capturing && !/^\s/.test(line)) {
        break;
      }
    }
    return inTags.length > 0 ? inTags : ["UNIVERSAL"];
  } catch {
    return ["UNIVERSAL"];
  }
}

function hasSentinelSection(content: string, sectionId: string): boolean {
  const patterns: Record<string, RegExp> = {
    "tool-sequencing": /tool\s+sequencing|##.*sequenc/i,
    "corrections-log": /corrections?\s+log|##.*corrections?/i,
    "prohibited-ops": /prohibited|tier\s+[0-3]|operation-classification/i,
    "session-loop": /session\s+loop|loop\s+invariant/i,
    "reading-map": /reading\s+map|\.claude\/index|CNT\s+routing/i,
  };
  return patterns[sectionId]?.test(content) ?? false;
}

function readInstalledGateIds(projectDir: string): Set<string> {
  const installed = new Set<string>();
  // Check gate-violations.jsonl for referenced gate IDs (gates that fired)
  const violationsPath = join(
    projectDir,
    ".forgecraft",
    "gate-violations.jsonl",
  );
  if (existsSync(violationsPath)) {
    const lines = readFileSync(violationsPath, "utf-8")
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { hook?: string };
        if (entry.hook) installed.add(entry.hook);
      } catch {
        /* skip */
      }
    }
  }
  // Check installed hook scripts — each maps to a gate
  const hooksDir = join(projectDir, ".claude", "hooks");
  if (existsSync(hooksDir)) {
    for (const file of readdirSync(hooksDir)) {
      installed.add(file.replace(/\.sh$/, ""));
    }
  }
  return installed;
}

function buildGapReport(
  gaps: Gap[],
  tags: string[],
  projectDir: string,
): string {
  if (gaps.length === 0) {
    return `## Harness Analysis — No Gaps Found\n\nAll required GS artifacts and FC QG gates are present for tags [${tags.join(", ")}].\n\nRun \`analyze_harness\` again after the next implementation cycle to detect drift.\n`;
  }

  const byCategory: Record<string, Gap[]> = {};
  for (const gap of gaps) {
    (byCategory[gap.category] ??= []).push(gap);
  }

  const categoryLabel: Record<string, string> = {
    sentinel: "Sentinel (CLAUDE.md) — Missing Sections",
    docs: "Required Documentation",
    agents: "Sub-Agent Definitions",
    hooks: "Hook Scripts",
    "remote-gate": "FC QG Registry — Gates Not Installed",
  };

  let out = `## Harness Analysis — ${gaps.length} Gap${gaps.length === 1 ? "" : "s"} Found\n\n`;
  out += `Project: \`${projectDir}\`\n`;
  out += `Active tags: [${tags.join(", ")}]\n\n`;

  for (const [cat, catGaps] of Object.entries(byCategory)) {
    out += `### ${categoryLabel[cat] ?? cat} (${catGaps.length})\n`;
    for (const gap of catGaps) {
      out += `  ✗ ${gap.label}`;
      if (gap.detail) out += ` — ${gap.detail}`;
      out += `\n`;
    }
    out += `\n`;
  }

  out += `### Remediation\n`;
  if (byCategory["sentinel"]?.length) {
    out += `**Sentinel gaps** — Use the AI Tailoring Checklist from setup_project to generate missing sections.\n`;
  }
  if (byCategory["docs"]?.length) {
    out += `**Docs gaps** — Populate from spec. Use \`review_stubs\` to identify which stubs need content.\n`;
  }
  if (byCategory["agents"]?.length) {
    out += `**Agent gaps** — Re-run \`setup_project\` phase 2 or add agent files manually to \`.claude/agents/\`.\n`;
  }
  if (byCategory["hooks"]?.length) {
    out += `**Hook gaps** — Run \`add_hook\` for each missing hook, or re-scaffold with \`scaffold\`.\n`;
  }
  if (byCategory["remote-gate"]?.length) {
    out += `**FC QG gaps** — These gates exist in the registry but are not installed. Run \`contribute_gate\` or apply them manually via \`add_hook\`.\n`;
  }

  return out;
}

function isGhAvailable(): boolean {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function submitGitHubIssue(
  gap: Gap,
  projectDir: string,
  tags: string[],
): string | null {
  const title = `[gap] ${gap.category}: ${gap.label}`;
  const body = [
    `## Gap Report`,
    ``,
    `**Category:** ${gap.category}`,
    `**Gap:** ${gap.label}`,
    gap.detail ? `**Detail:** ${gap.detail}` : null,
    `**Project tags:** ${tags.join(", ")}`,
    ``,
    `## Context`,
    ``,
    `Identified by \`analyze_harness\` in project \`${projectDir}\`.`,
    `This gap indicates a missing artifact or quality gate that the GS White Paper requires.`,
    ``,
    `## Proposed Resolution`,
    ``,
    `Add the corresponding gate or artifact to the FC QG registry so ForgeCraft can scaffold it automatically for future projects with tags: [${tags.join(", ")}].`,
    ``,
    `_Auto-submitted by ForgeCraft analyze_harness_`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const out = execSync(
      `gh issue create --repo "${FC_QG_REPO}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').replace(/\n/g, "\\n")}" --label "gap,auto-submitted"`,
      { encoding: "utf-8", timeout: 15000 },
    );
    const urlMatch = /https:\/\/github\.com\/[^\s]+/.exec(out);
    return urlMatch ? urlMatch[0] : null;
  } catch {
    return null;
  }
}
