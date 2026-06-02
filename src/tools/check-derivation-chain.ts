/**
 * check_derivation_chain tool handler.
 *
 * Verifies that spec artifacts form a coherent derivation chain:
 *   PRD → Use Cases → ADRs → L2 Probes → L3/L4 Probes → Gates
 *
 * Checks:
 *   1. PRD / spec artifact present
 *   2. Use cases present and well-formed
 *   3. Each UC has a corresponding L2 probe file
 *   4. Each L2 probe file references its UC ID
 *   5. ADRs exist with meaningful quality (Accepted vs Retroactive ratio)
 *   6. Cross-references: UCs that mention ADR IDs, ADRs that mention UC IDs
 *   7. Gates: at least some reference a UC or ADR ID
 *
 * Emits a chain score (0-100%) and a list of specific breaks.
 * Read-only — no files written.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "../shared/types.js";
import { getActiveProjectGates } from "../shared/project-gates.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface ChainLink {
  readonly name: string;
  readonly score: number; // 0 | 0.5 | 1
  readonly detail: string;
  readonly breaks: string[];
}

export interface DerivationChainReport {
  readonly chainScore: number; // 0-100
  readonly links: ChainLink[];
  readonly breaks: string[];
  readonly strengths: string[];
}

export interface CheckDerivationChainInput {
  readonly project_dir: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
}

/** UC IDs from docs/use-cases/UC-NNN-*.md filenames. */
function readUcIds(projectDir: string): string[] {
  const dir = join(projectDir, "docs", "use-cases");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => /^UC-\d{3}/.test(f))
      .map((f) => /^(UC-\d{3})/.exec(f)?.[1] ?? "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** L2 probe files from tests/harness/. */
function readProbeFiles(projectDir: string): string[] {
  const dirs = [
    join(projectDir, "tests", "harness"),
    join(projectDir, "test", "harness"),
  ];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      try {
        return readdirSync(dir).filter(
          (f) => f.endsWith(".hurl") || f.endsWith(".ts") || f.endsWith(".sh"),
        );
      } catch {
        return [];
      }
    }
  }
  return [];
}

/** ADR files with their status extracted. */
function readAdrStatuses(
  projectDir: string,
): Array<{ file: string; status: string | null }> {
  const canonical = join(projectDir, "docs", "adrs", "active");
  const legacy = join(projectDir, "docs", "adrs");
  const dir = existsSync(canonical) ? canonical : legacy;
  return listMdFiles(dir).map((f) => {
    const content = safeRead(join(dir, f));
    const match = /\*\*Status:\*\*\s*(\w+)/i.exec(content);
    return { file: f, status: match?.[1]?.trim() ?? null };
  });
}

// ── Chain link evaluators ─────────────────────────────────────────────

function checkPrd(projectDir: string): ChainLink {
  const candidates = [
    join(projectDir, "docs", "PRD.md"),
    join(projectDir, "docs", "prd.md"),
    join(projectDir, "docs", "spec.md"),
    join(projectDir, "docs", "SPEC.md"),
    join(projectDir, "README.md"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    return {
      name: "PRD / Spec",
      score: 0,
      detail: "No PRD or spec artifact found",
      breaks: ["Missing docs/PRD.md — root of the derivation chain"],
    };
  }
  const content = safeRead(found);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const relPath = found.replace(projectDir, "").replace(/^[\\/]/, "");
  if (wordCount < 100) {
    return {
      name: "PRD / Spec",
      score: 0.5,
      detail: `${relPath} present but thin (${wordCount} words)`,
      breaks: [
        `${relPath} exists but has only ${wordCount} words — may not be a real spec`,
      ],
    };
  }
  return {
    name: "PRD / Spec",
    score: 1,
    detail: `${relPath} present (${wordCount} words)`,
    breaks: [],
  };
}

function checkUcs(projectDir: string): { link: ChainLink; ucIds: string[] } {
  const ucIds = readUcIds(projectDir);

  // Fall back to monolith use-cases.md
  const monolithPath = join(projectDir, "docs", "use-cases.md");
  if (ucIds.length === 0 && existsSync(monolithPath)) {
    const content = safeRead(monolithPath);
    const matches = content.match(/##\s+UC-\d{3}/g) ?? [];
    if (matches.length > 0) {
      return {
        link: {
          name: "Use Cases",
          score: 0.5,
          detail: `${matches.length} UCs in monolith docs/use-cases.md (split into UC-*.md for full credit)`,
          breaks: [
            "Use cases in monolith format — split into docs/use-cases/UC-*.md for derivation chain tracking",
          ],
        },
        ucIds: matches.map((m) => m.replace(/##\s+/, "").trim()),
      };
    }
  }

  if (ucIds.length === 0) {
    return {
      link: {
        name: "Use Cases",
        score: 0,
        detail: "No use case files found",
        breaks: ["No use cases — add docs/use-cases/UC-NNN-*.md files"],
      },
      ucIds: [],
    };
  }

  return {
    link: {
      name: "Use Cases",
      score: 1,
      detail: `${ucIds.length} UC file(s) in docs/use-cases/`,
      breaks: [],
    },
    ucIds,
  };
}

function checkProbeBinding(projectDir: string, ucIds: string[]): ChainLink {
  const probeFiles = readProbeFiles(projectDir);
  if (ucIds.length === 0) {
    return {
      name: "UC → Probe Binding",
      score: probeFiles.length > 0 ? 0.5 : 0,
      detail:
        probeFiles.length > 0
          ? `${probeFiles.length} probe file(s) exist but no UC IDs to match against`
          : "No UCs and no probe files",
      breaks:
        probeFiles.length > 0
          ? [
              "Probes exist but UC catalog is empty — add UC files to complete the binding",
            ]
          : ["No UC → probe binding — add use cases and harness probes"],
    };
  }

  const boundUcs = ucIds.filter((id) =>
    probeFiles.some((f) => f.toUpperCase().includes(id.toUpperCase())),
  );
  const unboundUcs = ucIds.filter((id) => !boundUcs.includes(id));

  const ratio = boundUcs.length / ucIds.length;
  const score: 0 | 0.5 | 1 = ratio === 1 ? 1 : ratio >= 0.5 ? 0.5 : 0;

  return {
    name: "UC → Probe Binding",
    score,
    detail: `${boundUcs.length}/${ucIds.length} UCs have probe files`,
    breaks: unboundUcs.map(
      (id) => `${id} has no L2 probe — run generate_harness`,
    ),
  };
}

function checkProbeReferences(projectDir: string, ucIds: string[]): ChainLink {
  const probeFiles = readProbeFiles(projectDir);
  if (probeFiles.length === 0) {
    return {
      name: "Probe → UC Back-Reference",
      score: 0,
      detail: "No probe files to check",
      breaks: [],
    };
  }

  const harnessDir = [
    join(projectDir, "tests", "harness"),
    join(projectDir, "test", "harness"),
  ].find(existsSync);

  if (!harnessDir) {
    return {
      name: "Probe → UC Back-Reference",
      score: 0.5,
      detail: "Probe files found but harness directory not located",
      breaks: [],
    };
  }

  const probesWithRef = probeFiles.filter((f) => {
    const content = safeRead(join(harnessDir, f));
    return ucIds.some((id) => content.includes(id));
  });

  const ratio =
    probeFiles.length > 0 ? probesWithRef.length / probeFiles.length : 0;
  const score: 0 | 0.5 | 1 = ratio >= 0.8 ? 1 : ratio >= 0.4 ? 0.5 : 0;

  const unreferencedProbes = probeFiles.filter((f) => {
    const content = safeRead(join(harnessDir, f));
    return !ucIds.some((id) => content.includes(id));
  });

  return {
    name: "Probe → UC Back-Reference",
    score,
    detail: `${probesWithRef.length}/${probeFiles.length} probes reference a UC ID`,
    breaks: unreferencedProbes.map(
      (f) =>
        `${f} does not reference any UC ID — add a comment or header linking it back`,
    ),
  };
}

function checkAdrs(projectDir: string): {
  link: ChainLink;
  adrFiles: string[];
} {
  const adrs = readAdrStatuses(projectDir);
  if (adrs.length === 0) {
    return {
      link: {
        name: "ADRs",
        score: 0,
        detail: "No ADR files found",
        breaks: [
          "No ADRs — run extract_adrs_from_history for brownfield, or generate_adr for new decisions",
        ],
      },
      adrFiles: [],
    };
  }

  const accepted = adrs.filter(
    (a) => a.status?.toLowerCase() === "accepted",
  ).length;
  const retroactive = adrs.filter(
    (a) => a.status?.toLowerCase() === "retroactive",
  ).length;
  const ratio = accepted / adrs.length;
  const score: 0 | 0.5 | 1 = ratio >= 0.7 ? 1 : adrs.length > 0 ? 0.5 : 0;

  const breaks: string[] = [];
  if (retroactive > 0) {
    breaks.push(
      `${retroactive} ADR(s) still Retroactive — run review_stubs to triage and fill them`,
    );
  }

  return {
    link: {
      name: "ADRs",
      score,
      detail: `${adrs.length} ADR(s): ${accepted} Accepted, ${retroactive} Retroactive`,
      breaks,
    },
    adrFiles: adrs.map((a) => a.file),
  };
}

function checkCrossReferences(
  projectDir: string,
  ucIds: string[],
  adrFiles: string[],
): ChainLink {
  if (ucIds.length === 0 || adrFiles.length === 0) {
    return {
      name: "UC ↔ ADR Cross-References",
      score: 0.5,
      detail: "Skipped — no UCs or ADRs to cross-check",
      breaks: [],
    };
  }

  const adrDir = existsSync(join(projectDir, "docs", "adrs", "active"))
    ? join(projectDir, "docs", "adrs", "active")
    : join(projectDir, "docs", "adrs");

  const ucDir = join(projectDir, "docs", "use-cases");

  // ADRs that mention a UC ID
  const anchored = adrFiles.filter((f) => {
    const content = safeRead(join(adrDir, f));
    return ucIds.some((id) => content.includes(id));
  });

  // UCs that mention an ADR ID
  const ucFiles = existsSync(ucDir) ? listMdFiles(ucDir) : [];
  const ucsMentioningAdrs = ucFiles.filter((f) => {
    const content = safeRead(join(ucDir, f));
    return /ADR-\d{4}/i.test(content);
  });

  const anchorRatio = anchored.length / adrFiles.length;
  const score: 0 | 0.5 | 1 =
    anchorRatio >= 0.5 || ucsMentioningAdrs.length > 0 ? 1 : 0.5;

  const breaks: string[] = [];
  if (anchored.length === 0 && ucsMentioningAdrs.length === 0) {
    breaks.push(
      "No cross-references between UCs and ADRs — consider adding ADR IDs to relevant UCs and UC IDs to relevant ADRs",
    );
  }

  return {
    name: "UC ↔ ADR Cross-References",
    score,
    detail: `${anchored.length}/${adrFiles.length} ADRs reference a UC · ${ucsMentioningAdrs.length}/${ucFiles.length} UCs reference an ADR`,
    breaks,
  };
}

function checkGateAnchoring(
  projectDir: string,
  ucIds: string[],
  adrFiles: string[],
): ChainLink {
  let gates: Array<{ id: string; description: string }> = [];
  try {
    gates = getActiveProjectGates(projectDir).map((g) => ({
      id: g.id,
      description: g.description ?? "",
    }));
  } catch {
    return {
      name: "Gates ↔ Spec Anchoring",
      score: 0.5,
      detail: "Could not read active gates",
      breaks: [],
    };
  }

  if (gates.length === 0) {
    return {
      name: "Gates ↔ Spec Anchoring",
      score: 0,
      detail: "No active project gates",
      breaks: [
        "No gates defined — run audit or generate a gate for each error-class spec violation",
      ],
    };
  }

  const adrIds = adrFiles
    .map((f) => /^(\d{4})-/.exec(f)?.[1] ?? "")
    .filter(Boolean);

  const anchored = gates.filter((g) => {
    const searchable = `${g.id} ${g.description}`.toLowerCase();
    return (
      ucIds.some((id) => searchable.includes(id.toLowerCase())) ||
      adrIds.some((id) => searchable.includes(`adr-${id}`.toLowerCase())) ||
      adrIds.some((id) => searchable.includes(id))
    );
  });

  const ratio = anchored.length / gates.length;
  const score: 0 | 0.5 | 1 = ratio >= 0.5 ? 1 : gates.length > 0 ? 0.5 : 0;

  return {
    name: "Gates ↔ Spec Anchoring",
    score,
    detail: `${anchored.length}/${gates.length} gates explicitly reference a UC or ADR`,
    breaks:
      anchored.length === 0
        ? [
            "No gates reference a UC or ADR ID — consider adding UC/ADR references to gate descriptions for full chain traceability",
          ]
        : [],
  };
}

// ── Report builder ────────────────────────────────────────────────────

export function buildDerivationChainReport(
  projectDir: string,
): DerivationChainReport {
  const prdLink = checkPrd(projectDir);
  const { link: ucLink, ucIds } = checkUcs(projectDir);
  const probeBindingLink = checkProbeBinding(projectDir, ucIds);
  const probeRefLink = checkProbeReferences(projectDir, ucIds);
  const { link: adrLink, adrFiles } = checkAdrs(projectDir);
  const crossRefLink = checkCrossReferences(projectDir, ucIds, adrFiles);
  const gateLink = checkGateAnchoring(projectDir, ucIds, adrFiles);

  const links = [
    prdLink,
    ucLink,
    probeBindingLink,
    probeRefLink,
    adrLink,
    crossRefLink,
    gateLink,
  ];

  const totalScore = links.reduce((sum, l) => sum + l.score, 0);
  const chainScore = Math.round((totalScore / links.length) * 100);

  const breaks = links.flatMap((l) => l.breaks);
  const strengths = links
    .filter((l) => l.score === 1 && l.breaks.length === 0)
    .map((l) => l.name);

  return { chainScore, links, breaks, strengths };
}

// ── Handler ───────────────────────────────────────────────────────────

export async function checkDerivationChainHandler(
  args: CheckDerivationChainInput,
): Promise<ToolResult> {
  const report = buildDerivationChainReport(args.project_dir);

  const scoreLabel =
    report.chainScore >= 80
      ? "Strong"
      : report.chainScore >= 50
        ? "Partial"
        : "Weak";

  const lines: string[] = [
    "## Derivation Chain Report",
    "",
    `Chain: PRD → Use Cases → ADRs → L2 Probes → L3/L4 Probes → Gates`,
    "",
    `**Chain Score: ${report.chainScore}% — ${scoreLabel}**`,
    "",
    "### Link-by-Link",
    "",
  ];

  for (const link of report.links) {
    const icon = link.score === 1 ? "✅" : link.score === 0.5 ? "⚠️" : "⛔";
    lines.push(`${icon} **${link.name}** — ${link.detail}`);
    for (const b of link.breaks) {
      lines.push(`   → ${b}`);
    }
  }

  lines.push("");

  if (report.strengths.length > 0) {
    lines.push("### Strengths", "");
    for (const s of report.strengths) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (report.breaks.length > 0) {
    lines.push("### Chain Breaks to Resolve", "");
    for (const b of report.breaks) {
      lines.push(`- ${b}`);
    }
    lines.push("");
  }

  lines.push(
    "### What a complete chain looks like",
    "",
    "Each UC in docs/use-cases/ should:",
    "1. Trace to at least one `docs/adrs/active/*.md` (for significant design choices)",
    "2. Have a probe in `tests/harness/UC-NNN-*`",
    "3. Have the probe reference its UC ID as a comment or metadata header",
    "",
    "Each gate should mention the UC or ADR it defends against regression.",
    "",
    "Run `check_derivation_chain` again after resolving breaks to track progress.",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
