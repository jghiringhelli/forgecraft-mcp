/**
 * propose_session tool handler.
 *
 * Produces a pre-implementation impact assessment before generate_session_prompt runs.
 * Adapted from OpenSpec's Propose phase, extended with forgecraft's layer-awareness.
 *
 * Output: which specs will change (ADDED/MODIFIED), which layers are affected,
 * which gates must pass before close_cycle, and an implementation checklist.
 * Writes .forgecraft/proposal.md as a persistent artifact.
 */

import { z } from "zod";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { ToolResult } from "../shared/types.js";
import { parseUseCases } from "./layer-status.js";
import { detectClarificationMarkers } from "./session-prompt-builders.js";

// ── Schema ────────────────────────────────────────────────────────────

export const proposeSessionSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  item_description: z
    .string()
    .min(10)
    .optional()
    .describe(
      "What this session should build or fix. One sentence with actor, behavior, and postcondition.",
    ),
  roadmap_item_id: z
    .string()
    .optional()
    .describe(
      "Roadmap item ID to propose for (e.g. 'RM-001'). Reads title from docs/roadmap.md.",
    ),
});

export type ProposeSessionInput = z.infer<typeof proposeSessionSchema>;

// ── Types ─────────────────────────────────────────────────────────────

type SpecDeltaChange = "ADDED" | "MODIFIED" | "REMOVED";

interface SpecDelta {
  readonly artifact: string;
  readonly change: SpecDeltaChange;
  readonly reason: string;
}

interface GateRequirement {
  readonly gateId: string;
  readonly description: string;
  readonly priority: string;
  readonly layer: string;
}

// ── Handler ──────────────────────────────────────────────────────────

export async function proposeSessionHandler(
  args: ProposeSessionInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);

  let itemDescription = args.item_description;
  if (!itemDescription && args.roadmap_item_id) {
    itemDescription =
      resolveRoadmapTitle(projectDir, args.roadmap_item_id) ?? undefined;
  }

  if (!itemDescription) {
    return {
      content: [
        {
          type: "text",
          text: "## Proposal Blocked\n\nProvide `item_description` or a valid `roadmap_item_id`.",
        },
      ],
    };
  }

  const useCases = loadUseCases(projectDir);
  const relatedUcIds = matchRelatedUcs(itemDescription, useCases);
  const specDelta = buildSpecDelta(
    projectDir,
    itemDescription,
    relatedUcIds,
    useCases,
  );
  const gateRequirements = loadRequiredGates(projectDir);
  const clarifications = detectClarificationMarkers(projectDir);
  const layerSummary = buildLayerSummary(projectDir, relatedUcIds, useCases);
  const checklist = buildChecklist(
    projectDir,
    itemDescription,
    specDelta,
    relatedUcIds,
  );

  const proposal = renderProposal({
    projectDir,
    itemDescription,
    specDelta,
    layerSummary,
    gateRequirements,
    clarifications,
    checklist,
  });

  const forgecraftDir = join(projectDir, ".forgecraft");
  mkdirSync(forgecraftDir, { recursive: true });
  writeFileSync(join(forgecraftDir, "proposal.md"), proposal, "utf-8");

  return { content: [{ type: "text", text: proposal }] };
}

// ── Use Case Matching ─────────────────────────────────────────────────

function loadUseCases(
  projectDir: string,
): Array<{ id: string; title: string }> {
  const path = join(projectDir, "docs", "use-cases.md");
  if (!existsSync(path)) return [];
  try {
    return parseUseCases(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function matchRelatedUcs(
  description: string,
  ucs: Array<{ id: string; title: string }>,
): string[] {
  if (ucs.length === 0) return [];
  const lower = description.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 3);
  return ucs
    .filter((uc) => {
      const title = uc.title.toLowerCase();
      return words.some((w) => title.includes(w));
    })
    .map((uc) => uc.id);
}

// ── Spec Delta ────────────────────────────────────────────────────────

function buildSpecDelta(
  projectDir: string,
  description: string,
  relatedUcIds: string[],
  ucs: Array<{ id: string; title: string }>,
): SpecDelta[] {
  const deltas: SpecDelta[] = [];

  // Use cases
  if (existsSync(join(projectDir, "docs", "use-cases.md"))) {
    if (relatedUcIds.length > 0) {
      deltas.push({
        artifact: "docs/use-cases.md",
        change: "MODIFIED",
        reason: `Affects use case(s): ${relatedUcIds.join(", ")}`,
      });
    } else if (ucs.length > 0) {
      deltas.push({
        artifact: "docs/use-cases.md",
        change: "MODIFIED",
        reason: "May require a new use case entry for this session",
      });
    }
  } else {
    deltas.push({
      artifact: "docs/use-cases.md",
      change: "ADDED",
      reason: "Use cases file does not exist — create before implementing",
    });
  }

  // PRD
  if (!existsSync(join(projectDir, "docs", "PRD.md"))) {
    deltas.push({
      artifact: "docs/PRD.md",
      change: "ADDED",
      reason: "Product requirements not found — run setup_project",
    });
  } else {
    deltas.push({
      artifact: "docs/PRD.md",
      change: "MODIFIED",
      reason: "Requirement coverage may need updating after session",
    });
  }

  // ADR — check if a related ADR likely exists
  const adrHint = needsAdr(description);
  if (adrHint) {
    deltas.push({
      artifact: "docs/adrs/NNNN-<decision-slug>.md",
      change: "ADDED",
      reason: adrHint,
    });
  }

  // Session prompt
  deltas.push({
    artifact: ".forgecraft/proposal.md",
    change: "ADDED",
    reason: "This proposal (written now)",
  });

  return deltas;
}

function needsAdr(description: string): string | null {
  const triggers = [
    ["database", "DB", "storage", "schema", "migration"],
    ["auth", "authentication", "authorization", "JWT", "token"],
    ["api", "endpoint", "REST", "GraphQL", "gRPC"],
    ["cache", "Redis", "CDN"],
    ["queue", "event", "message", "Kafka", "SQS"],
    ["deploy", "infrastructure", "IaC", "container", "Docker", "Kubernetes"],
  ];
  const lower = description.toLowerCase();
  for (const group of triggers) {
    if (group.some((kw) => lower.includes(kw.toLowerCase()))) {
      return `Decision involves ${group[0]} — likely needs an ADR before committing`;
    }
  }
  return null;
}

// ── Gate Loading ──────────────────────────────────────────────────────

function loadRequiredGates(projectDir: string): GateRequirement[] {
  const dirs = [
    join(projectDir, ".forgecraft", "gates", "active"),
    join(projectDir, ".forgecraft", "gates", "project", "active"),
  ];
  const gates: GateRequirement[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".yaml"))) {
        const gate = parseGateYaml(join(dir, f));
        if (gate) gates.push(gate);
      }
    } catch {
      /* skip */
    }
  }
  return gates;
}

function parseGateYaml(filePath: string): GateRequirement | null {
  try {
    const text = readFileSync(filePath, "utf-8");
    const id = /^id:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
    const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
    const priority = /^priority:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "P2";
    const layer = /^layer:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "L1";
    if (!id) return null;
    return { gateId: id, description, priority, layer };
  } catch {
    return null;
  }
}

// ── Layer Summary ─────────────────────────────────────────────────────

interface LayerLine {
  readonly ucId: string;
  readonly title: string;
  readonly l1: string;
  readonly l2: string;
  readonly l3: string;
  readonly l4: string;
}

function buildLayerSummary(
  projectDir: string,
  relatedUcIds: string[],
  ucs: Array<{ id: string; title: string }>,
): LayerLine[] {
  const harnessDir = join(projectDir, "tests", "harness");
  const envDir = join(projectDir, "tests", "env");
  const sloDir = join(projectDir, "tests", "slo");

  const candidates =
    relatedUcIds.length > 0
      ? ucs.filter((uc) => relatedUcIds.includes(uc.id))
      : ucs.slice(0, 5); // show first 5 if no match

  return candidates.map((uc) => {
    const lower = uc.id.toLowerCase().replace(/_/g, "-");
    const l2 =
      existsSync(harnessDir) &&
      readdirSync(harnessDir).some((f) => f.toLowerCase().startsWith(lower))
        ? "✅ probes found"
        : "❌ no probes";
    const l3 =
      existsSync(envDir) &&
      readdirSync(envDir).some((f) => f.toLowerCase().startsWith(lower))
        ? "✅ env probes"
        : "—";
    const l4 =
      existsSync(sloDir) &&
      readdirSync(sloDir).some((f) => f.toLowerCase().startsWith(lower))
        ? "✅ slo probes"
        : "—";
    const l1 = existsSync(join(projectDir, "docs", "use-cases.md"))
      ? "✅ use case"
      : "❌ missing";
    return { ucId: uc.id, title: uc.title, l1, l2, l3, l4 };
  });
}

// ── Checklist ─────────────────────────────────────────────────────────

function buildChecklist(
  projectDir: string,
  _description: string,
  specDelta: SpecDelta[],
  relatedUcIds: string[],
): string[] {
  const items: string[] = [];

  // Cascade check
  items.push(
    "Run `check_cascade` — all 5 steps must be complete before starting",
  );

  // Clarifications
  items.push("Resolve all `[NEEDS CLARIFICATION]` markers in spec artifacts");

  // Spec updates
  const added = specDelta.filter((d) => d.change === "ADDED");
  if (added.length > 0) {
    for (const d of added) {
      items.push(`Create missing artifact: \`${d.artifact}\` — ${d.reason}`);
    }
  }

  // Harness
  if (relatedUcIds.length > 0) {
    items.push(
      `Run \`generate_harness\` for affected use cases: ${relatedUcIds.join(", ")}`,
    );
    items.push("Implement harness probe TODO sections before closing");
  }

  // TDD loop
  items.push("Write failing probes first, then implement until green");
  items.push(
    "Run `run_harness` — all L2 probes must pass before `close_cycle`",
  );

  // Env / infra check
  if (existsSync(join(projectDir, "tests", "env"))) {
    items.push(
      "Run `run_env_probe` — L3 env contracts must hold after changes",
    );
  }

  // Close
  items.push(
    "Run `close_cycle` — evaluates all gates and writes `.claude/state.md`",
  );
  items.push("Update `Status.md` with completed changes and next steps");

  return items;
}

// ── Roadmap Resolution ────────────────────────────────────────────────

function resolveRoadmapTitle(
  projectDir: string,
  itemId: string,
): string | null {
  const path = join(projectDir, "docs", "roadmap.md");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf-8");
  const re = new RegExp(`\\|\\s*${itemId}\\s*\\|[^|]+\\|([^|]+)\\|`);
  const m = re.exec(text);
  return m ? (m[1]?.trim() ?? null) : null;
}

// ── Renderer ──────────────────────────────────────────────────────────

interface ProposalInput {
  readonly projectDir: string;
  readonly itemDescription: string;
  readonly specDelta: SpecDelta[];
  readonly layerSummary: LayerLine[];
  readonly gateRequirements: GateRequirement[];
  readonly clarifications: Array<{ file: string; marker: string }>;
  readonly checklist: string[];
}

function renderProposal(input: ProposalInput): string {
  const {
    itemDescription,
    specDelta,
    layerSummary,
    gateRequirements,
    clarifications,
    checklist,
  } = input;
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(
    `# Session Proposal`,
    ``,
    `**Date:** ${date}`,
    `**Scope:** ${itemDescription}`,
    ``,
  );
  lines.push(`> This proposal is a pre-implementation impact assessment.`);
  lines.push(
    `> Resolve all blockers, then run \`generate_session_prompt\` to commit to implementation.`,
    ``,
  );

  // Spec delta
  lines.push(`## Spec Delta`, ``);
  lines.push(`| Artifact | Change | Reason |`, `|---|---|---|`);
  for (const d of specDelta) {
    const badge =
      d.change === "ADDED"
        ? "🆕 ADDED"
        : d.change === "MODIFIED"
          ? "✏️ MODIFIED"
          : "🗑 REMOVED";
    lines.push(`| \`${d.artifact}\` | ${badge} | ${d.reason} |`);
  }
  lines.push(``);

  // Layer readiness
  if (layerSummary.length > 0) {
    lines.push(`## Layer Readiness — Affected Use Cases`, ``);
    lines.push(
      `| UC | Title | L1 Spec | L2 Probes | L3 Env | L4 SLO |`,
      `|---|---|---|---|---|---|`,
    );
    for (const r of layerSummary) {
      lines.push(
        `| ${r.ucId} | ${r.title} | ${r.l1} | ${r.l2} | ${r.l3} | ${r.l4} |`,
      );
    }
    lines.push(``);
  } else {
    lines.push(
      `## Layer Readiness`,
      ``,
      `_No use cases found. Run \`setup_project\` to create the spec foundation._`,
      ``,
    );
  }

  // Clarifications
  if (clarifications.length > 0) {
    lines.push(
      `## ⚠️ Unresolved Clarifications — Must Resolve Before Session`,
      ``,
    );
    lines.push(`| File | Marker |`, `|---|---|`);
    for (const c of clarifications) {
      lines.push(`| \`${c.file}\` | ${c.marker} |`);
    }
    lines.push(
      ``,
      `Resolve these before running \`generate_session_prompt\`.`,
      ``,
    );
  }

  // Gates
  if (gateRequirements.length > 0) {
    lines.push(`## Gates That Must Pass Before \`close_cycle\``, ``);
    lines.push(
      `| Gate ID | Layer | Priority | Description |`,
      `|---|---|---|---|`,
    );
    for (const g of gateRequirements) {
      lines.push(
        `| ${g.gateId} | ${g.layer} | ${g.priority} | ${g.description} |`,
      );
    }
    lines.push(``);
  }

  // Checklist
  lines.push(`## Pre-Implementation Checklist`, ``);
  for (const item of checklist) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(
    `_Proposal written to \`.forgecraft/proposal.md\`. Run \`generate_session_prompt\` when ready to commit._`,
  );

  return lines.join("\n");
}
