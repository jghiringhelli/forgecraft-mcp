# Changelog

All notable changes to `forgecraft-mcp` are documented here.

Format: [Conventional Commits](https://conventionalcommits.org). Dates reflect merge to main.
Breaking changes are marked **BREAKING**.

---

## [Unreleased]


## [1.4.0] — 2026-04-05

### Added

- **consolidate_status MCP action.** Produces a live project state snapshot — cascade score, roadmap progress (with next unblocked item), last 5 git commits, uncommitted files, detected test command, and Status.md tail — embedded into every `generate_session_prompt` response. Closes the session drift gap: sessions now start with current state rather than stale spec state.

- **Agentic gate violations.** Pre-commit hooks (`anti-patterns`, `compile`, `coverage`, `secrets`, `clippy`) now write structured JSONL to `.forgecraft/gate-violations.jsonl` on failure. New `read_gate_violations` MCP action partitions violations into **active** (newer than last commit) vs **stale** (cleared by commit). `consolidate_status` surfaces active violation count in every session prompt.

- **MCP result size annotation.** All tool responses now pass through `annotateResult()` at the router layer. Results >1,000 chars get a compact `↩ X chars · Y lines` footer. Results >50,000 chars are truncated with an explicit `[TRUNCATED: X/Y chars]` marker so callers know the response is incomplete.

- **`--bare` CI mode** — three new CLI gate commands with predictable exit codes:
  - `check-cascade [dir]` — exits 1 if any required cascade step fails
  - `violations [dir]` — exits 1 if active gate violations are present
  - `status [dir]` — prints live project snapshot (always exits 0)
  - All three support `--json` for machine-readable CI output

- **Roadmap DAG dependency tracking.** `generate_roadmap` now produces a 5-column table with a `Depends On` column. `generate_session_prompt` blocks items whose dependencies are not yet done. `parseRoadmapItems` handles legacy (4-col) and new (5-col) formats.

- **Full Rust/Cargo support in universal quality hooks.** Seven existing hooks now handle `.rs` files. New `pre-commit-clippy.sh` hook added and registered in `REQUIRED_HOOKS`.

### Fixed

- **`pre-push` hook blocked deletion of all feature branches** when on `main`. Now only blocks deletion of `refs/.../main` or `refs/.../master` remote refs.

---
## [1.3.2] — 2026-04-02

### Added

- **Playwright MCP opt-in during `setup_project`.**  Phase 1 now asks Q5 — but only for
  projects with `WEB-REACT`, `WEB-STATIC`, or `API` tags.  Explains that Playwright MCP
  lets the AI drive a real browser for E2E loops, visual feedback, and (for API projects)
  request interception and response validation — all locally.  Phase 2 respects
  `use_playwright: false` by excluding the `playwright` and `playwright-mcp` servers from
  `.claude/settings.json`.

- **Playwright MCP added to the `API` template.**  `templates/api/mcp-servers.yaml` now
  includes a `playwright` server entry (tier: recommended) for API request interception
  and response validation.

### Fixed

- **CI `lint` step was broken** — `eslint` was missing from `devDependencies` and no
  eslint config existed.  Added `eslint`, `@typescript-eslint/parser`, and
  `@typescript-eslint/eslint-plugin` as dev dependencies, and added `eslint.config.js`
  (flat config with `recommended` TypeScript rules).

- **Publish workflow `EOTP` error** — added a comment to `publish.yml` explaining that
  `NPM_TOKEN` must be an **Automation** token (not a classic token) to bypass 2FA in CI.

---

## [1.3.1] — 2026-04-03

### Added

- **Tool vs. sample-output conflation detector.**  `detectToolSampleConflation()` in the
  spec parser identifies specs that describe both a generative AI tool (AI ghostwriter,
  stable diffusion pipeline, game AI engine) **and** specific named creative output (a
  quoted book title, a named character, a specific artwork series).  When both signals
  are present, Phase 1 flags a `tool_vs_sample_output` ambiguity and asks whether to
  build the tool only, the content only, or split them.

- **`tool_sample_split` Phase 2 parameter.**  Accepts `"tool_and_sample"`, `"tool_only"`,
  or `"content_only"`.  When set to `"tool_and_sample"`, Phase 2 writes
  `docs/sample-outcome.md` — a stub for the specific creative deliverable described in
  the spec — and the Phase 2 response includes a callout explaining that the PRD covers
  the core tool and the sample file is the first acceptance test.

### Fixed

- **`no-repo` git pre-flight changed from warning to hard-stop.**  A missing `.git`
  repository now blocks Phase 1 (like `no-git`) with exact `git init` commands including
  `--allow-empty` for blank projects.  Previously it emitted a warning in the Phase 1
  summary, which was insufficient — ForgeCraft cannot guarantee its own metrics without a
  repository.

- **CI fixture coverage directory was gitignored.**  Added `!tests/fixtures/**/coverage/**`
  negation to `.gitignore` so the `metrics-project` fixture coverage files are committed
  and the metrics test passes on CI.

---

## [1.3.0] — 2026-04-02

### Added

- **CodeSeeker opt-in during `setup_project`.**  Phase 1 now asks Q4: whether to add
  CodeSeeker for semantic code search. Explains the benefit (~53% duplication reduction
  measured across sessions), notes it runs fully locally, and explicitly says to skip it
  if you already have an equivalent tool. Phase 2 respects `use_codeseeker: false` by
  excluding CodeSeeker from `.claude/settings.json` while keeping all other servers intact.

- **Git pre-flight check at the start of `setup_project`.**  Before any analysis runs,
  ForgeCraft now verifies git is available and a repository exists.
  - **No git binary detected** → hard-stop response with install URL and exact commands.
  - **git installed but no `.git` repo** → hard-stop with `git init` / `git init --allow-empty` commands.
  - **Repo present** → silent pass.

- **`excluded_servers` parameter for `configure_mcp`.**  Callers can now pass a list of
  server names to skip during MCP configuration — useful for any server, not just
  CodeSeeker.

---

## [1.2.0] — 2026-04-01

### Added

- **Structured diagram stubs for scaffold.** The `scaffold` action now emits real Mermaid
  syntax for all five diagram types — sequence (participants + arrows), state machine
  (states, transitions, `[*]` markers), flow (Start/End rounded nodes, decision diamond),
  C4 context, and C4 container (Container + Rel declarations). Prior stubs were empty
  placeholders; these stubs encode grammar production rules so AI assistants read a valid
  skeleton, not a blank file.

- **Emit-Don't-Reference enforcement in `artifact-grammar` template.** The template's
  artifact table now includes explicit P1 file paths and emit instructions for every
  diagram type. The Feature Completion Protocol steps 3–4 updated with named paths.
  Added an "Emit-Don't-Reference" callout block. UNFILLED files are explicitly flagged
  as known spec gaps that must appear on the cascade backlog.

- **CI/CD GitHub Actions workflows.** `ci.yml` (lint → typecheck → test+coverage →
  mutation gate) and `publish.yml` (triggered on `v*.*.*` tags → build → npm publish)
  are now committed to `.github/workflows/`.

---

## [1.1.0] — 2026-03-31

### Added

- **Anti-pattern: redundant deploy pipeline detection.** The `scanAntiPatterns` tool now
  warns when a project has both a platform deploy config (`railway.toml`, `vercel.json`,
  `fly.toml`, `render.yaml`) and a `.github/workflows/` directory. Both pipelines trigger
  on push — the warning surfaces the duplication before it causes conflicting deployments.

- **`agent-mechanics` template block (tier: core).** All projects scaffolded or refreshed
  by forgecraft now receive 7 non-negotiable mechanical overrides in their CLAUDE.md:
  1. Step 0 dead code deletion before refactors (context compaction prevention)
  2. 5-file phase limit per response
  3. Senior dev quality bar override (counters system-level brevity mandate)
  4. Sub-agent parallelism for >5 independent files
  5. 2,000-line file read cap with chunked read requirement for files >500 LOC
  6. Tool result truncation awareness (re-scope if results look sparse)
  7. Grep exhaustiveness checklist for renames and signature changes

- **Public quality gates registry wired to `generative-specification`.** forgecraft-mcp
  now reads the community gate library from `jghiringhelli/generative-specification`
  (42 gates, including 9 new deployment lifecycle gates for staging, production, and
  continuous phases). Gate proposals create issues in that repo.

- **Gate: `no-redundant-deploy-pipelines`** added to the public quality-gates library.

### Changed

- Registry URL updated from the stale `quality-gates` repo to the canonical
  `generative-specification/quality-gates/` path (PR #10).

---

## [1.0.0] — 2026-03-13

First stable release. This version ships the complete Generative Specification
toolchain — the CLI, the sentinel, and the on-demand guidance resource — alongside
the published white paper and practitioner protocol.

### Architecture

- **BREAKING — MCP server is sentinel-only.** The MCP server now exposes a single
  `forgecraft` tool (~200 tokens) that reads project state and returns CLI commands.
  The full 21-action router is CLI-only. This is a deliberate design: the sentinel
  *is* the methodology made visible — a stateless reader that checks three artifacts
  (`forgecraft.yaml`, `CLAUDE.md`, `.claude/hooks`), derives the correct action, and
  steps aside. Remove the MCP server after initial setup to reclaim token budget.
- Full 21-action CLI router (`setup`, `refresh`, `audit`, `scaffold`, `review`,
  `classify`, `add-hook`, `add-module`, `configure-mcp`, `get-reference`, `get-nfr`,
  `get-playbook`, `convert`, `verify`, `advice`, `metrics`, `check-cascade`,
  `generate-session-prompt`, `list`) exposed via `npx forgecraft-mcp <command>`.

### Added

- **`get_reference(resource: guidance)`** — on-demand GS procedure dispatch. Returns
  5 Practitioner Protocol procedure blocks (Session Loop, Context Loading Strategy,
  Incremental Cascade, Bound Roadmap format, Diagnostic Checklist) fetched only
  when needed, not inlined into every CLAUDE.md. Closes the token-budget pressure
  that caused the pointer architecture.
- **`check_cascade`** — derivability gate. Verifies all 5 GS initialization cascade
  steps are complete before implementation begins. Reads project artifacts, not just
  file existence.
- **`generate_session_prompt`** — bound prompt generator. Produces a self-contained
  session prompt from a roadmap item description, acceptance criteria, and scope note.
  Output format matches the Practitioner Protocol §5 bound prompt template exactly.
- **`verify`** — GS §4.3 property scorer. Runs the test suite, scores 12 GS
  properties, reports layer violations and anti-pattern coverage. Combines unit
  results with structural analysis.
- **`metrics`** — external code quality report. LOC breakdown, test coverage parsing
  (LCOV/Istanbul/Cobertura), layer violation detection, dead code scan, optional
  Stryker mutation testing.
- **`advice`** — quality cycle checklist + tool stack + example configs for detected
  tags. No project analysis; pure reference output.
- **`get_playbook`** — phased delivery playbook for active tags. Phase-gated
  implementation sequence aligned to the initialization cascade order.
- **`DEVELOPMENT_PROMPTS.md`** — Procedural Memory artifact. Three bound prompt
  exemplars demonstrating the P-001/P-002/P-003 task shapes (documentation,
  verification+fix, additive implementation). Included as `Appendix A` of the
  Practitioner Protocol.
- **GS experiment scaffold** (`experiments/`) — controlled vs treatment design for
  the April 2026 Solera developer experiment. Pre-registration, Docker compose for
  dual-DB isolation, automated audit runner.
- **9 new project tags:** `DATA-LINEAGE`, `MEDALLION-ARCHITECTURE`,
  `OBSERVABILITY-XRAY`, `HIPAA`, `SOC2`, `ZERO-TRUST`, `ANALYTICS`, `MOBILE`,
  `GAME` — each with `instructions.yaml` and `mcp-servers.yaml`.
- **ADRs 0002–0006** documenting: TypeScript stack selection, templates-as-YAML-data,
  orthogonal tag composition model, dual CLI+MCP entrypoints, merge-not-overwrite
  generation strategy.
- **C4 context and container diagrams** + domain model in `docs/diagrams/`.
- **`forgecraft.yaml`** config file — persists tag selection, tier, output targets,
  compact mode, variable overrides, and custom template directories.
- **`.github/copilot-instructions.md`** generation target — ForgeCraft now generates
  for 6 AI assistants: Claude, Cursor, GitHub Copilot, Windsurf, Cline, Aider.
- **`compact` mode** — strips explanatory tail clauses and deduplicates bullet lines;
  ~20–40% smaller instruction output for projects with tight context budgets.
- **`refresh` preview mode** (default) — shows before/after diff without writing
  files; `--apply` flag applies changes.
- **Anti-pattern scanner** — `scanAntiPatterns` checks source files for hardcoded
  URLs (anchored comment exclusion), mock data in production code, bare exception
  catches, and hardcoded credentials. Runs as part of `audit`.
- **MCP server budget guidance** — CLAUDE.md template blocks include the ≤3 active
  servers constraint with rationale.

### Changed

- `instructions.yaml` — 5 verbose GS procedure blocks removed from inline content,
  replaced with pointer to `get_reference(resource: guidance)`. CLAUDE.md output
  reduced from ~400 lines to <200 lines target. Procedures still available at full
  fidelity on demand.
- `ReferenceBlock` interface — added `readonly topic?: string` to enable guidance
  block segregation from design-pattern blocks.
- `getDesignReferenceHandler` — filters out blocks with `topic: guidance` so design
  patterns remain exactly 3 blocks.
- Test suite: 571 → 610 passing tests across 42 test files. Coverage: 84.67% →
  87.07% overall; `src/analyzers` 73.47% → 81.64% (gate: 80%+).

### Fixed

- **Anti-pattern false positive on `http://` URLs.** Comment-exclusion regex `\/\/`
  was also matching `http://localhost` URLs in source files, silently passing
  violations. Anchored to line-start: `^\s*(\/\/|\/\*|\*|#)`.
- **`guidance` resource no longer requires `tags` param.** Router previously required
  `tags` before the switch dispatch; `guidance` case now reached tags-free.
- **Windows `spawnSync` shell resolution for `claude.cmd`.** Added `shell: true` to
  experiment runner `spawnSync` calls.
- **`pool: "threads"` in `vitest.config.ts`** to fix Windows fork-spawn error in CI.

---

## [0.5.1] — 2026-03-12

### Fixed

- Coverage gate failures in `src/analyzers` (73.47% → addressed in 1.0.0).
- Additional unit tests for `scanAntiPatterns`, `probeLoc`, `probeCoverage`,
  `probeLayerViolations`.

---

## [0.5.0] — 2026-02-28

### Changed — BREAKING

- **MCP server reduced to sentinel only.** Prior versions exposed 15+ tools via the
  MCP protocol. The server now registers one tool: the sentinel. All other tools
  are CLI commands. Token footprint: ~1,500 → ~200 tokens per MCP request.

### Added

- Sentinel handler: reads `forgecraft.yaml`, `CLAUDE.md`, `.claude/hooks`; returns
  targeted CLI recommendation for the project's current state.
- CLI entry point (`src/cli.ts`) with full command surface.
- `convert` command — generates phased migration plan for legacy code.
- `verify` command — GS §4.3 property scoring (initial version).

---

## [0.4.0] — 2026-02-15

### Added

- `configure-mcp` — generates `.claude/settings.json` with recommended MCP servers
  matched to active tags. Includes remote registry support.
- `refresh-project` — detects tag drift, regenerates instruction files, shows diff.
- `get-nfr`, `get-reference`, `get-playbook` — on-demand reference resources.
- `review` — structured code review checklist across 4 dimensions.
- `advice` — quality cycle checklist + tool stack for active tags.
- `metrics` — external code quality report.
- 24-tag library complete: all template directories populated with `instructions.yaml`,
  `mcp-servers.yaml`, and domain-specific `nfr.yaml` / `review.yaml` / `structure.yaml`.

---

## [0.3.0] — 2026-01-31

### Added

- Dual entrypoint: same binary runs as CLI (`npx forgecraft-mcp setup .`) or as MCP
  server (no subcommand). ADR-0005 documents this decision.
- `add-hook` and `add-module` commands.
- `classify` — analyzes project to suggest tags.
- `list tags|hooks|skills` sub-commands.
- `forgecraft.yaml` config file format with variable overrides.
- Merge-not-overwrite strategy for instruction file generation (ADR-0006): custom
  sections in existing `CLAUDE.md` survive regeneration.

---

## [0.2.0] — 2026-01-15

### Added

- Tag composition model (ADR-0004): tags are orthogonal, additive, conflict-free.
  `UNIVERSAL` always included. Combining `API` + `WEB-REACT` merges both sets without
  conflicts.
- Templates refactored to pure YAML data files (ADR-0003). Never imported as code.
- `scaffold` command — generates full folder structure + instruction files.
- `audit` command — scores compliance 0–100.
- `setup_project` MCP tool.
- 10 initial tags: `UNIVERSAL`, `API`, `WEB-REACT`, `CLI`, `LIBRARY`, `DATA-PIPELINE`,
  `ML`, `FINTECH`, `HEALTHCARE`, `INFRA`.

---

## [0.1.0] — 2026-01-01

### Added

- Initial release. MCP server with `setup_project`, `scaffold_project`,
  `classify_project`, `add_hook`, `add_module`, `configure_mcp` tools.
- TypeScript 5, Node 18+, `@modelcontextprotocol/sdk`.
- `UNIVERSAL` tag with initial instruction blocks covering SOLID, testing pyramid,
  commit protocol, error handling.
- ADR-0001: Generative Specification methodology adopted as the governing framework
  for ForgeCraft's own development.

### Added
- **hooks**: add generator, enricher, and session-awareness hooks (`952cf8e`)

### Other
- **changelog**: update unreleased entries (`0c9571c`)
