/**
 * Sentinel tree renderer.
 *
 * Instead of one large instruction file, renders a 3-level lazy tree:
 *   Level 0: CLAUDE.md  (~50 lines) — project identity + critical rules + wayfinding
 *   Level 1: .claude/standards/{domain}.md — full block content per domain
 *
 * The AI loads only what the current task requires.
 * Typical task: CLAUDE.md (~50 lines) + 1-2 domain files (50-100 lines each).
 * vs monolithic: 800-2000+ lines loaded regardless of task.
 *
 * Only applies to the "claude" target — other AI assistants receive the full file
 * since they do not support multi-file on-demand loading the same way.
 */

import { renderTemplate } from "./renderer.js";
import type { InstructionBlock } from "../shared/types.js";
import type { RenderContext } from "./renderer.js";
import {
  BLOCK_DOMAIN_MAP,
  DOMAIN_DESCRIPTIONS,
  DOMAIN_ORDER,
} from "./sentinel-domain-map.js";

// ── Types ─────────────────────────────────────────────────────────────

/** A single file produced by the sentinel renderer. */
export interface SentinelFile {
  /** Relative path from project root (e.g., "CLAUDE.md" or ".claude/standards/testing.md"). */
  readonly relativePath: string;
  /** File content ready to write. */
  readonly content: string;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Render the full sentinel tree from composed instruction blocks.
 *
 * Returns an array of files to write:
 * - CLAUDE.md (sentinel, ~50 lines)
 * - .claude/standards/{domain}.md for each domain that has content
 *
 * @param blocks - All composed instruction blocks
 * @param context - Project render context
 * @returns Array of files to write, CLAUDE.md first
 */
export function renderSentinelTree(
  blocks: InstructionBlock[],
  context: RenderContext,
): SentinelFile[] {
  const byDomain = groupBlocksByDomain(blocks);
  const files: SentinelFile[] = [];

  // Generate domain standards files
  const domainsWithContent: Array<{ domain: string; description: string }> = [];

  for (const [domain, domainBlocks] of byDomain) {
    if (domainBlocks.length === 0) continue;

    const content = renderDomainFile(domain, domainBlocks, context);
    files.push({ relativePath: `.claude/standards/${domain}.md`, content });

    const description = DOMAIN_DESCRIPTIONS[domain] ?? domain;
    domainsWithContent.push({ domain, description });
  }

  // Sort domains for consistent wayfinding table order
  domainsWithContent.sort(
    (a, b) =>
      (DOMAIN_ORDER.indexOf(a.domain) ?? 99) -
      (DOMAIN_ORDER.indexOf(b.domain) ?? 99),
  );

  // Generate sentinel CLAUDE.md (prepend so it's first in the list)
  files.unshift({
    relativePath: "CLAUDE.md",
    content: renderSentinelClaudeMd(domainsWithContent, context),
  });

  return files;
}

// ── Private helpers ───────────────────────────────────────────────────

/**
 * Group instruction blocks by domain category using the BLOCK_DOMAIN_MAP.
 * Blocks with unrecognized IDs fall into "protocols" (catch-all).
 */
function groupBlocksByDomain(
  blocks: InstructionBlock[],
): Map<string, InstructionBlock[]> {
  const map = new Map<string, InstructionBlock[]>();

  for (const block of blocks) {
    const domain = BLOCK_DOMAIN_MAP[block.id] ?? "protocols";
    const existing = map.get(domain) ?? [];
    existing.push(block);
    map.set(domain, existing);
  }

  return map;
}

/**
 * Render a single domain standards file.
 * Contains full rendered block content for all blocks in that domain.
 *
 * @param domain - Domain name (used in header comment)
 * @param blocks - Blocks belonging to this domain
 * @param context - Render context for variable substitution
 * @returns File content ready to write
 */
function renderDomainFile(
  domain: string,
  blocks: InstructionBlock[],
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    `<!-- ForgeCraft sentinel: ${domain} | ${date} | npx forgecraft-mcp refresh . --apply to update -->`,
    "",
  ];

  for (const block of blocks) {
    const rendered = renderTemplate(block.content, context).trim();
    if (rendered) {
      lines.push(rendered);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Render the comprehensive CLAUDE.md sentinel (~130 lines).
 *
 * Contains all GS invariants, architecture, code standards, testing protocol,
 * commit protocol, prohibited ops, reading map, and session loop invariant.
 * This is the primary always-loaded file for every AI session.
 *
 * @param _domains - Domains with standards files (for wayfinding footer)
 * @param context - Render context
 * @returns Comprehensive CLAUDE.md content ready to write
 */
function renderSentinelClaudeMd(
  _domains: Array<{ domain: string; description: string }>,
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const tagList =
    context.tags.filter((t) => t !== "UNIVERSAL").join(", ") || "UNIVERSAL";
  const stackLine = inferStackFromTags(context.tags);
  const layerDiagram = buildLayerDiagram(context.tags);
  const folderMap = buildFolderMap(context.tags);

  return [
    `# ${context.projectName} — Architecture Sentinel`,
    `<!-- ForgeCraft sentinel | ${date} | npx forgecraft-mcp refresh . --apply to update -->`,
    ``,
    `> Sentinel of architecture — read automatically every session. Contains inviolable rules.`,
    `> Canonical product source: \`docs/PRD.md\``,
    `> If something contradicts spec, spec wins — raise an ADR.`,
    ``,
    `---`,
    ``,
    `## Project Identity`,
    ``,
    `- **Name**: ${context.projectName}`,
    `- **Tags**: ${tagList}`,
    `- **Stack**: ${stackLine}`,
    ``,
    `---`,
    ``,
    `## The 7 GS Properties (apply to every generated artifact)`,
    ``,
    `1. **Self-describing** — artifacts explain themselves; no implicit human memory.`,
    `2. **Bounded** — files ≤300 lines, functions ≤50 lines, one file = one concern.`,
    `3. **Verifiable** — typecheck + lint + tests are the definition of "done". Never "wrote the file" = "it works".`,
    `4. **Defended** — destructive operations structurally blocked (see \`docs/operation-classification.md\`).`,
    `5. **Auditable** — Conventional Commits + ADRs for every non-trivial decision.`,
    `6. **Composable** — clean architecture, dependencies always inward, explicit interfaces at seams.`,
    `7. **Executable** — tests run against real runtime, not just compilation.`,
    ``,
    `---`,
    ``,
    `## Architecture Layers (dependencies point INWARD ONLY)`,
    ``,
    layerDiagram,
    ``,
    `Rule: a layer never imports from a layer above it. No lateral imports between domains.`,
    `Shared utilities go to a \`shared/\` module — never duplicated across domains.`,
    ``,
    ...buildNavigationModeSection(context.tags),
    ``,
    `## Folder Map — Where to Find Things`,
    ``,
    folderMap,
    ``,
    `---`,
    ``,
    `## Tool Sequencing`,
    ``,
    `> How to approach the most common task types in this project.`,
    `> Fill in the Sequence column after your first few sessions.`,
    ``,
    `| Task type                    | Recommended tool sequence                                      |`,
    `| ---------------------------- | -------------------------------------------------------------- |`,
    `| New feature                  | Read PRD → Read use-cases → Write test → Implement → Commit    |`,
    `| Bug fix                      | Grep for error → Read failing test → Fix → Add regression test |`,
    `| Refactor                     | Read architecture.md → Check layer diagram → Change → Test     |`,
    `| Schema change                | Read data-model.md → Write migration → Regen types → Update UC |`,
    `| <!-- FILL: custom task -->   | <!-- FILL: tool sequence -->                                    |`,
    ``,
    `### Feature Estimation (required before implementing any requested change)`,
    ``,
    `Before writing any code for a new feature or change request:`,
    `1. **Read** the relevant spec section in \`docs/specs/\` or use case in \`docs/use-cases/\``,
    `2. **Identify** all files that will be touched (source, tests, docs)`,
    `3. **Break into sub-tasks** — each sub-task touches ≤3 files and has one clear acceptance criterion`,
    `4. **State the scope boundary** — what this change does NOT touch`,
    `5. **Confirm** with the user before proceeding`,
    ``,
    `This is not optional ceremony. Sub-task granularity prevents context window degradation`,
    `across implementation steps. Each sub-task is a self-contained unit the AI can complete`,
    `without reloading the full spec.`,
    ``,
    `---`,
    ``,
    `## Corrections Log`,
    ``,
    `> Past mistakes by AI assistants on this project. Read before acting to avoid repeating them.`,
    `> Format: \`YYYY-MM-DD | [category] what went wrong and what the correct approach is\``,
    ``,
    `<!-- Log entries go here. Example:`,
    `2026-01-15 | [architecture] Added business logic to a route handler instead of a service — always delegate to service layer`,
    `2026-01-20 | [testing] Mocked the DB in an integration test — use real test DB instead (see docs/test-architecture.md)`,
    `-->`,
    ``,
    `---`,
    ``,
    `## Code Standards`,
    ``,
    `- **Strict typing**: no \`any\` — use \`unknown\` + narrowing.`,
    `- **Explicit return types** on all exported functions.`,
    `- Files ≤300 lines. Functions ≤50 lines. If exceeded, extract.`,
    `- Naming: files \`kebab-case\`, classes/types \`PascalCase\`, variables \`camelCase\`, DB columns \`snake_case\`.`,
    `- No abbreviations except universally known (id, url, http, db, api).`,
    `- Absolute imports with path aliases (\`@/\` → \`src/\`).`,
    ``,
    `---`,
    ``,
    `## Testing Protocol`,
    ``,
    `- **TDD mandatory** for non-trivial logic. Flow: RED → GREEN → REFACTOR with separate commits.`,
    `  - \`test(scope): [RED] description\` — failing test first`,
    `  - \`feat(scope): [GREEN] description\` — minimal implementation`,
    `  - \`refactor(scope): description\` — cleanup`,
    `- **Pre-commit**: run only affected tests (\`vitest run --changed --passWithNoTests\`). Set \`TDD_RED=1\` to bypass for [RED] commits.`,
    `- **Pre-push**: run ALL tests. No exceptions.`,
    `- Coverage: ≥80% global, higher for auth/security modules.`,
    `- Tests are adversarial: \`test_rejects_bad_input\`, \`test_denies_unauthorized\`. Not \`test_basic_flow\`.`,
    `- Test against interfaces, never against internal implementation.`,
    ``,
    `---`,
    ``,
    `## Commit Protocol (Conventional Commits, strict)`,
    ``,
    "```",
    `type(scope): subject`,
    "```",
    ``,
    `- \`type\` ∈ \`feat|fix|refactor|docs|test|chore|perf|build|ci\``,
    `- **Atomic**: one commit = one logical change. No "WIP", "fixes", "asdf".`,
    `- Every commit must pass typecheck + lint + affected tests.`,
    `- A pre-commit hook enforces this; a commit-msg hook validates format + TDD phase.`,
    ``,
    `---`,
    ``,
    `## Prohibited Operations (require explicit confirmation)`,
    ``,
    `See \`docs/operation-classification.md\` for Tier 0–3 classification.`,
    ``,
    `**Blocked without \`FORGECRAFT_ALLOW_DESTRUCTIVE=1\`:**`,
    `- \`DROP TABLE\`, \`TRUNCATE\`, \`DELETE\` without specific \`WHERE\``,
    `- Disabling any security constraint (RLS, auth guards)`,
    `- \`git push --force\` to main/master`,
    `- \`rm -rf\` on src/, docs/, or database paths`,
    `- Hard delete of domain entities (use soft delete / audit log)`,
    ``,
    `**Require human confirmation:**`,
    `- Direct push to main (use PR)`,
    `- Full data resync / backfill operations`,
    `- Schema migrations on production`,
    `- Adding dependencies >100 KB`,
    ``,
    `---`,
    ``,
    `## Reading Map — What to Load Before Touching Code`,
    ``,
    `| When you touch...      | Read first...                                        |`,
    `| ---------------------- | ---------------------------------------------------- |`,
    `| Architecture / layers  | \`docs/architecture.md\`, relevant ADR                 |`,
    `| Data model / schema    | \`docs/data-model.md\`, relevant ADR                   |`,
    `| Business logic / domain| \`docs/PRD.md\` §goals, \`docs/use-cases.md\`            |`,
    `| Any test               | \`docs/test-architecture.md\` or \`docs/use-cases.md\`   |`,
    `| Any ADR concern        | \`.claude/adr/index.md\` → specific ADR                |`,
    `| Quality gates          | \`.claude/gates/index.md\`                             |`,
    ``,
    `---`,
    ``,
    `## Session Loop Invariant (close-of-session gate)`,
    ``,
    `Before closing any session, verify:`,
    ``,
    `1. ✅ Typecheck passes (no errors)`,
    `2. ✅ Lint passes (no warnings promoted to errors)`,
    `3. ✅ Affected tests pass`,
    `4. ✅ If schema changed: types regenerated and staged`,
    `5. ✅ If structural decision: ADR created in \`docs/adrs/\``,
    `6. ✅ Commits are Conventional Commits, atomic`,
    `7. ✅ No dead code, unused imports, or \`console.log\` in production code`,
    `8. ✅ If UC acceptance criteria changed: \`docs/use-cases.md\` updated`,
    ``,
    `If any item fails: document what's open in \`docs/status.md\`.`,
    ``,
    `---`,
    ``,
    `## Navigation`,
    ``,
    `Full standards: \`.claude/index.md\` → \`.claude/core.md\` → \`.claude/standards/\``,
    `ADRs: \`docs/adrs/\` (indexed in \`.claude/adr/index.md\`)`,
    `Quality gates: \`.claude/gates/index.md\``,
    ``,
  ].join("\n");
}

/**
 * Infer the stack description from project tags.
 *
 * @param tags - Project tags
 * @returns Human-readable stack string
 */
function inferStackFromTags(tags: readonly string[]): string {
  if (tags.includes("WEB-NEXT")) return "Next.js 14+ App Router + TypeScript";
  if (tags.includes("WEB-REACT")) return "React + TypeScript + Vite/Next.js";
  if (tags.includes("API")) return "TypeScript/Node.js REST/GraphQL API";
  if (tags.includes("CLI")) return "TypeScript/Node.js CLI";
  if (tags.includes("LIBRARY")) return "TypeScript library";
  if (tags.includes("PYTHON")) return "Python";
  return "TypeScript";
}

/**
 * Build tag-specific layer diagram text.
 *
 * @param tags - Project tags
 * @returns Layer diagram string
 */
function buildLayerDiagram(tags: readonly string[]): string {
  if (tags.includes("WEB-NEXT") || tags.includes("WEB-REACT")) {
    return "UI (App Router) → API Routes → Services → Domain → Repositories → Infrastructure";
  }
  if (tags.includes("API")) {
    return "Routes → Services → Domain → Repositories → Adapters";
  }
  if (tags.includes("CLI")) {
    return "Commands → Services → Domain → Adapters";
  }
  if (tags.includes("LIBRARY")) {
    return "Public API → Core → Adapters";
  }
  return "Entry Points → Services → Domain → Infrastructure";
}

/**
 * Build Navigation Mode declaration (GS WP §6.0) when applicable.
 * Emitted for architecturally disciplined projects where the AI should trust
 * contracts and read interfaces before implementations.
 *
 * @param tags - Project tags
 * @returns Lines to splice into the sentinel, or empty array for minimal projects
 */
function buildNavigationModeSection(tags: readonly string[]): string[] {
  const hasArchDiscipline =
    tags.some((t) =>
      ["WEB-NEXT", "WEB-REACT", "API", "CLI", "LIBRARY"].includes(t),
    ) || tags.includes("UNIVERSAL");

  if (!hasArchDiscipline) return [];

  return [
    `---`,
    ``,
    `## Navigation Mode — How to Read This Codebase`,
    ``,
    `This project follows Clean Architecture with strict layer separation and TDD.`,
    `**The contracts are trustworthy.** Use Navigation Mode accordingly:`,
    ``,
    `- **Read interfaces, not implementations first.** Types and signatures tell you`,
    `  what a module promises — read those before reading the body.`,
    `- **Use-cases drive everything.** Before touching any business logic, read the`,
    `  relevant UC in \`docs/use-cases.md\`. The UC is the spec; the code is derived.`,
    `- **ADRs explain the why.** If you're about to make a structural decision, check`,
    `  \`.claude/adr/index.md\` first — the answer may already exist.`,
    `- **Skip implementation reads when contracts are green.** If tests pass and types`,
    `  compile, you can treat a module as a black box.`,
    `- **Raise an ADR rather than deviating.** If the correct action contradicts the`,
    `  architecture, write an ADR — do not silently break the contract.`,
  ];
}

/**
 * Build tag-specific folder map showing primary directories and their purpose.
 *
 * @param tags - Project tags
 * @returns Markdown code block with folder map
 */
function buildFolderMap(tags: readonly string[]): string {
  if (tags.includes("WEB-NEXT") || tags.includes("WEB-REACT")) {
    return [
      "```",
      "src/app/          — Next.js routes (thin: validation + delegation)",
      "src/components/",
      "  atoms/          — indivisible UI elements",
      "  molecules/      — compositions of 2–5 atoms",
      "  organisms/      — complex UI sections",
      "src/lib/          — domain services, repositories, adapters (one dir per domain)",
      "src/types/        — global types, no `any`",
      "docs/             — PRD, use-cases, architecture, data-model, ADRs",
      "tests/            — mirrors src/ structure",
      ".claude/          — core.md, index.md, hooks/, standards/, skills/",
      "```",
    ].join("\n");
  }
  if (tags.includes("API")) {
    return [
      "```",
      "src/routes/       — request handlers (thin: auth + validation + delegate)",
      "src/services/     — business logic (depends only on interfaces)",
      "src/domain/       — pure domain models and types",
      "src/repositories/ — data access layer",
      "src/adapters/     — external APIs, infrastructure",
      "src/middleware/   — auth, logging, rate limiting",
      "docs/             — PRD, use-cases, architecture, data-model, ADRs",
      "tests/            — mirrors src/ structure",
      ".claude/          — core.md, index.md, hooks/, standards/",
      "```",
    ].join("\n");
  }
  if (tags.includes("CLI")) {
    return [
      "```",
      "src/commands/     — CLI entry points (arg parsing + delegation)",
      "src/services/     — business logic",
      "src/domain/       — domain models",
      "src/adapters/     — file system, external APIs",
      "docs/             — PRD, use-cases, architecture, ADRs",
      "tests/            — mirrors src/ structure",
      ".claude/          — core.md, index.md, hooks/, standards/",
      "```",
    ].join("\n");
  }
  return [
    "```",
    "src/              — source code (organized by domain)",
    "tests/            — test suite (mirrors src/ structure)",
    "docs/             — PRD, use-cases, architecture, data-model, ADRs",
    ".claude/          — core.md (always loaded), index.md, hooks/, standards/",
    "```",
  ].join("\n");
}
