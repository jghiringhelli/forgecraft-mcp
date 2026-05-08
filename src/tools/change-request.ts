/**
 * change_request and list_changes handlers.
 *
 * change_request: Opens a formal change record in .forgecraft/changes/<slug>.yaml.
 * Captures intent, auto-detects affected artifacts, and lists gates that must pass.
 *
 * list_changes: Surfaces open/implementing/blocked changes with staleness flags.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { ToolResult } from "../shared/types.js";

// ── Types ─────────────────────────────────────────────────────────────

export type ChangeType =
  | "spec-change"
  | "breaking-api"
  | "adr-supersession"
  | "gate-change"
  | "dependency-update";

export type ChangeStatus =
  | "open"
  | "implementing"
  | "blocked"
  | "verified"
  | "closed";

export interface ChangeRecord {
  readonly id: string;
  readonly title: string;
  readonly status: ChangeStatus;
  readonly type: ChangeType;
  readonly created: string;
  readonly description: string;
  readonly breaking: boolean;
  readonly breaking_details?: string;
  readonly affected_artifacts: string[];
  readonly supersedes_adr?: string;
  readonly required_gates: string[];
  readonly blocked_reason?: string;
  readonly verified_at?: string;
  readonly closed_at?: string;
}

// ── Inputs ────────────────────────────────────────────────────────────

export interface ChangeRequestInput {
  readonly project_dir: string;
  readonly title: string;
  readonly description: string;
  readonly type: ChangeType;
  readonly breaking?: boolean;
  readonly breaking_details?: string;
  readonly supersedes_adr?: string;
  readonly affected_artifacts?: string[];
}

export interface ListChangesInput {
  readonly project_dir: string;
  readonly status?: ChangeStatus | "all";
}

// ── Slug generation ───────────────────────────────────────────────────

export function slugify(title: string, date: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `chg-${date}-${slug}`;
}

// ── Artifact detection ────────────────────────────────────────────────

export function detectAffectedArtifacts(
  projectDir: string,
  title: string,
  description: string,
  type: ChangeType,
): string[] {
  const artifacts: string[] = [];
  const words = `${title} ${description}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const specFiles: Array<[string, string[]]> = [
    ["docs/PRD.md", ["requirement", "product", "feature", "user", "problem"]],
    ["docs/use-cases.md", ["use case", "actor", "workflow", "uc-", "flow"]],
    [
      "docs/TechSpec.md",
      ["architecture", "implementation", "component", "system"],
    ],
  ];

  for (const [path, keywords] of specFiles) {
    if (!existsSync(join(projectDir, path))) continue;
    const hits = keywords.filter((kw) =>
      words.some((w) => w.includes(kw.replace(/\s+/, ""))),
    );
    if (hits.length > 0 || type === "spec-change") {
      artifacts.push(path);
    }
  }

  // Always include PRD if spec-change type
  if (type === "spec-change" && !artifacts.includes("docs/PRD.md")) {
    if (existsSync(join(projectDir, "docs", "PRD.md"))) {
      artifacts.push("docs/PRD.md");
    }
  }

  // ADR supersession
  if (
    type === "adr-supersession" ||
    words.some((w) => ["adr", "decision", "architecture"].includes(w))
  ) {
    const adrDir = join(projectDir, "docs", "adrs");
    if (existsSync(adrDir)) {
      artifacts.push("docs/adrs/");
    }
  }

  // Breaking API — flag schema and contract files
  if (type === "breaking-api") {
    for (const p of ["docs/schema.md", "openapi.yaml", "openapi.json"]) {
      if (existsSync(join(projectDir, p))) artifacts.push(p);
    }
  }

  return [...new Set(artifacts)];
}

// ── Gate detection ────────────────────────────────────────────────────

export function detectRequiredGates(
  projectDir: string,
  type: ChangeType,
  breaking: boolean,
): string[] {
  const gates: string[] = [];

  const gateDir = join(projectDir, ".forgecraft", "gates", "active");
  if (!existsSync(gateDir)) return gates;

  const allGateIds = readdirSync(gateDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      try {
        const text = readFileSync(join(gateDir, f), "utf-8");
        return /^id:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  // Always include L2 coverage gate if present
  for (const id of allGateIds) {
    if (id.startsWith("l2-") || id === "contract-testing-required") {
      gates.push(id);
    }
  }

  // Breaking API changes must pass schema and contract gates
  if (breaking || type === "breaking-api") {
    for (const id of allGateIds) {
      if (id.includes("schema") || id.includes("contract")) {
        if (!gates.includes(id)) gates.push(id);
      }
    }
  }

  return gates;
}

// ── YAML serialization ────────────────────────────────────────────────

export function serializeChangeRecord(record: ChangeRecord): string {
  const lines: string[] = [
    `id: ${record.id}`,
    `title: "${record.title.replace(/"/g, '\\"')}"`,
    `status: ${record.status}`,
    `type: ${record.type}`,
    `created: ${record.created}`,
    `breaking: ${record.breaking}`,
    ``,
    `description: >`,
    ...record.description.split("\n").map((l) => `  ${l}`),
    ``,
  ];

  if (record.breaking_details) {
    lines.push(
      `breaking_details: "${record.breaking_details.replace(/"/g, '\\"')}"`,
      ``,
    );
  }

  if (record.supersedes_adr) {
    lines.push(`supersedes_adr: ${record.supersedes_adr}`, ``);
  }

  lines.push(`affected_artifacts:`);
  for (const a of record.affected_artifacts) {
    lines.push(`  - ${a}`);
  }
  lines.push(``);

  lines.push(`required_gates:`);
  if (record.required_gates.length === 0) {
    lines.push(`  []`);
  } else {
    for (const g of record.required_gates) {
      lines.push(`  - ${g}`);
    }
  }
  lines.push(``);

  lines.push(`blocked_reason: ~`);
  lines.push(`verified_at: ~`);
  lines.push(`closed_at: ~`);

  return lines.join("\n");
}

// ── YAML parsing ──────────────────────────────────────────────────────

export function parseChangeRecord(
  content: string,
  id: string,
): ChangeRecord | null {
  try {
    const fieldRe = (key: string) =>
      new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m")
        .exec(content)?.[1]
        ?.trim() ?? "";

    const status = (fieldRe("status") as ChangeStatus) || "open";
    const type = (fieldRe("type") as ChangeType) || "spec-change";
    const title = fieldRe("title");
    const created = fieldRe("created");
    const breaking = fieldRe("breaking") === "true";
    const breaking_details = fieldRe("breaking_details") || undefined;
    const supersedes_adr = fieldRe("supersedes_adr") || undefined;
    const blocked_reason =
      fieldRe("blocked_reason") !== "~" ? fieldRe("blocked_reason") : undefined;
    const verified_at =
      fieldRe("verified_at") !== "~" ? fieldRe("verified_at") : undefined;
    const closed_at =
      fieldRe("closed_at") !== "~" ? fieldRe("closed_at") : undefined;

    // Parse list fields
    const parseList = (key: string): string[] => {
      const match = new RegExp(`^${key}:\\n((?:\\s+-.+\\n?)+)`, "m").exec(
        content,
      );
      if (!match) return [];
      return match[1]!
        .split("\n")
        .map((l) => l.replace(/^\s+-\s*/, "").trim())
        .filter(Boolean);
    };

    const affected_artifacts = parseList("affected_artifacts");
    const required_gates = parseList("required_gates");

    // Extract description (block scalar)
    const descMatch = /^description:\s*>\n((?:\s{2}.+\n?)+)/m.exec(content);
    const description = descMatch
      ? descMatch[1]!
          .split("\n")
          .map((l) => l.replace(/^\s{2}/, ""))
          .join("\n")
          .trim()
      : "";

    return {
      id,
      title,
      status,
      type,
      created,
      description,
      breaking,
      breaking_details,
      supersedes_adr,
      affected_artifacts,
      required_gates,
      blocked_reason,
      verified_at,
      closed_at,
    };
  } catch {
    return null;
  }
}

// ── Change directory helpers ──────────────────────────────────────────

const CHANGES_DIR = ".forgecraft/changes";

export function changesDir(projectDir: string): string {
  return join(projectDir, CHANGES_DIR);
}

export function loadAllChanges(projectDir: string): ChangeRecord[] {
  const dir = changesDir(projectDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      try {
        const content = readFileSync(join(dir, f), "utf-8");
        const id = f.replace(/\.yaml$/, "");
        return parseChangeRecord(content, id);
      } catch {
        return null;
      }
    })
    .filter((r): r is ChangeRecord => r !== null);
}

/** Returns changes in implementing status — used by close_cycle gate. */
export function getImplementingChanges(projectDir: string): ChangeRecord[] {
  return loadAllChanges(projectDir).filter((c) => c.status === "implementing");
}

// ── Handlers ──────────────────────────────────────────────────────────

export async function changeRequestHandler(
  args: ChangeRequestInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const date = new Date().toISOString().slice(0, 10);
  const id = slugify(args.title, date);

  const affectedArtifacts =
    args.affected_artifacts && args.affected_artifacts.length > 0
      ? args.affected_artifacts
      : detectAffectedArtifacts(
          projectDir,
          args.title,
          args.description,
          args.type,
        );

  const requiredGates = detectRequiredGates(
    projectDir,
    args.type,
    args.breaking ?? false,
  );

  const record: ChangeRecord = {
    id,
    title: args.title,
    status: "open",
    type: args.type,
    created: date,
    description: args.description,
    breaking: args.breaking ?? false,
    breaking_details: args.breaking_details,
    supersedes_adr: args.supersedes_adr,
    affected_artifacts: affectedArtifacts,
    required_gates: requiredGates,
  };

  const dir = changesDir(projectDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.yaml`),
    serializeChangeRecord(record),
    "utf-8",
  );

  const lines: string[] = [
    `## Change Request Opened`,
    ``,
    `**ID:** \`${id}\``,
    `**Title:** ${record.title}`,
    `**Type:** ${record.type}`,
    `**Breaking:** ${record.breaking ? "⚠️ Yes" : "No"}`,
    ``,
  ];

  if (record.breaking_details) {
    lines.push(`> ⚠️ **Breaking:** ${record.breaking_details}`, ``);
  }

  if (record.supersedes_adr) {
    lines.push(
      `> Supersedes: \`${record.supersedes_adr}\` — update that ADR's status to Superseded.`,
      ``,
    );
  }

  lines.push(`### Affected Artifacts`, ``);
  for (const a of record.affected_artifacts) {
    lines.push(`- \`${a}\``);
  }
  lines.push(``);

  if (record.required_gates.length > 0) {
    lines.push(`### Required Gates (must pass before \`close_cycle\`)`, ``);
    for (const g of record.required_gates) {
      lines.push(`- [ ] \`${g}\``);
    }
    lines.push(``);
  }

  lines.push(
    `### Next Steps`,
    ``,
    `1. Update status to \`implementing\` when work starts (edit \`.forgecraft/changes/${id}.yaml\`)`,
    `2. Run \`propose_session\` to get a full implementation plan`,
    `3. After implementation: run required gates, set status to \`verified\``,
    `4. Run \`close_cycle\` — blocked until all implementing changes are verified or closed`,
    ``,
    `---`,
    `_Written to \`.forgecraft/changes/${id}.yaml\`_`,
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export async function listChangesHandler(
  args: ListChangesInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const filterStatus = args.status ?? "all";
  const all = loadAllChanges(projectDir);

  const filtered =
    filterStatus === "all" ? all : all.filter((c) => c.status === filterStatus);

  if (filtered.length === 0) {
    const msg =
      filterStatus === "all"
        ? "No change records found. Run `change_request` to open the first change."
        : `No changes with status \`${filterStatus}\`.`;
    return { content: [{ type: "text", text: `## Changes\n\n${msg}` }] };
  }

  const today = new Date().toISOString().slice(0, 10);

  const statusGroups: Record<ChangeStatus, ChangeRecord[]> = {
    open: [],
    implementing: [],
    blocked: [],
    verified: [],
    closed: [],
  };

  for (const c of filtered) {
    statusGroups[c.status].push(c);
  }

  const lines: string[] = [`## Changes (${filtered.length} total)`, ``];

  const order: ChangeStatus[] = [
    "implementing",
    "blocked",
    "open",
    "verified",
    "closed",
  ];
  for (const status of order) {
    const group = statusGroups[status];
    if (group.length === 0) continue;

    const emoji: Record<ChangeStatus, string> = {
      implementing: "🔄",
      blocked: "⛔",
      open: "📋",
      verified: "✅",
      closed: "🔒",
    };

    lines.push(
      `### ${emoji[status]} ${status.charAt(0).toUpperCase() + status.slice(1)} (${group.length})`,
      ``,
    );
    lines.push(`| ID | Title | Type | Breaking | Gates | Created |`);
    lines.push(`|---|---|---|---|---|---|`);

    for (const c of group) {
      const staleFlag = isStale(c, today) ? " ⚠️ stale" : "";
      const breaking = c.breaking ? "⚠️ Yes" : "No";
      const gates =
        c.required_gates.length > 0 ? c.required_gates.length.toString() : "—";
      lines.push(
        `| \`${c.id}\` | ${c.title}${staleFlag} | ${c.type} | ${breaking} | ${gates} | ${c.created} |`,
      );
    }
    lines.push(``);
  }

  const implementing = statusGroups["implementing"];
  if (implementing.length > 0) {
    lines.push(
      `### ⚠️ close_cycle will be blocked until these are resolved:`,
      ``,
    );
    for (const c of implementing) {
      lines.push(`- \`${c.id}\` — ${c.title}`);
      if (c.required_gates.length > 0) {
        lines.push(
          `  Gates: ${c.required_gates.map((g) => `\`${g}\``).join(", ")}`,
        );
      }
    }
    lines.push(``);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ── Staleness ─────────────────────────────────────────────────────────

function isStale(record: ChangeRecord, today: string): boolean {
  if (record.status === "closed" || record.status === "verified") return false;
  try {
    const created = new Date(record.created);
    const now = new Date(today);
    const days = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return days > 7;
  } catch {
    return false;
  }
}
