/**
 * extract_adrs_from_spec tool handler.
 *
 * Reads a project specification file and derives ADR stubs from technology
 * decisions described within it. Unlike extract_adrs_from_history (which walks
 * git log for brownfield projects), this tool is for greenfield projects where
 * all architectural decisions are encoded in the spec before implementation begins.
 *
 * Each generated ADR includes the actual spec excerpt as context — making the
 * artifact genuinely derived from the spec, not a generic placeholder.
 */

import { z } from "zod";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

// ── Schema ───────────────────────────────────────────────────────────

export const extractAdrsFromSpecSchema = z.object({
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
  spec_path: z
    .string()
    .optional()
    .describe(
      "Path to the specification file. Auto-detected from docs/PRD.md, docs/TechSpec.md, " +
        "docs/spec.md if omitted.",
    ),
  max_adrs: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum number of ADR files to generate. Default: 10."),
});

export type ExtractAdrsFromSpecInput = z.infer<
  typeof extractAdrsFromSpecSchema
>;

// ── Types ────────────────────────────────────────────────────────────

interface AdrCandidate {
  readonly slug: string;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly consequences: string;
  readonly specExcerpt: string;
}

// ── Spec discovery ───────────────────────────────────────────────────

const SPEC_CANDIDATE_PATHS = [
  "docs/PRD.md",
  "docs/TechSpec.md",
  "docs/tech-spec.md",
  "docs/functional-spec.md",
  "docs/spec.md",
  "SPEC.md",
] as const;

function resolveSpecPath(projectDir: string, specPath?: string): string | null {
  if (specPath) {
    const full =
      specPath.startsWith("/") || specPath.match(/^[A-Za-z]:/)
        ? specPath
        : join(projectDir, specPath);
    return existsSync(full) ? full : null;
  }
  for (const p of SPEC_CANDIDATE_PATHS) {
    const full = join(projectDir, p);
    if (existsSync(full)) return full;
  }
  return null;
}

// ── ADR directory resolution ─────────────────────────────────────────

function resolveAdrDir(projectDir: string): string {
  const active = join(projectDir, "docs", "adrs", "active");
  if (existsSync(active)) return active;
  const legacy = join(projectDir, "docs", "adrs");
  if (existsSync(legacy)) return legacy;
  const adr = join(projectDir, "docs", "adr");
  if (existsSync(adr)) return adr;
  return join(projectDir, "docs", "adrs", "active");
}

function nextAdrNumber(adrDir: string): number {
  if (!existsSync(adrDir)) return 1;
  const files = readdirSync(adrDir).filter(
    (f) => /^\d/.test(f) || /^adr/i.test(f),
  );
  if (files.length === 0) return 1;
  const nums = files
    .map((f) => parseInt(f.replace(/\D.*/, ""), 10))
    .filter((n) => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

function slugExists(adrDir: string, slug: string): boolean {
  if (!existsSync(adrDir)) return false;
  return readdirSync(adrDir).some((f) => f.includes(slug));
}

// ── Spec parsing ─────────────────────────────────────────────────────

/** Extract a section and its content up to the next same-or-higher-level header. */
function extractSection(content: string, headerPattern: RegExp): string | null {
  const match = content.match(headerPattern);
  if (!match || match.index === undefined) return null;

  const start = match.index;
  const level = (match[1] ?? "#").length; // heading level from the hash count
  const afterStart = content.slice(start + match[0].length);

  // Find next header of same or higher level
  const nextHeader = new RegExp(`^#{1,${level}}\\s`, "m");
  const end = afterStart.search(nextHeader);
  return end >= 0
    ? content.slice(start, start + match[0].length + end).trim()
    : content.slice(start).trim();
}

/** Parse table rows from a markdown table section. */
interface TableRow {
  layer: string;
  technology: string;
  notes: string;
}

function parseTechTable(sectionText: string): TableRow[] {
  const rows: TableRow[] = [];
  const lines = sectionText.split("\n");

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells[0]?.match(/^[-:]+$/)) continue; // separator row
    if (
      cells[0]?.toLowerCase() === "layer" ||
      cells[0]?.toLowerCase() === "component"
    )
      continue;

    rows.push({
      layer: cells[0] ?? "",
      technology: cells[1] ?? "",
      notes: cells[2] ?? "",
    });
  }
  return rows;
}

/** Find "decided/chose/adopted X because Y" patterns anywhere in the spec. */
interface ExplicitDecision {
  readonly sentence: string;
  readonly technology: string;
  readonly rationale: string;
}

const DECISION_PATTERNS: RegExp[] = [
  /(?:we\s+)?(?:chose|selected|adopted|use|using|decided\s+(?:on|to\s+use))\s+([\w/+.-]+(?:\s+[\w/+.-]+)?)\s+(?:because|for|over|instead|as)\s+(.{10,120})/gi,
  /([\w/+.-]+)\s+(?:over|instead\s+of)\s+([\w/+.-]+)\s+because\s+(.{10,120})/gi,
];

function extractExplicitDecisions(content: string): ExplicitDecision[] {
  const decisions: ExplicitDecision[] = [];
  for (const pattern of DECISION_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      decisions.push({
        sentence: m[0]!.slice(0, 200).trim(),
        technology: (m[1] ?? "").trim(),
        rationale: (m[2] ?? m[3] ?? "").trim(),
      });
    }
  }
  return decisions.slice(0, 5);
}

// ── ADR candidate builder ─────────────────────────────────────────────

/**
 * Technology clusters: map technology keywords to ADR categories.
 * First matching cluster wins.
 */
const TECH_CLUSTERS: Array<{
  slug: string;
  titleTemplate: (techs: string[]) => string;
  keywords: RegExp;
  category: string;
}> = [
  {
    slug: "ai-integration",
    titleTemplate: (t) => `AI/LLM Integration — ${t.slice(0, 2).join(" + ")}`,
    keywords:
      /\b(openai|anthropic|claude|gpt|llm|langchain|hugging\s?face|embedding|vector|pgvector|rag|ai\s*\/?\s*llm)\b/i,
    category: "AI and LLM integration",
  },
  {
    slug: "auth-strategy",
    titleTemplate: (t) =>
      `Authentication Strategy — ${t.slice(0, 2).join(" + ")}`,
    keywords:
      /\b(jwt|auth|oauth|sso|identity|nextauth|clerk|supabase\s+auth|cognito|auth0|bcrypt|session)\b/i,
    category: "authentication and authorization",
  },
  {
    slug: "database",
    titleTemplate: (t) => `Database Selection — ${t.slice(0, 2).join(" + ")}`,
    keywords:
      /\b(postgresql|mysql|mongodb|redis|sqlite|supabase|prisma|drizzle|typeorm|sequelize|firebase|dynamo|neon|planetscale)\b/i,
    category: "database and persistence",
  },
  {
    slug: "deployment",
    titleTemplate: (t) => `Deployment Strategy — ${t.slice(0, 2).join(" + ")}`,
    keywords:
      /\b(railway|vercel|fly\.io|render|heroku|aws|gcp|azure|docker|kubernetes|k8s|cloudflare|lambda)\b/i,
    category: "deployment and infrastructure",
  },
  {
    slug: "testing-strategy",
    titleTemplate: (t) => `Testing Strategy — ${t.slice(0, 2).join(" + ")}`,
    keywords:
      /\b(vitest|jest|playwright|cypress|testing-library|storybook|mocha|supertest|hurl)\b/i,
    category: "testing tools and approach",
  },
];

const STACK_KEYWORDS =
  /\b(next\.?js|nestjs|express|fastify|react|vue|angular|svelte|nuxt|remix|django|flask|fastapi|rails|spring|laravel|node\.?js|typescript|python|go|rust|java|kotlin)\b/i;

function buildAdrCandidates(
  tableRows: TableRow[],
  explicitDecisions: ExplicitDecision[],
  specExcerpt: string,
  specRelPath: string,
): AdrCandidate[] {
  const candidates: AdrCandidate[] = [];

  // Group table rows by cluster
  const clusterBuckets = new Map<string, TableRow[]>();
  const stackRows: TableRow[] = [];

  for (const row of tableRows) {
    const combined = `${row.layer} ${row.technology} ${row.notes}`;
    let matched = false;
    for (const cluster of TECH_CLUSTERS) {
      if (cluster.keywords.test(combined)) {
        if (!clusterBuckets.has(cluster.slug))
          clusterBuckets.set(cluster.slug, []);
        clusterBuckets.get(cluster.slug)!.push(row);
        matched = true;
        break;
      }
    }
    if (!matched && STACK_KEYWORDS.test(combined)) {
      stackRows.push(row);
    }
  }

  // Stack selection ADR (covers frontend + backend layers not captured by specific clusters)
  const stackEntries = [...stackRows];
  if (stackEntries.length > 0) {
    const techs = stackEntries
      .map((r) => r.technology.split(/[+,]/)[0]!.trim())
      .slice(0, 4);
    const tableMarkdown = stackEntries
      .map((r) => `| ${r.layer} | ${r.technology} | ${r.notes} |`)
      .join("\n");

    candidates.push({
      slug: "stack-selection",
      title: `Stack Selection — ${techs.join(" + ")}`,
      context: [
        `This decision was identified from the project specification (${specRelPath}).`,
        `The following technology layers were declared in the spec:`,
        "",
        "| Layer | Technology | Notes |",
        "|-------|-----------|-------|",
        tableMarkdown,
      ].join("\n"),
      decision: `The project uses ${techs.join(", ")} as stated in the specification.`,
      consequences: [
        "**Positive:** technology choices are explicit and captured before implementation begins.",
        "**Risk:** any deviation from these choices requires a superseding ADR.",
        "**Action:** verify these choices still hold before implementation — update this ADR if the spec was updated after scaffold.",
      ].join("\n"),
      specExcerpt,
    });
  }

  // One ADR per detected cluster
  for (const cluster of TECH_CLUSTERS) {
    const rows = clusterBuckets.get(cluster.slug) ?? [];
    if (rows.length === 0) continue;

    const techs = rows.map((r) => r.technology.split(/[+,]/)[0]!.trim());
    const tableMarkdown = rows
      .map((r) => `| ${r.layer} | ${r.technology} | ${r.notes} |`)
      .join("\n");

    candidates.push({
      slug: cluster.slug,
      title: cluster.titleTemplate(techs),
      context: [
        `This decision concerns ${cluster.category} in this project.`,
        `Source: ${specRelPath}`,
        "",
        "| Layer | Technology | Notes |",
        "|-------|-----------|-------|",
        tableMarkdown,
      ].join("\n"),
      decision: rows
        .map(
          (r) =>
            `- **${r.layer}:** ${r.technology}${r.notes ? ` (${r.notes})` : ""}`,
        )
        .join("\n"),
      consequences: [
        `**Positive:** ${cluster.category} is explicitly documented before implementation.`,
        "**Risk:** changing these choices mid-project requires updating dependent ADRs and tests.",
        "**Action:** verify these choices against current project state.",
      ].join("\n"),
      specExcerpt,
    });
  }

  // One ADR per explicit decision sentence (if not already captured)
  for (const d of explicitDecisions) {
    if (
      candidates.some((c) =>
        c.slug.includes(d.technology.toLowerCase().slice(0, 6)),
      )
    )
      continue;
    candidates.push({
      slug: `decision-${d.technology
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .slice(0, 30)}`,
      title: `Decision — ${d.technology}`,
      context: `Explicitly stated in the specification (${specRelPath}):\n\n> "${d.sentence}"`,
      decision: `${d.technology}: ${d.rationale}`,
      consequences: [
        "**Positive:** explicit decision recorded before implementation.",
        "**Action:** verify this decision is still current.",
      ].join("\n"),
      specExcerpt: d.sentence,
    });
  }

  return candidates;
}

// ── ADR file writer ───────────────────────────────────────────────────

function buildAdrContent(
  num: number,
  candidate: AdrCandidate,
  date: string,
): string {
  const numStr = String(num).padStart(4, "0");
  return [
    `# ADR-${numStr}: ${candidate.title}`,
    "",
    `**Status:** Retroactive`,
    `**Date:** ${date}`,
    `**Deciders:** Project team`,
    `**Source:** Derived from specification`,
    "",
    "---",
    "",
    "## Context",
    "",
    candidate.context,
    "",
    "## Decision",
    "",
    candidate.decision,
    "",
    "## Consequences",
    "",
    candidate.consequences,
    "",
    "## Spec Excerpt",
    "",
    "```",
    candidate.specExcerpt.slice(0, 400).trim(),
    "```",
    "",
    "> This ADR was retroactively recorded from the project specification.",
    "> Review and expand with team context before implementation begins.",
    "",
  ].join("\n");
}

// ── Handler ──────────────────────────────────────────────────────────

export async function extractAdrsFromSpecHandler(
  args: ExtractAdrsFromSpecInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { project_dir, spec_path, max_adrs = 10 } = args;

  const specFile = resolveSpecPath(project_dir, spec_path);
  if (!specFile) {
    return {
      content: [
        {
          type: "text",
          text:
            "No specification file found. Pass `spec_path` or create one of: " +
            SPEC_CANDIDATE_PATHS.join(", "),
        },
      ],
    };
  }

  const specContent = readFileSync(specFile, "utf-8");
  const specRelPath = specFile
    .replace(project_dir.replace(/\\/g, "/"), "")
    .replace(/\\/g, "/")
    .replace(/^\//, "");

  // Find tech stack section
  const techSectionPattern =
    /^(#{1,3})\s+(?:\d+\.\s+)?(?:tech(?:nology)?(?:\s+stack)?|stack|architecture|infrastructure|frameworks?)\s*$/im;
  const techSection = extractSection(specContent, techSectionPattern) ?? "";

  const tableRows = parseTechTable(techSection || specContent.slice(0, 3000));
  const explicitDecisions = extractExplicitDecisions(specContent);

  // Use first 1000 chars of tech section as the common spec excerpt
  const specExcerpt = (techSection || specContent).slice(0, 1000).trim();

  const candidates = buildAdrCandidates(
    tableRows,
    explicitDecisions,
    specExcerpt,
    specRelPath,
  ).slice(0, max_adrs);

  if (candidates.length === 0) {
    return {
      content: [
        {
          type: "text",
          text:
            `No technology decisions detected in ${specRelPath}.\n\n` +
            "ForgeCraft looks for: tech stack tables, bullet lists in architecture sections, " +
            "and explicit 'chose X because Y' language.\n\n" +
            "Consider using `generate_adr` to write ADRs manually from the spec.",
        },
      ],
    };
  }

  const adrDir = resolveAdrDir(project_dir);
  mkdirSync(adrDir, { recursive: true });

  const date = new Date().toISOString().split("T")[0]!;
  const written: string[] = [];
  const skipped: string[] = [];

  let nextNum = nextAdrNumber(adrDir);

  for (const candidate of candidates) {
    if (slugExists(adrDir, candidate.slug)) {
      skipped.push(candidate.slug);
      continue;
    }
    const numStr = String(nextNum).padStart(4, "0");
    const filename = `${numStr}-${candidate.slug}.md`;
    const filepath = join(adrDir, filename);
    writeFileSync(filepath, buildAdrContent(nextNum, candidate, date), "utf-8");
    written.push(filename);
    nextNum++;
  }

  const adrRelDir = adrDir
    .replace(project_dir.replace(/\\/g, "/"), "")
    .replace(/\\/g, "/")
    .replace(/^\//, "");

  const lines = [
    `## ADRs Extracted from Spec`,
    "",
    `**Source:** \`${specRelPath}\``,
    `**Output:** \`${adrRelDir}/\``,
    "",
    written.length > 0
      ? `**Created (${written.length}):**\n${written.map((f) => `- \`${f}\``).join("\n")}`
      : "**Created:** none",
    "",
    skipped.length > 0
      ? `**Skipped (${skipped.length}, already exist):**\n${skipped.map((s) => `- \`${s}\``).join("\n")}`
      : "",
    "",
    "Each ADR contains the spec excerpt as context and is marked **Retroactive**.",
    "Review and expand with team rationale before implementation begins.",
    "",
    "**Next steps:**",
    "1. Open each ADR and confirm the decision is still current",
    "2. Add alternatives considered and rejection rationale",
    "3. Run `check_cascade` — ADRs now satisfy cascade step 4",
  ].filter((l) => l !== undefined);

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
