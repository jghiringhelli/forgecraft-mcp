/**
 * Sentinel tree renderer.
 *
 * Generates a multi-file Contextual Navigation Tree (CNT):
 *
 *   CLAUDE.md                   — root (≤80 lines): project identity + routing only
 *   .claude/constitution.md     — non-negotiables: SOLID, invariants, prohibited ops
 *   .claude/lifecycle.md        — GS cascade, feature estimation, tool sequencing, session loop
 *   .claude/routes/code.md      — where code lives: folder map, naming, module protocol
 *   .claude/routes/docs.md      — where docs live: nav mode, doc map, reading order
 *   .claude/corrections.md      — corrections log stub (read before acting)
 *   .claude/standards/{domain}  — full domain standards (loaded only when relevant)
 *
 * The root CLAUDE.md is the routing layer. It loads the always-load files and tells
 * the AI exactly which branch to load for each task type. No branch is loaded unless
 * relevant — this is how the CNT prevents context window degradation.
 *
 * Only applies to the "claude" target — other AI assistants receive the full file.
 */

import { renderTemplate, compactifyContent } from "./renderer.js";
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

    // "reference" domain: GS theory — written outside the session-loaded tree.
    // Background reading for humans; the routing table never points here.
    // This is the harness-budget defense: theory must not displace the task.
    if (domain === "reference") {
      files.push({
        relativePath: ".claude/reference/gs-theory.md",
        content: renderReferenceFile(domainBlocks, context),
      });
      continue;
    }

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

  // Generate CNT branch files
  files.push({
    relativePath: ".claude/constitution.md",
    content: buildConstitutionFile(context),
  });
  files.push({
    relativePath: ".claude/lifecycle.md",
    content: buildLifecycleFile(context),
  });
  files.push({
    relativePath: ".claude/routes/code.md",
    content: buildCodeRoutesFile(context),
  });
  files.push({
    relativePath: ".claude/routes/docs.md",
    content: buildDocsRoutesFile(context),
  });
  files.push({
    relativePath: ".claude/corrections.md",
    content: buildCorrectionsFile(),
  });

  // Generate slim root CLAUDE.md (prepend so it's first in the list)
  files.unshift({
    relativePath: "CLAUDE.md",
    content: buildRootClaudeMd(domainsWithContent, context),
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
 * Render the reference file — GS theory kept OUT of session context.
 * Header explicitly tells the AI not to load this during work.
 */
function renderReferenceFile(
  blocks: InstructionBlock[],
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    `<!-- ForgeCraft reference: GS theory | ${date} -->`,
    `<!-- DO NOT load this file during implementation sessions. -->`,
    `<!-- It is background reading on the methodology. The operational rules`,
    `     derived from it live in CLAUDE.md, .claude/constitution.md, and`,
    `     .claude/lifecycle.md — those are the session-loaded contracts. -->`,
    "",
  ];
  for (const block of blocks) {
    const rendered = renderTemplate(block.content, context).trim();
    if (rendered) {
      lines.push(rendered, "");
    }
  }
  return lines.join("\n");
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

  // Compact by default: strip explanatory tails, dedupe bullets, compress
  // blanks. Session-loaded files must be rules, not lectures — every line of
  // explanation displaces task context (harness budget).
  return compactifyContent(lines.join("\n"));
}

// ── CNT root ──────────────────────────────────────────────────────────

/**
 * Build the slim CNT root CLAUDE.md (≤80 lines).
 * Contains only: project identity, always-load list, routing table, doc obligation table.
 * All content lives in branch files — this is routing only.
 */
function buildRootClaudeMd(
  _domains: Array<{ domain: string; description: string }>,
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const tagList =
    context.tags.filter((t) => t !== "UNIVERSAL").join(", ") || "UNIVERSAL";
  const stackLine = inferStackFromTags(context.tags, context.language);

  return [
    `# ${context.projectName} — Architecture Sentinel`,
    `<!-- ForgeCraft CNT root | ${date} | npx forgecraft-mcp refresh . --apply to regenerate -->`,
    ``,
    `> **CNT root** — loaded every session, routing only (≤80 lines).`,
    `> Always load the files below, then navigate to the relevant branch.`,
    `> If anything contradicts \`docs/PRD.md\`, PRD wins. Raise an ADR to change course.`,
    ``,
    `## Context Discipline (the prime directive)`,
    ``,
    `**Less harness, more task.** For any roadmap item, run \`generate_session_prompt\``,
    `and work from THAT bound prompt — it contains everything the step needs.`,
    `Load AT MOST one branch + one standards file per task. Never graze the harness`,
    `"to be thorough" — every line of methodology you load displaces the task.`,
    `\`.claude/reference/\` is background reading: NEVER load it during work.`,
    ``,
    `## Always Load`,
    ``,
    `- \`.claude/constitution.md\` — non-negotiables: SOLID, invariants, prohibited ops`,
    `- \`docs/status.md\` — current project state and open items`,
    `- \`.claude/corrections.md\` — past AI mistakes on this project (read before acting)`,
    ``,
    `## Navigate by Task`,
    ``,
    `| You're about to... | Load these branches |`,
    `| --- | --- |`,
    `| Implement a feature | \`.claude/lifecycle.md\` → \`docs/use-cases/\` → \`.claude/routes/docs.md\` |`,
    `| Fix a bug | \`.claude/lifecycle.md\` → linked test → \`.claude/routes/code.md\` |`,
    `| Change architecture / layers | \`.claude/constitution.md\` → \`docs/architecture/layers.md\` → \`docs/adrs/\` |`,
    `| Change a module boundary | \`.claude/constitution.md\` → \`docs/architecture/modules.md\` |`,
    `| Change data model / schema | \`docs/architecture/data-model.md\` → \`.claude/routes/docs.md\` |`,
    `| Add / change API surface | \`.claude/standards/api.md\` → \`docs/use-cases/\` |`,
    `| Write / fix tests | \`.claude/standards/testing.md\` → \`.claude/routes/code.md\` |`,
    `| Review architecture | \`.claude/constitution.md\` → \`.claude/routes/code.md\` → \`docs/architecture/\` |`,
    `| Start a new session | \`.claude/lifecycle.md\` → \`docs/status.md\` → relevant use case |`,
    ``,
    `## Project Identity`,
    ``,
    `- **Name**: ${context.projectName}`,
    `- **Tags**: ${tagList}`,
    `- **Stack**: ${stackLine}`,
    ``,
    `## Doc Obligation Table`,
    ``,
    `| Change type | Read first | Produce after |`,
    `| --- | --- | --- |`,
    `| New feature | \`docs/PRD.md\` + relevant use case | Spec decision record in \`docs/specs/\` |`,
    `| Architecture change | \`docs/architecture/layers.md\` + ADR index | ADR in \`docs/adrs/active/\` |`,
    `| Schema change | \`docs/architecture/data-model.md\` | Update schema + ERD |`,
    `| Module boundary | \`docs/architecture/modules.md\` | Update modules.md + ADR if non-obvious |`,
    `| Bug fix | Linked use case + failing test | Regression note in use case |`,
    ``,
    `## @gs-links Convention`,
    ``,
    `\`// @gs-links: docs/use-cases/UC-NNN.md, docs/adrs/active/NNNN-slug.md\``,
    `Source files that implement a decision carry this. Linked docs must be staged with code.`,
    `The \`pre-commit-gs-links.sh\` hook enforces this; escape with \`docs/change-manifest.md\`.`,
    ``,
  ].join("\n");
}

// ── CNT branch: constitution ──────────────────────────────────────────

/**
 * Build .claude/constitution.md — non-negotiables always loaded with the root.
 * Contains: 7 GS properties, architecture invariants, commit protocol, prohibited ops.
 */
function buildConstitutionFile(context: RenderContext): string {
  const date = new Date().toISOString().split("T")[0];
  const layerDiagram = buildLayerDiagram(context.tags);

  return [
    `<!-- CNT branch: constitution | ${date} | always loaded alongside root -->`,
    `<!-- Non-negotiables. No exceptions. Disagreement → write an ADR. -->`,
    ``,
    `## The 7 GS Properties`,
    ``,
    `Every artifact must satisfy all seven:`,
    ``,
    `1. **Self-describing** — artifacts explain themselves; no implicit human memory.`,
    `2. **Bounded** — files ≤300 lines, functions ≤50 lines, one file = one concern.`,
    `3. **Verifiable** — typecheck + lint + tests pass = "done". "Wrote the file" ≠ done.`,
    `4. **Defended** — destructive ops structurally blocked (\`docs/operation-classification.md\`).`,
    `5. **Auditable** — Conventional Commits + ADRs for every non-trivial structural decision.`,
    `6. **Composable** — dependencies always inward, explicit interfaces at layer seams.`,
    `7. **Executable** — tests run against real runtime, not just compilation.`,
    ``,
    `## Architecture Invariants`,
    ``,
    `**Layer stack** (dependencies point INWARD ONLY):`,
    layerDiagram,
    ``,
    `- A layer never imports from a layer above it. No lateral imports between domains.`,
    `- Shared utilities go to \`shared/\` — never duplicated across domains.`,
    ...(context.language === "python"
      ? [
          `- Type hints required on all public functions (mypy strict or pyright strict).`,
          `- No implicit \`Any\` — use \`Union\`, \`Optional\`, or \`Protocol\` for flexible types.`,
          `- Make illegal states unrepresentable: model states as types (tagged unions, \`NewType\`,`,
          `  frozen dataclasses). Parse, don't validate — parse raw input into typed objects at every boundary.`,
          `- No circular imports (use TYPE_CHECKING guard if needed).`,
        ]
      : [
          `- Strict typing: no \`any\` — use \`unknown\` + narrowing.`,
          `- Explicit return types on all exported functions.`,
          `- Make illegal states unrepresentable: discriminated unions and \`Result<T,E>\` over`,
          `  runtime checks and thrown exceptions. Parse, don't validate — at every boundary.`,
          `- No circular imports (hook-enforced).`,
          `- ESM imports: all local imports use \`.js\` extensions.`,
        ]),
    `- Functional core, imperative shell: domain logic pure; I/O and effects only in adapters.`,
    `- Design by Contract: each use case's Precondition/Postcondition IS the function contract —`,
    `  tests assert postconditions, types encode preconditions.`,
    `- Files ≤300 lines, functions ≤50 lines. Extract when exceeded.`,
    ``,
    `## Commit Protocol (Conventional Commits, strict)`,
    ``,
    `\`type(scope): subject\` — type ∈ \`feat|fix|refactor|docs|test|chore|perf|build|ci\``,
    ``,
    `- **Atomic**: one commit = one logical change. No "WIP", "fixes", "asdf".`,
    `- Every commit must pass typecheck + lint + affected tests.`,
    `- TDD sequence: \`test(scope): [RED]\` → \`feat(scope): [GREEN]\` → \`refactor(scope)\``,
    `- A pre-commit hook enforces quality; a commit-msg hook validates format + TDD phase.`,
    ``,
    `## Prohibited Operations`,
    ``,
    `See \`docs/operation-classification.md\` for Tier 0–3 classification.`,
    ``,
    `**Blocked without \`FORGECRAFT_ALLOW_DESTRUCTIVE=1\`:**`,
    `- \`DROP TABLE\`, \`TRUNCATE\`, \`DELETE\` without specific \`WHERE\``,
    `- Disabling any security constraint (RLS, auth guards)`,
    `- \`git push --force\` to main/master`,
    `- \`rm -rf\` on src/, docs/, or database paths`,
    `- Hard delete of domain entities (use soft delete + audit log instead)`,
    ``,
    `**Require human confirmation (never proceed silently):**`,
    `- Direct push to main (use PR)`,
    `- Schema migrations on production`,
    `- Adding dependencies >100 KB`,
    `- Full data resync / backfill operations`,
    ``,
    `## Forbidden Patterns`,
    `> Failure classes that pass typecheck + unit tests yet reach production. Each was paid for once.`,
    ``,
    `- **No duplicate business rule across handlers** — read and write share one tested helper, never parallel copies (they desync silently).`,
    `- **No \`findMany\`/\`SELECT\` consumed by positional index without explicit \`ORDER BY\`** (+ \`id\` tie-breaker) — heap-scan order is luck.`,
    `- **No spec-declared response field without a contract assertion** — the backend drops it silently and unit tests still pass.`,
    `- **No external-render template (PDF, email, export) without a snapshot test** — review misses label drift and raw-enum leaks.`,
    `- **No bug fix without a regression test that fails before the fix** — the concrete input that broke becomes a permanent fixture.`,
    ...(context.tags.some((t) =>
      ["ML", "DATA-PIPELINE", "ANALYTICS"].includes(t),
    )
      ? [
          `- **No LLM/model-output-consuming test with synthetic mocks only** — record a real output as a replay fixture; production shapes differ.`,
        ]
      : []),
    ``,
  ].join("\n");
}

// ── CNT branch: lifecycle ─────────────────────────────────────────────

/**
 * Build .claude/lifecycle.md — GS session lifecycle.
 * Contains: cascade order, feature estimation, tool sequencing, session loop invariant.
 */
function buildLifecycleFile(_context: RenderContext): string {
  const date = new Date().toISOString().split("T")[0];

  return [
    `<!-- CNT branch: lifecycle | ${date} | load when starting a session or implementing a change -->`,
    ``,
    `## Memory Map — What to Load and When`,
    ``,
    `| Memory type | Artifact | Load when |`,
    `| --- | --- | --- |`,
    `| **Semantic** — architectural rules | \`CLAUDE.md\` + \`.claude/constitution.md\` | Every session (always load) |`,
    `| **Procedural** — how to work | \`.claude/lifecycle.md\` + \`.claude/standards/\` | Implementing or starting a feature |`,
    `| **Episodic** — decisions and state | \`docs/adrs/active/\` + \`docs/status.md\` | Starting a session, structural changes |`,
    `| **Relationship** — behavioral contracts | \`docs/use-cases/\` | Before implementing any behavior |`,
    `| **Working** — current task | Sub-tasks from Feature Estimation | During implementation (keep minimal) |`,
    ``,
    `Read in this order at session start: \`docs/status.md\` → relevant use case → relevant ADR → \`.claude/constitution.md\``,
    ``,
    `## GS Initialization Cascade`,
    ``,
    `Run \`check_cascade\` to verify each step before implementing anything:`,
    ``,
    `1. **Functional spec** — \`docs/PRD.md\` exists with real content (not stubs)`,
    `2. **Architecture** — \`docs/TechSpec.md\` + \`docs/architecture/\` present`,
    `3. **Constitution** — \`CLAUDE.md\` + \`.claude/constitution.md\` loaded`,
    `4. **Decision records** — at least one ADR in \`docs/adrs/active/\``,
    `5. **Behavioral contracts** — use cases in \`docs/use-cases/\` with acceptance criteria`,
    ``,
    `If any step fails: fix it before generating code. The cascade IS the specification.`,
    ``,
    `## Feature Estimation (required before any requested change)`,
    ``,
    `Before writing any code:`,
    `1. **Read** the relevant use case in \`docs/use-cases/\` or spec in \`docs/specs/\``,
    `2. **Identify** all files that will be touched (source, tests, docs)`,
    `3. **Break into sub-tasks** — each sub-task: ≤3 files, one clear acceptance criterion`,
    `4. **State the scope boundary** — explicitly list what this change does NOT touch`,
    `5. **Confirm** the breakdown with the user before writing any code`,
    ``,
    `Sub-task granularity prevents context window degradation. Each sub-task must be`,
    `completable without reloading the full spec. This is not optional ceremony.`,
    ``,
    `## Tool Sequencing`,
    ``,
    `| Task type | Recommended sequence |`,
    `| --- | --- |`,
    `| New feature | Read PRD → Read use-case → Write test ([RED]) → Implement ([GREEN]) → Commit |`,
    `| Bug fix | Grep error → Read failing test → Fix → Add regression test → Commit |`,
    `| Refactor | Read architecture → Check layers → Change → Run tests → Commit |`,
    `| Schema change | Read data-model → Write migration → Regen types → Update UC → Commit |`,
    `| <!-- FILL: custom task --> | <!-- FILL: sequence --> |`,
    ``,
    `## Gate Awareness — Detect When a Quality Gate Is Needed`,
    ``,
    `Recognize gate-worthy moments WHILE working — don't wait for close_cycle:`,
    ``,
    `- **Same bug class fixed twice** in a session or across recent commits`,
    `- **User corrects you** about something a structural check could have caught`,
    `- **You repeat a manual verification** ("let me check X didn't break") more than once`,
    `- **A convention exists only in prose** — if a rule lives in docs but nothing enforces it`,
    ``,
    `When detected, immediately create a draft gate at \`.forgecraft/gates/drafts/<id>.yaml\``,
    `with \`origin: organic\` and the trigger as evidence. Also log the moment in`,
    `\`.claude/corrections.md\` — the close_cycle genesis scan is the safety net for`,
    `moments you miss, and its drafts carry \`origin: genesis\`.`,
    ``,
    `Drafts are proposals — the dev reviews and moves them to \`gates/active/\` to enforce.`,
    `If a gate would help other projects, set \`generalizable: true\` so close_cycle`,
    `proposes it to the community registry.`,
    ``,
    `## Working Memory Protocol (mid-session context management)`,
    ``,
    `Context windows degrade. When a session grows long:`,
    ``,
    `1. **Checkpoint before continuing.** Update \`docs/status.md\` with completed sub-tasks`,
    `   and the exact next step — specific enough to resume cold.`,
    `2. **Don't reload what contracts already answer.** If tests pass and types compile,`,
    `   trust the contract — do not re-read implementations to "refresh" your memory.`,
    `3. **One sub-task at a time.** If the current sub-task's context no longer fits cleanly,`,
    `   finish it, commit, checkpoint, and start the next sub-task fresh.`,
    `4. **Never hold unsaved decisions in working memory.** A decision worth remembering`,
    `   goes to an ADR or status.md the moment it's made — not at session end.`,
    ``,
    `## Session Loop Invariant (close-of-session gate)`,
    ``,
    `Before closing any session, verify:`,
    ``,
    `1. ✅ Typecheck passes — no type errors`,
    `2. ✅ Lint passes — no promoted warnings`,
    `3. ✅ Affected tests pass`,
    `4. ✅ If schema changed: types regenerated and staged`,
    `5. ✅ If structural decision: ADR written in \`docs/adrs/active/\``,
    `6. ✅ Commits are atomic Conventional Commits`,
    `7. ✅ \`docs/status.md\` updated — current state, open items, recent decisions`,
    `8. ✅ If UC acceptance criteria changed: \`docs/use-cases/\` updated`,
    ``,
    `If any item is incomplete: document it in \`docs/status.md\` before stopping.`,
    ``,
  ].join("\n");
}

// ── CNT branch: routes/code ───────────────────────────────────────────

/**
 * Build .claude/routes/code.md — where code lives.
 * Contains: folder map, module addition protocol, naming conventions, code standards.
 */
function buildCodeRoutesFile(context: RenderContext): string {
  const date = new Date().toISOString().split("T")[0];
  const folderMap = buildFolderMap(context.tags);

  return [
    `<!-- CNT branch: routes/code | ${date} | load when navigating source or adding a module -->`,
    ``,
    `## Folder Map — Where Code Lives`,
    ``,
    `Screaming Architecture: structure states what lives where — the first search must hit.`,
    `A folder named \`controllers/\` contains controllers, nothing else. Never relocate by whim;`,
    `convention over configuration is what makes a stateless reader's navigation deterministic.`,
    ``,
    folderMap,
    ``,
    `## Module Addition Protocol`,
    ``,
    `When adding a new module:`,
    `1. Determine which layer it belongs to (see \`.claude/constitution.md\`)`,
    `2. Check \`docs/architecture/modules.md\` — verify no existing module already owns this concern`,
    `3. Name the file using the conventions below`,
    `4. Add a \`@gs-links\` comment referencing the use case or ADR it implements`,
    `5. If the addition represents a structural decision: write an ADR first`,
    ``,
    `## Naming Conventions`,
    ``,
    ...(context.language === "python"
      ? [
          `| Artifact | Convention | Example |`,
          `| --- | --- | --- |`,
          `| Files / modules | \`snake_case.py\` | \`user_service.py\` |`,
          `| Classes | \`PascalCase\` | \`UserService\` |`,
          `| Variables / Functions | \`snake_case\` | \`get_user_by_id\` |`,
          `| Database columns / JSON keys | \`snake_case\` | \`created_at\` |`,
          `| Constants | \`SCREAMING_SNAKE_CASE\` | \`MAX_RETRY_COUNT\` |`,
          `| Allowed abbreviations | — | id, url, http, db, api, ctx, err |`,
        ]
      : [
          `| Artifact | Convention | Example |`,
          `| --- | --- | --- |`,
          `| Files | \`kebab-case.ts\` | \`user-service.ts\` |`,
          `| Classes / Types / Interfaces | \`PascalCase\` | \`UserService\` |`,
          `| Variables / Functions | \`camelCase\` | \`getUserById\` |`,
          `| Database columns / JSON keys | \`snake_case\` | \`created_at\` |`,
          `| Constants | \`SCREAMING_SNAKE_CASE\` | \`MAX_RETRY_COUNT\` |`,
          `| Allowed abbreviations | — | id, url, http, db, api, ctx, err |`,
        ]),
    ``,
    `## Code Standards`,
    ``,
    ...(context.language === "python"
      ? [
          `- Type hints on all public functions — mypy strict or pyright strict`,
          `- No mutable default arguments; use \`None\` + guard`,
          `- Files ≤300 lines, functions ≤50 lines — extract when exceeded`,
          `- Absolute imports from package root; no \`sys.path\` manipulation`,
        ]
      : [
          `- Strict typing — no \`any\`, use \`unknown\` + narrowing`,
          `- Explicit return types on all exported functions`,
          `- Files ≤300 lines, functions ≤50 lines — extract when exceeded`,
          `- Absolute imports with path aliases (\`@/\` → \`src/\`)`,
        ]),
    `- No dead code, unused imports, or \`console.log\` in production files`,
    ``,
  ].join("\n");
}

// ── CNT branch: routes/docs ───────────────────────────────────────────

/**
 * Build .claude/routes/docs.md — where documents live and how to navigate them.
 * Contains: Navigation Mode, document map, reading order.
 */
function buildDocsRoutesFile(context: RenderContext): string {
  const date = new Date().toISOString().split("T")[0];
  const hasArchDiscipline =
    context.tags.some((t) =>
      ["WEB-NEXT", "WEB-REACT", "API", "CLI", "LIBRARY"].includes(t),
    ) || context.tags.includes("UNIVERSAL");

  const navMode = hasArchDiscipline
    ? [
        `## Navigation Mode — How to Read This Codebase`,
        ``,
        `This project follows Clean Architecture with TDD. **The contracts are trustworthy.**`,
        ``,
        `- **Read interfaces, not implementations first.** Types and signatures tell you what`,
        `  a module promises. Read those before reading the body.`,
        `- **Use-cases are the spec.** Before touching business logic, read the relevant UC in`,
        `  \`docs/use-cases/\`. The code is derived from the use case, not the reverse.`,
        `- **ADRs explain the why.** Check \`docs/adrs/active/\` before making structural decisions.`,
        `  The answer may already exist.`,
        `- **Skip implementation reads when contracts are green.** If tests pass and types compile,`,
        `  treat a module as a black box.`,
        `- **Raise an ADR rather than deviating silently.** If the correct action contradicts the`,
        `  architecture, write an ADR — do not silently break the contract.`,
        ``,
      ]
    : [];

  return [
    `<!-- CNT branch: routes/docs | ${date} | load when navigating documents or before implementing -->`,
    ``,
    ...navMode,
    `## Document Map — Where Docs Live`,
    ``,
    `| What you need | Where to find it |`,
    `| --- | --- |`,
    `| What to build | \`docs/PRD.md\` |`,
    `| Architecture overview | \`docs/TechSpec.md\` |`,
    `| Layer and boundary rules | \`docs/architecture/layers.md\` |`,
    `| Module ownership | \`docs/architecture/modules.md\` |`,
    `| Data model / schema / ERD | \`docs/architecture/data-model.md\` |`,
    `| External integrations | \`docs/architecture/integrations.md\` |`,
    `| Behavioral contracts | \`docs/use-cases/\` |`,
    `| Why a decision was made | \`docs/adrs/active/\` |`,
    `| Current project state | \`docs/status.md\` |`,
    `| Non-functional requirements | \`docs/nfr-contracts.md\` |`,
    `| Test architecture | \`docs/test-architecture.md\` |`,
    ``,
    `## Reading Order (before starting implementation)`,
    ``,
    `1. \`docs/status.md\` — what's done, what's in progress, recent decisions`,
    `2. Relevant use case in \`docs/use-cases/\``,
    `3. Relevant spec section in \`docs/specs/\` or \`docs/PRD.md\``,
    `4. Relevant ADR if the area has prior decisions in \`docs/adrs/active/\``,
    `5. \`.claude/constitution.md\` — verify your approach doesn't violate invariants`,
    ``,
  ].join("\n");
}

// ── CNT branch: corrections ───────────────────────────────────────────

/**
 * Build .claude/corrections.md — corrections log stub.
 * Always read before acting. Never delete entries.
 */
function buildCorrectionsFile(): string {
  const date = new Date().toISOString().split("T")[0];

  return [
    `<!-- CNT branch: corrections | ${date} | read before acting in every session -->`,
    `<!-- Records past AI mistakes on this project. Never delete entries. Always add. -->`,
    ``,
    `## Corrections Log`,
    ``,
    `> Format: \`YYYY-MM-DD | [category] what went wrong | correct approach\``,
    ``,
    `<!-- Add entries when an AI assistant makes a mistake on this project. Examples:`,
    `2026-01-15 | [architecture] Added business logic to a route handler — always delegate to service layer`,
    `2026-01-20 | [testing] Mocked DB in integration test — use real test DB instead`,
    `2026-02-10 | [scope] Changed more files than the sub-task required — one sub-task = ≤3 files`,
    `-->`,
    ``,
  ].join("\n");
}

/**
 * Infer the stack description from project tags and language.
 *
 * @param tags - Project tags
 * @param language - Primary language ("typescript" default, "python")
 * @returns Human-readable stack string
 */
function inferStackFromTags(
  tags: readonly string[],
  language?: string,
): string {
  if (language === "python") {
    if (tags.includes("API")) return "Python REST/GraphQL API (FastAPI/Django)";
    if (tags.includes("CLI")) return "Python CLI";
    if (tags.includes("DATA-PIPELINE")) return "Python data pipeline";
    if (tags.includes("ML")) return "Python ML";
    if (tags.includes("LIBRARY")) return "Python library";
    return "Python";
  }
  // Mobile takes precedence over API/WEB: a mobile app that consumes an API is
  // primarily a mobile app, not an API server. EXPO is more specific than MOBILE.
  if (tags.includes("EXPO")) return "React Native (Expo) + TypeScript";
  if (tags.includes("MOBILE")) return "React Native + TypeScript";
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
