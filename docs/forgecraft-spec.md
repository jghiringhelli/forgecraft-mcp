> **Spec regenerated June 2026 to match the implemented surface; supersedes the prior 11-tool / `.forgecraft.json` description.**
>
> The earlier revision of this document described an MCP server that exposed ~11 discrete tools
> (`classify_project`, `scaffold_project`, `generate_claude_md`, `audit_project`, `convert_existing`,
> `get_nfr_template`, …) and a user-override file named `.forgecraft.json`. None of that matches the
> current tool. ForgeCraft is now a **CLI-first** tool: ~17 CLI subcommands backed by a ~57-entry
> action router, with a deliberately minimal MCP surface (a single ~200-token "sentinel" tool). The
> config file is `forgecraft.yaml`. This document describes the implemented surface as of v1.8.1.

# ForgeCraft — Engineering Specification

## 1. Overview & Version

**ForgeCraft** (`forgecraft-mcp`, **v1.8.1**, npm package, MIT) is a CLI + MCP tool that writes and
maintains the *quality contract* an AI coding assistant works within. It generates AI-instruction
files (`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, Windsurf, Cline, Aider),
quality-gate hooks, a document taxonomy, ADRs, and a navigable spec tree — all tailored to a
project's detected stack via an orthogonal **tag** system (24 tags, e.g. `UNIVERSAL`, `API`,
`WEB-REACT`, `FINTECH`).

It is the toolchain implementation of the **Generative Specification (GS)** model — a 7-property
framework for AI-generated code quality (Self-Describing, Bounded, Verifiable, Defended, Auditable,
Composable, Executable), scored out of 14. The binding design constraint is the **stateless reader**:
a fresh AI session has no memory, so everything required must be derivable from on-disk artifacts.

ForgeCraft is a **setup-time tool**. You run it to configure (and periodically refresh/audit) a
project; it has no runtime footprint. The package entry (`bin: forgecraft-mcp`) is a dual-mode
binary: with a subcommand it runs as a CLI; with no subcommand it starts the MCP server over stdio.

- Package: `forgecraft-mcp` · `main: dist/index.js` · `engines: node >=18`
- Runtime deps: `@modelcontextprotocol/sdk`, `js-yaml`, `zod`
- Homepage: `https://forgecraft.tools` · Repo: `github.com/jghiringhelli/forgecraft-mcp`
- Quality-gate library (community): `github.com/jghiringhelli/quality-gates`

---

## 2. Two-Surface Architecture

ForgeCraft has two distinct surfaces. The split is itself a statement of the GS methodology: the
expensive, full command surface lives in the CLI, while the MCP server is kept minimal because every
declared MCP tool is read by the model on **every** turn whether invoked or not.

### 2.1 The MCP sentinel (`src/index.ts`, `src/tools/sentinel.ts`)

When invoked with no subcommand the binary starts an `McpServer` (`name: forgecraft`) over
`StdioServerTransport`. The intended and primary tool is the **`forgecraft` sentinel**:

- **Input artifacts** — a single param `project_dir`. The handler is a *stateless reader*: it checks
  for the existence of exactly three artifacts on disk —
  1. `forgecraft.yaml` (project config)
  2. the AI-instruction file (`CLAUDE.md`)
  3. `.claude/hooks/` (installed quality gates)
- **Derived output (~200 tokens)** — from those three booleans it derives **one** recommended next
  command and returns it as text:
  - no config + no `CLAUDE.md` → run `setup_project`
  - `forgecraft.yaml` present but no hooks → run `scaffold`
  - all present → offer `refresh` / `audit` / `check_cascade`
  - Plus a standing reminder: *ForgeCraft is a setup-time tool; remove it from your MCP servers
    after setup to reclaim token budget.*
- **Rationale** — a stateless reader, a bounded artifact set, a derived action. The sentinel does no
  writing and holds no state; it only diagnoses and points at the CLI. One MCP tool costs ~200 tokens
  vs. ~1,500 for a full router, keeping within the methodology's ≤3-active-MCP-server budget.

> **Implementation note (accuracy).** The stdio server in `src/index.ts` currently *also* registers a
> heavier second tool, `forgecraft_actions`, which proxies the full action router (~1,500 tokens) for
> clients that want MCP access to setup/cascade/audit actions. The product positioning (README,
> CHANGELOG 1.0.0/0.5.0) is **sentinel-first**: the sentinel is the recommended surface and the
> `forgecraft_actions` router is the heavy fallback. The hosted HTTP variant (`src/http-server.ts`)
> exposes only the sentinel + a `list_tags` helper + a `setup-project` MCP prompt. The CLI — not MCP —
> is the canonical full surface.

### 2.2 The CLI action surface

The full command surface is the CLI:

```bash
npx forgecraft-mcp <command> [dir] [flags]
```

`src/cli.ts` dispatches ~17 subcommands. Internally these (and many MCP-only actions) resolve to the
**`ACTIONS` router** in `src/tools/forgecraft-schema.ts` — a ~57-entry action array validated by a
single Zod schema (`forgecraftSchema`, merged with `forgecraft-schema-params.ts`). The CLI exposes the
common subset directly; the broader action list (harness, layers, ADR extraction, gate genesis,
rubric scoring, T4) is reachable through `forgecraft_actions` / programmatic use.

---

## 3. The CLI / Action Surface

CLI subcommands wired in `src/cli.ts`:

| Command | Purpose |
|---|---|
| `setup <dir>` | **Start here.** Two-phase onboarding: analyze (infer tags from spec) → calibrate (MVP? scope complete? consumers?) → scaffold config, instruction files, hooks, docs. |
| `scaffold <dir>` | Generate folder structure + instruction files + hooks for given/derived tags. |
| `refresh <dir>` | Re-scan after project changes; detect tag drift; preview diff (`--apply` to write). |
| `generate <dir>` | Regenerate instruction files only (merge-not-overwrite by default). |
| `audit <dir>` | Score compliance 0–100; reads tags from `forgecraft.yaml`; runs the anti-pattern scanner. |
| `review [dir]` | Structured code-review checklist (4 dimensions). |
| `verify <dir>` | Run tests + score the §4.3 GS properties (0–14, default pass threshold 11). |
| `metrics <dir>` | External code-quality report (LOC, coverage parse, layer violations, optional Stryker). |
| `classify [dir]` | Analyze code to suggest tags. |
| `convert <dir>` | Phased migration plan for legacy code. |
| `add-hook <name> <dir>` | Add a quality-gate hook. |
| `add-module <name> <dir>` | Scaffold a feature module (TS or Python). |
| `list tags\|hooks\|skills` | Discover available tags / hooks / skills. |
| `advice` | Quality-cycle checklist + tool stack for active tags (no project scan). |
| `check-cascade [dir]` | CI gate: exit 1 if any required cascade step fails (`--json`). |
| `violations [dir]` | CI gate: exit 1 if active gate violations present (`--json`). |
| `status [dir]` | Live project snapshot (always exit 0; `--json`). |

Common flags: `--tags`, `--tier core|recommended|optional`, `--targets`, `--dry-run`, `--compact`,
`--apply`, `--language typescript|python`, `--scope comprehensive|focused`.

### The full `ACTIONS` router, grouped

The router in `src/tools/forgecraft-schema.ts` exposes these actions (one line each):

**Onboarding & cascade**
- `setup_project` — two-phase onboard (analyze tags → calibrate → scaffold).
- `scaffold` — emit project structure, hooks, instruction files, docs stubs.
- `generate` — (re)generate instruction files only, merge with existing.
- `refresh` — re-sync instruction files after tag/scope changes.
- `classify` — suggest tags from a project description/code.
- `convert` — phased migration plan for legacy code.
- `configure_mcp` — write `.claude/settings.json` MCP servers (optional remote registry).
- `add_hook` / `add_module` — add a single hook / scaffold a module.
- `check_cascade` — verify all 5 GS cascade steps before implementation.
- `set_cascade_requirement` — mark a cascade step required/optional with rationale.
- `generate_roadmap` — phased `docs/roadmaps/active/roadmap.md` from PRD + use-cases (DAG deps).
- `generate_diagram` — Mermaid C4 context diagram from spec artifacts.

**Session**
- `propose_session` — pre-implementation impact assessment (spec delta, layer readiness, gates). Run *before* the next.
- `generate_session_prompt` — bound, self-contained prompt for one roadmap item (gated on cascade).
- `consolidate_status` — live state snapshot embedded into session prompts.
- `advise_session` — agent-agnostic session advisor (no `forgecraft.yaml` required).
- `change_request` / `list_changes` — open/track a spec/API/ADR/gate/dependency change with lifecycle.
- `check_spec_consistency` — scan artifacts for gaps, hollow/orphan probes, ambiguity markers, chain breaks.
- `check_derivation_chain` — verify PRD → UCs → ADRs → probes → gates chain is intact.

**Harness — the four-layer ratchet (L1–L4)**
- `layer_status` — report L1–L4 completion per use case; flag spec gaps and automation depth.
- `generate_harness` / `run_harness` — scaffold L2 probe files (Playwright/Hurl/bash) from UC specs; execute and report per-UC pass/fail + assertion density.
- `generate_env_probe` / `run_env_probe` — L3 environment-contract probes.
- `setup_monitoring` — `docs/monitoring-spec.md` from NFR contracts (required before L4/T4).
- `generate_slo_probe` / `run_slo_probe` — L4 SLO probes.
- `start_hardening` — generate pre-release → rc → load-test hardening prompts.
- `check_t4` — surface pending T4 production signals from `.forgecraft/t4-signals.json`.
- `analyze_harness` — post-scaffold gap analysis vs FC QG registry + WP; submit gaps as GitHub issues.

**Gates**
- `read_gate_violations` — read structured violations from `.forgecraft/gate-violations.jsonl` (active vs stale).
- `contribute_gate` — submit a generalizable gate as a GitHub issue on `jghiringhelli/quality-gates`.

**ADRs / decisions / CNT**
- `generate_adr` — emit a MADR ADR into `docs/adrs/`.
- `generate_decision` — emit a post-mortem stub into `docs/decisions/` (Trigger/Root cause/Fix/Regression test/Chronicle link).
- `generate_roadmap`, `extract_adrs_from_history` — mine git log for retroactive ADR stubs.
- `extract_adrs_from_spec` — parse a spec/PRD for technology decisions → ADR stubs.
- `review_stubs` — triage `[NEEDS CLARIFICATION]` stubs across ADRs/decisions/CNT leaves.
- `cnt_add_node` — add a CNT leaf (`.claude/standards/<domain>-<concern>.md`).
- `cnt_add_routing` — append routing directives to `.claude/index.md` for unrouted CNT leaves.

**Scoring & close_cycle**
- `audit` — compliance score 0–100 + anti-pattern scan.
- `verify` — run tests + score the 7 GS properties (0–14).
- `metrics` — external code-quality report (LOC/coverage/layer violations/optional mutation).
- `review` — code-review checklist.
- `score_rubric` — gather evidence for all 7 GS properties and emit an LLM-judged scoring prompt.
- `get_verification_strategy` / `record_verification` / `verification_status` — uncertainty-aware verification plan and acceptance ledger.
- `close_cycle` — end-of-cycle gate (see §6).

**Reference / contribution / misc**
- `list` (tags|hooks|skills) · `get_reference` (nfr|design_patterns|playbook|guidance) · `advice` · `setup_monitoring`.
- `review_stubs`, `analyze_harness` (also gate-contribution paths).

---

## 4. Configuration — `forgecraft.yaml`

The single project config is **`forgecraft.yaml`** at the project root (typed by
`ForgeCraftConfig` in `src/shared/types/config.ts`). The legacy `.forgecraft.json` name described in
the old spec is **gone as a primary config**; a few internal code paths still reference it only as a
fallback alias, and `.forgecraft/` (a directory) is unrelated — it holds gates, violations, and
signals, not config.

Representative `forgecraft.yaml`:

```yaml
projectName: my-api
tags: [UNIVERSAL, API, FINTECH]
tier: recommended                  # core | recommended | optional
outputTargets: [claude, cursor, copilot]
compact: true                      # ~20-40% smaller instruction output
releasePhase: production           # development | pre-release | release-candidate | production
language: typescript               # typescript | python (persisted)
include: []                        # force-include block IDs
exclude: [cqrs-event-patterns]     # force-exclude block IDs
templateDirs: [./company-standards]
variables:
  coverage_minimum: 90
  max_file_length: 400
tools:                             # language-agnostic commands hooks call
  test: npm test
  typecheck: npx tsc --noEmit
  lint: npm run lint
  mutation: npx stryker run
  audit: npm audit --audit-level=high
gates_registry_url: https://raw.githubusercontent.com/jghiringhelli/quality-gates/master/index.json
contribute_gates: false
cascade:                           # per-step required/optional decisions (AI-decided, tool-enforced)
  steps:
    - { step: functional_spec,      required: true, rationale: "...", decidedAt: "2025-01-15", decidedBy: scaffold }
    - { step: architecture_diagrams, required: true, rationale: "...", decidedAt: "...", decidedBy: scaffold }
    - { step: constitution,         required: true, ... }
    - { step: adrs,                 required: true, ... }
    - { step: behavioral_contracts, required: true, ... }
experiment: { id: dx-2026-vaquita, type: greenfield, group: gs }   # optional; labels gate contributions
```

### The docs-manifest contract

`forgecraft.yaml` governs generation; the **document taxonomy** is governed separately by
`docs/manifest.yaml`, which references the canonical schema shipped at
`templates/docs-manifest.yaml`. The canonical manifest is the single source of truth honored by all
GS-aware tools (forgecraft, chronicle, chronicle-team). It declares:

- **Document slots** — `specs/`, `adrs/{active,done}/`, `use_cases/`, `roadmaps/{active,done}/`,
  `schemas/`, `decisions/`, `contracts/`, `session_prompts/` — each with `path`/`pattern`/`required_on`.
- **Cascade rules** — which conventional-commit types must touch which slots (e.g. `feat` requires
  `specs`; `fix` requires a regression test), with severity `error|warning|info`.
- **`api_surface`** anti-drift — public-surface changes (exports, public types, CLI flags, MCP tool
  schemas) require a `specs`/`adrs` touch regardless of commit type.
- **`human_judgment`** gate — protected branches, `min_reviewers` (0 = solo), require tests pass /
  human ack, block AI-only merges.
- **`recording`** — three-tier memory lanes (project=forgecraft, individual=chronicle, team=chronicle-team).
- **`brownfield`** ingestion settings.

Projects do not copy the canonical file; they write a small `docs/manifest.yaml` that sets
`schema_source` and `overrides:` for legacy paths. Resolution order: project `overrides:` →
project top-level fields → canonical defaults.

---

## 5. The Gate System

Quality gates are structured pass/fail checks an assistant runs at defined moments (pre-commit,
pre-release, post-deploy). They are not linter rules; each carries a condition, an evidence
requirement, and a human-review flag. Gates live as YAML under `.forgecraft/gates/`:

- `.forgecraft/gates/active/` — installed/enforced gates for this project.
- `.forgecraft/gates/registry/<pack>/` — the curated library, installed at setup for the project's
  tags into packs: **`universal`** + domain packs **`api`**, **`cli`**, **`infra`**, **`ml`**,
  **`web-react`**, **`web-next`**. Registry gates are reviewed and *promoted* to `active/` — never
  auto-activated.

### Registry gate schema (the generalizable shape)

```yaml
id: spec-response-field-asserted
title: Spec-Declared Response Fields Must Have Contract Assertions
description: >-
  When an API spec declares a response field, a contract test must assert it exists...
category: api-contracts
gsProperty: verifiable          # which of the 7 GS properties this defends
phase: development              # development | pre-release | release-candidate | deployment | post-deployment
hook: pre-commit                # where it fires
check: >-                       # how to evaluate (steps / heuristic)
  1. Parse the spec for declared response fields. 2. Confirm a jsonpath assertion per field...
passCriterion: >-               # the precise condition for a pass
  Every spec-declared response field has a contract-test assertion that it exists.
tags: [API]
generalizable: true             # eligible for promotion to the community registry
evidence: >-                    # concrete field/experiment evidence motivating the gate
  Vairix DELTA-057/082 — backend dropped a declared field; no test failed for weeks.
provenance:                     # where the gate came from (experiment, finding, gap id)
  experiment: vairix-delta-050-100
  finding: spec-declared response field dropped, no contract assertion
  discovered_in: GS field use (Vairix), gap G4
status: approved
approvedAt: '2026-06-08'
contributor: jghiringhelli
```

Some older `active/` gates use a simpler **declarative** shape (`severity: P1`, `phase`, `tags`,
`check: { any_of: [{path: …}] }`, `message`, `resolution`) — e.g. `mutation-testing-required.yaml`.
Both shapes coexist; the registry shape above is the canonical, generalizable form.

**Gate provenance & genesis.** Drafts carry `origin: genesis` (system-detected from repeated
violations) vs `origin: organic` (AI/dev-proposed). `close_cycle` runs *gate genesis*: it scans
`gate-violations.jsonl` (≥3× the same hook) and the corrections log (≥2× same category) and writes
draft gate stubs to `.forgecraft/gates/drafts/`. `contribute_gate` submits a generalizable gate as a
GitHub issue on `jghiringhelli/quality-gates` (`gh` CLI primary, pre-filled issue URL fallback).

---

## 6. The Four-Layer Ratchet & `close_cycle`

ForgeCraft applies TDD at every layer. Each layer has its own spec artifact, its own verification
mechanism, and an unambiguous regeneration target on failure — *fix the spec/impl, don't patch the
symptom*:

| Layer | Spec artifact | Verification | Failure → regenerate |
|---|---|---|---|
| **L1 Blueprint** | Use cases, ADRs, gates | Gate evaluation at `close_cycle` | The missing spec artifact |
| **L2 Behavioral Harness** | UC postconditions + probe specs | Probe execution (`run_harness`) | The implementation |
| **L3 Environment** | Env contracts + IaC | `run_env_probe` | The infrastructure config |
| **L4 Monitoring/SLO** | NFR contracts + SLO specs | `run_slo_probe` (+ `check_t4` signals) | The alert/dashboard config |

A failing probe is treated as a **specification violation**, not a test failure. `layer_status`
reports L1–L4 completion per use case and flags hollow probes (pass with 0 assertions), stubs
(`not_implemented`), and partial coverage.

**`close_cycle`** is the end-of-cycle gate. It re-runs the cascade, assesses gates, runs gate genesis
(promoting repeated violations/corrections into draft gates), blocks on `not_implemented` probes, and
updates the live state leaf so the next session starts from current state, not stale docs.

The four-layer ratchet is ForgeCraft's enforcement answer to the shared Spec-Driven-Development
premise: where Spec Kit and OpenSpec rely on human discipline, ForgeCraft relies on *structure* —
a machine-readable signal that blocks progress when the spec is violated (see `docs/design-philosophy.md`).

---

## 7. Artifacts Emitted

A scaffolded project (via `setup_project` / `scaffold`) contains:

- **Architectural constitution / CNT** — a slim routing root `CLAUDE.md` (≤80 lines) plus a
  multi-file Contextual Navigation Tree under `.claude/`: `index.md` (router), `core.md`
  (always-loaded), `constitution.md`, `lifecycle.md`, `routes/`, `corrections.md`, `standards/`,
  `agents/`, `commands/`, `gates/index.md`, `adr/index.md`, and a live **`.claude/state.md`** leaf
  rewritten by `close_cycle`. Also generated for other assistants: `.cursor/rules/`,
  `.github/copilot-instructions.md`, `.windsurfrules`, `.clinerules`, `CONVENTIONS.md`.
- **Document taxonomy** — `docs/manifest.yaml` plus `docs/PRD.md`, `docs/TechSpec.md`,
  `docs/use-cases.md`, `docs/status.md`, `docs/roadmaps/active/roadmap.md`, `docs/diagrams/*`,
  `docs/adrs/` (MADR ADRs, `active/` + `done/`), `docs/decisions/`.
- **`docs/learning-graph.csv`** — the harness serialized as a Compact Knowledge Graph (4-column
  `ConceptID,ConceptLabel,Dependencies,TaxonomyID`, DAG-validated). Derived artifact, regenerated on
  setup, never session-routed.
- **Hooks** — `.claude/hooks/` pre-commit/commit-msg/pre-push quality gates (compile, lint,
  complexity, coverage, secrets, anti-patterns, doc-cascade, `@gs-links`, etc.), stack-filtered.
- **`.forgecraft/`** — gates (`active/`, `registry/`, `drafts/`), `gate-violations.jsonl`,
  `t4-signals.json`, `exceptions.json`.
- **`gs-score.md`** — the GS property scoreboard written by the scoring path (`verify` /
  `score_rubric` via `gs-score-logger`).

---

## 8. Status / Not-Yet-Built

- **Discipline scoring is stubbed.** `src/disciplines/catalog.ts` enumerates structural disciplines
  (SOLID, hexagonal, layered, clean architecture, DDD, TDD-as-practice) with working `detect()`
  heuristics, but every `score()` returns a `TODO_PLACEHOLDER` (`score: 0`, evidence
  `"TODO: scoring heuristic not yet implemented (skeleton)"`). Calibration anchors are deferred.
- **`add_module` scaffolds are intentional stubs.** Generated module CRUD methods `throw new
  Error("Not implemented")` / `raise NotImplementedError` with `// TODO` markers — they are
  starting points, not working code.
- **MCP surface duplication.** The stdio server registers both the sentinel and a heavier
  `forgecraft_actions` router; the documented/recommended posture is sentinel-only, and the hosted
  HTTP server already conforms (sentinel + `list_tags` only). Treat the CLI as the canonical full
  surface.
- **Two gate schema shapes coexist** (registry `gsProperty/passCriterion/evidence` form vs. older
  declarative `severity/check.any_of/message` form); convergence on the registry form is in progress.
- **Brownfield ingestion** relies on an external `pragmaworks-cli` scanner, not embedded code.
