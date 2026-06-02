/**
 * score_rubric tool handler.
 *
 * Gathers evidence for all 7 GS properties and emits a structured evaluation
 * prompt. The calling LLM scores 0/1/2 per property using the provided criteria
 * as a starting framework — but is explicitly invited to override, add its own
 * criteria, and flag anything it finds lacking regardless of what the heuristics say.
 *
 * The tool itself performs no scoring. It is a deterministic evidence collector.
 * The intelligence lives in the LLM that reads its output.
 *
 * Read-only — no files written.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "../shared/types.js";
import { auditCntHealth } from "../shared/cnt-health.js";
import { getActiveProjectGates } from "../shared/project-gates.js";
import { readBrownfieldFlag } from "../shared/config.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface ScoreRubricInput {
  readonly project_dir: string;
}

// ── Evidence collectors ───────────────────────────────────────────────

function safeRead(path: string, maxLines = 20): string {
  try {
    const lines = readFileSync(path, "utf-8").split("\n");
    return lines.slice(0, maxLines).join("\n");
  } catch {
    return "(not found)";
  }
}

function safeCount(dir: string, ext?: string): number {
  if (!existsSync(dir)) return 0;
  try {
    const files = readdirSync(dir);
    return ext ? files.filter((f) => f.endsWith(ext)).length : files.length;
  } catch {
    return 0;
  }
}

function safeCountPattern(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => pattern.test(f)).length;
  } catch {
    return 0;
  }
}

function fileWords(path: string): number {
  try {
    return readFileSync(path, "utf-8").split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function countMarkers(dir: string): number {
  if (!existsSync(dir)) return 0;
  const MARKER = "[NEEDS CLARIFICATION]";
  let count = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      try {
        const content = readFileSync(join(dir, f), "utf-8");
        let pos = 0;
        while ((pos = content.indexOf(MARKER, pos)) !== -1) {
          count++;
          pos += MARKER.length;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return count;
}

function readHarnessEvidence(projectDir: string): {
  passed: number;
  failed: number;
  notImplemented: number;
  timestamp: string | null;
} | null {
  const path = join(projectDir, ".forgecraft", "harness-run.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as {
      passed?: number;
      failed?: number;
      timestamp?: string;
      results?: Array<{ status: string }>;
    };
    const notImplemented = (raw.results ?? []).filter(
      (r) => r.status === "not_implemented",
    ).length;
    return {
      passed: raw.passed ?? 0,
      failed: raw.failed ?? 0,
      notImplemented,
      timestamp: raw.timestamp ?? null,
    };
  } catch {
    return null;
  }
}

function readProbeEvidence(
  projectDir: string,
  filename: string,
): { passed: number; failed: number; timestamp: string | null } | null {
  const path = join(projectDir, ".forgecraft", filename);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as {
      passed?: number;
      failed?: number;
      timestamp?: string;
    };
    return {
      passed: raw.passed ?? 0,
      failed: raw.failed ?? 0,
      timestamp: raw.timestamp ?? null,
    };
  } catch {
    return null;
  }
}

function adrStatuses(projectDir: string): {
  total: number;
  accepted: number;
  retroactive: number;
  markers: number;
} {
  const canonical = join(projectDir, "docs", "adrs", "active");
  const legacy = join(projectDir, "docs", "adrs");
  const dir = existsSync(canonical) ? canonical : legacy;
  if (!existsSync(dir))
    return { total: 0, accepted: 0, retroactive: 0, markers: 0 };

  let accepted = 0;
  let retroactive = 0;
  let total = 0;
  const MARKER = "[NEEDS CLARIFICATION]";
  let markers = 0;

  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      total++;
      const content = readFileSync(join(dir, f), "utf-8");
      if (/\*\*Status:\*\*\s*Accepted/i.test(content)) accepted++;
      if (/\*\*Status:\*\*\s*Retroactive/i.test(content)) retroactive++;
      let pos = 0;
      while ((pos = content.indexOf(MARKER, pos)) !== -1) {
        markers++;
        pos += MARKER.length;
      }
    }
  } catch {
    // skip
  }
  return { total, accepted, retroactive, markers };
}

function hookInstallationStatus(projectDir: string): {
  installed: number;
  missing: number;
} {
  const gitHooksDir = join(projectDir, ".git", "hooks");
  const sourceHooksDir = join(projectDir, ".forgecraft", "hooks");
  if (!existsSync(sourceHooksDir)) return { installed: 0, missing: 0 };
  if (!existsSync(gitHooksDir)) return { installed: 0, missing: 5 };

  const EXPECTED = [
    "pre-commit",
    "commit-msg",
    "post-commit",
    "prepare-commit-msg",
    "pre-push",
  ];
  let installed = 0;
  let missing = 0;
  for (const hook of EXPECTED) {
    if (existsSync(join(gitHooksDir, hook))) installed++;
    else missing++;
  }
  return { installed, missing };
}

// ── Evidence assembler ────────────────────────────────────────────────

function gatherEvidence(projectDir: string): Record<string, string> {
  const claudeMdPath = join(projectDir, "CLAUDE.md");
  const indexMdPath = join(projectDir, ".claude", "index.md");
  const coreMdPath = join(projectDir, ".claude", "core.md");
  const prdPath = [
    join(projectDir, "docs", "PRD.md"),
    join(projectDir, "docs", "prd.md"),
  ].find(existsSync);

  const claudeMdLines = existsSync(claudeMdPath)
    ? readFileSync(claudeMdPath, "utf-8").split("\n").length
    : 0;
  const claudeMdHead = safeRead(claudeMdPath, 5);
  const isSentinel =
    existsSync(claudeMdPath) &&
    readFileSync(claudeMdPath, "utf-8").includes("<!-- ForgeCraft sentinel:");

  const cntHealth = (() => {
    try {
      return auditCntHealth(projectDir);
    } catch {
      return null;
    }
  })();

  const cntLeafCount = safeCount(
    join(projectDir, ".claude", "standards"),
    ".md",
  );
  const cntRoutingPass = cntHealth?.routingPass ?? null;
  const unroutedLeaves = cntHealth?.unroutedLeaves ?? [];

  const ucDir = join(projectDir, "docs", "use-cases");
  const ucCount = safeCountPattern(ucDir, /^UC-\d{3}/);
  const monolithUcPath = join(projectDir, "docs", "use-cases.md");
  const ucMonolithWords = fileWords(monolithUcPath);

  const harnessDir = [
    join(projectDir, "tests", "harness"),
    join(projectDir, "test", "harness"),
  ].find(existsSync);
  const probeCount = harnessDir ? safeCount(harnessDir) : 0;
  const harnessEvidence = readHarnessEvidence(projectDir);
  const envEvidence = readProbeEvidence(projectDir, "env-probe-run.json");
  const sloEvidence = readProbeEvidence(projectDir, "slo-probe-run.json");

  const adrs = adrStatuses(projectDir);

  const decisionCount = safeCount(join(projectDir, "docs", "decisions"), ".md");
  const decisionMarkers = countMarkers(join(projectDir, "docs", "decisions"));

  let gateCount = 0;
  let warningGates = 0;
  let errorGates = 0;
  try {
    const gates = getActiveProjectGates(projectDir);
    gateCount = gates.length;
    warningGates = gates.filter((g) => g.severity === "warning").length;
    errorGates = gates.filter((g) => g.severity === "error").length;
  } catch {
    // skip
  }

  const hooks = hookInstallationStatus(projectDir);
  const brownfield = readBrownfieldFlag(projectDir);

  const sessionPromptsExist = existsSync(
    join(projectDir, "docs", "session-prompts"),
  );

  const prdWords = prdPath ? fileWords(prdPath) : 0;
  const prdRelPath = prdPath
    ? prdPath.replace(projectDir, "").replace(/^[\\/]/, "")
    : null;

  const indexMdHead = safeRead(indexMdPath, 10);
  const coreMdLines = existsSync(coreMdPath)
    ? readFileSync(coreMdPath, "utf-8").split("\n").length
    : 0;

  return {
    // Self-describing
    claudeMd: `${claudeMdLines} lines | sentinel: ${isSentinel} | head:\n${claudeMdHead}`,
    cntLeaves: `${cntLeafCount} leaf nodes`,
    indexMd: existsSync(indexMdPath)
      ? `present | head:\n${indexMdHead}`
      : "absent",
    coreMd: `${coreMdLines} lines`,
    cntRoutingPass:
      cntRoutingPass === null ? "unknown" : String(cntRoutingPass),
    unroutedLeaves:
      unroutedLeaves.length > 0 ? unroutedLeaves.join(", ") : "none",

    // Bounded
    sessionPrompts: sessionPromptsExist
      ? "docs/session-prompts/ exists"
      : "absent",
    cntBounded: cntRoutingPass
      ? "routing directives present"
      : "routing directives missing",

    // Verifiable
    ucCount: String(ucCount),
    ucMonolith:
      ucMonolithWords > 0 ? `use-cases.md: ${ucMonolithWords} words` : "absent",
    probeCount: String(probeCount),
    harnessEvidence: harnessEvidence
      ? `${harnessEvidence.passed} passed / ${harnessEvidence.failed} failed / ${harnessEvidence.notImplemented} not_implemented @ ${harnessEvidence.timestamp}`
      : "not run",

    // Defended
    gateCount: String(gateCount),
    gateSeverities: `${errorGates} error-severity / ${warningGates} warning-severity`,
    hooksInstalled: `${hooks.installed}/5 installed | ${hooks.missing} missing`,
    brownfield: String(brownfield),

    // Auditable
    adrs: `${adrs.total} total | ${adrs.accepted} Accepted | ${adrs.retroactive} Retroactive | ${adrs.markers} unresolved markers`,
    decisions: `${decisionCount} files | ${decisionMarkers} unresolved markers`,

    // Composable
    prd: prdRelPath ? `${prdRelPath}: ${prdWords} words` : "absent",
    chainLinks: `PRD:${prdRelPath ? "✓" : "✗"} UCs:${ucCount > 0 ? "✓" : "✗"} Probes:${probeCount > 0 ? "✓" : "✗"} ADRs:${adrs.total > 0 ? "✓" : "✗"} Gates:${gateCount > 0 ? "✓" : "✗"}`,

    // Executable
    envEvidence: envEvidence
      ? `${envEvidence.passed} passed / ${envEvidence.failed} failed @ ${envEvidence.timestamp}`
      : "not run",
    sloEvidence: sloEvidence
      ? `${sloEvidence.passed} passed / ${sloEvidence.failed} failed @ ${sloEvidence.timestamp}`
      : "not run",
  };
}

// ── Scoring prompt builder ─────────────────────────────────────────────

function buildScoringPrompt(
  projectDir: string,
  evidence: Record<string, string>,
): string {
  const relDir = projectDir.split(/[\\/]/).pop() ?? projectDir;

  return [
    `# GS Rubric Evaluation — ${relDir}`,
    "",
    "You are evaluating this project against the 7 Generative Specification properties.",
    "Score each property 0 / 1 / 2 using the criteria below as a **starting framework**.",
    "",
    "**Important:** The criteria below describe what the tooling can detect. You are not limited to them.",
    "If you see something the heuristics miss — a property that is technically present but",
    "hollow, spec artifacts that exist but are incoherent, tests that pass trivially — flag it.",
    "Reduce the score. Add a note. The goal is an honest assessment, not a passing grade.",
    "",
    "---",
    "",
    "## Evidence",
    "",
    "### Self-describing",
    `- CLAUDE.md: ${evidence["claudeMd"]}`,
    `- CNT: ${evidence["cntLeaves"]} | routing: ${evidence["cntRoutingPass"]} | unrouted: ${evidence["unroutedLeaves"]}`,
    `- .claude/index.md: ${evidence["indexMd"]}`,
    `- .claude/core.md: ${evidence["coreMd"]}`,
    "",
    "### Bounded",
    `- Session prompts: ${evidence["sessionPrompts"]}`,
    `- CNT context loading: ${evidence["cntBounded"]}`,
    "",
    "### Verifiable",
    `- Use cases (canonical): ${evidence["ucCount"]} UC files`,
    `- Use cases (monolith): ${evidence["ucMonolith"]}`,
    `- L2 probes: ${evidence["probeCount"]} files`,
    `- Harness run: ${evidence["harnessEvidence"]}`,
    "",
    "### Defended",
    `- Active gates: ${evidence["gateCount"]} (${evidence["gateSeverities"]})`,
    `- Git hooks: ${evidence["hooksInstalled"]}`,
    `- Brownfield project: ${evidence["brownfield"]}`,
    "",
    "### Auditable",
    `- ADRs: ${evidence["adrs"]}`,
    `- Decision records: ${evidence["decisions"]}`,
    "",
    "### Composable",
    `- PRD: ${evidence["prd"]}`,
    `- Chain presence: ${evidence["chainLinks"]}`,
    "",
    "### Executable",
    `- L2 Harness: ${evidence["harnessEvidence"]}`,
    `- L3 Env probes: ${evidence["envEvidence"]}`,
    `- L4 SLO probes: ${evidence["sloEvidence"]}`,
    "",
    "---",
    "",
    "## Scoring Criteria (starting framework — override freely)",
    "",
    "### 1. Self-describing (0–2)",
    "- **0**: No CLAUDE.md, or a monolithic blob with no CNT navigation",
    "- **1**: CLAUDE.md present; some CNT nodes exist but routing is incomplete or absent",
    "- **2**: Sentinel CLAUDE.md + CNT with routing directives for all domains; index.md clearly describes when to load each node",
    "",
    "### 2. Bounded (0–2)",
    "- **0**: No session prompts; Claude loads all context on every call",
    "- **1**: Session prompts or CNT routing exist but scope boundaries are vague or unrouted leaves remain",
    "- **2**: Every generated session has explicit scope; CNT routing loads only relevant context; no context bloat",
    "",
    "### 3. Verifiable (0–2)",
    "- **0**: No use cases, or use cases exist but no tests are bound to them",
    "- **1**: Use cases exist; some probes exist; harness has not been run or has not_implemented probes",
    "- **2**: All UCs have probes; harness ran with 0 failures and 0 not_implemented; L2 coverage ≥ 80%",
    "",
    "### 4. Defended (0–2)",
    "- **0**: No gates, or gates are defined but hooks are not installed so they never fire",
    "- **1**: Gates defined; hooks installed; but gates are all warning-severity or coverage is low",
    "- **2**: Error-severity gates in force; hooks installed and firing; gates cover the main failure modes",
    "",
    "### 5. Auditable (0–2)",
    "- **0**: No ADRs or decisions; no record of why choices were made",
    "- **1**: ADRs exist but majority are Retroactive stubs with unresolved markers; decision trail is incomplete",
    "- **2**: All significant decisions have Accepted ADRs with full Context/Decision/Alternatives; decision records link to chronicle sessions where relevant",
    "",
    "### 6. Composable (0–2)",
    "- **0**: No visible derivation chain; spec is a monolith or absent",
    "- **1**: Some chain links present (e.g. PRD → UCs, or UCs → probes) but not end-to-end; cross-references between layers are missing",
    "- **2**: Full chain intact: PRD → UCs → ADRs → probes → gates; each layer is derivable from the prior; cross-references present",
    "",
    "### 7. Executable (0–2)",
    "- **0**: No executable spec artifacts; everything is documentation only",
    "- **1**: Probes exist but have not been run, are stubs (not_implemented), or have failures",
    "- **2**: L2 probes all passing; L3 env probes run and passing; L4 SLO probes run and passing; monitoring contracts verified",
    "",
    "---",
    "",
    "## Your Task",
    "",
    "Fill in the scorecard below. For each property:",
    "1. State the score (0, 1, or 2)",
    "2. Give a one-line rationale",
    "3. If you disagree with or want to add to the criteria above, say so explicitly",
    "4. Flag anything that looks hollow, superficial, or missing regardless of the heuristics",
    "",
    "```",
    "| Property        | Score | Rationale |",
    "|---|---|---|",
    "| Self-describing | /2    |           |",
    "| Bounded         | /2    |           |",
    "| Verifiable      | /2    |           |",
    "| Defended        | /2    |           |",
    "| Auditable       | /2    |           |",
    "| Composable      | /2    |           |",
    "| Executable      | /2    |           |",
    "| **Total**       | /14   |           |",
    "```",
    "",
    "After the scorecard, add a **Flags** section for anything the evidence doesn't capture but you",
    "noticed — incoherent spec language, contradictory requirements, test scaffolding that trivially",
    "passes, CNT nodes that exist but are empty, ADRs that are technically Accepted but clearly",
    "placeholder content, etc. These flags don't change the score but tell the practitioner what",
    "to work on that the tooling cannot detect.",
  ].join("\n");
}

// ── Handler ───────────────────────────────────────────────────────────

export async function scoreRubricHandler(
  args: ScoreRubricInput,
): Promise<ToolResult> {
  const evidence = gatherEvidence(args.project_dir);
  const prompt = buildScoringPrompt(args.project_dir, evidence);

  return { content: [{ type: "text", text: prompt }] };
}
