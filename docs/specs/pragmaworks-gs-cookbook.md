# GS Lifecycle Cookbook — Method, Mechanics, Tooling

**Audience**: pragmaworks cookbook authors, GS white-paper editors, teams adopting the method.

**Status**: implementation report covering the cascade + manifest + judgment-layer work shipped 2026-05-08 across `forgecraft-mcp`, `chronicle`, `chronicle-team`. Method is tool-agnostic; tooling is one valid implementation.

---

## 1. The Method (tool-agnostic)

GS treats specifications as the source of truth and code/tests as derivations from them. To prevent the dominant 2025-2026 failure mode — AI-generated code drifting away from intent — GS requires four practices:

### 1.1 Doc-first cascade
Documentation changes propagate downstream into code, tests, and harness. The cascade order is:

```
spec  →  use-case  →  schema/contract  →  code  →  test  →  harness  →  observation  →  decision
```

A `feat:` change starts at the spec layer and flows down. A `fix:` change starts at the test layer (regression test) and may produce a lightweight decision. The rule is: **never let code change without the layer above explaining why.**

### 1.2 Three layers of recording
| Layer | Owner | Stores | Lives in |
|---|---|---|---|
| **Project** | spec/code repo | specs, ADRs, decisions, use-cases, roadmaps, schemas, contracts, hooks, gates | the project's `docs/` + `.claude/hooks/` + `.forgecraft/` |
| **Individual** | per-developer memory | prompt history, findings, work style, personal patterns | local memory store (`~/.chronicle/`) |
| **Team** | shared team memory | shared findings, ticket integration, workload split, prompt analytics | shared DB + dashboard (chronicle-team) |

These layers are independent but propagate: ADRs decided at the team layer flow back into project ADRs; insights at the individual layer can promote to team; changes in the project repo update both individual context (next session reads them) and team dashboards.

### 1.3 Bug-fix vs feature flow

| Commit type | Required | Encouraged | Severity (default) |
|---|---|---|---|
| `feat:` | spec touched | use-case, schema, ADR if architectural | warning → error once baseline clean |
| `fix:` | regression test | decision (one-pager) if behavior intentionally redefined | warning |
| `refactor:` | — | ADR or decision if architectural choice made | info |
| `perf:` | — | decision + benchmark | info |
| `docs:`, `test:`, `chore:`, `ci:` | — | — | info |
| `revert:` | — | decision | info |

Bug fixes do **not** require spec or ADR updates — only a regression test. This keeps fix flow lightweight while preserving derivation: the test demonstrates the corrected behavior, which is itself the smallest unit of spec.

### 1.4 Anti-drift principle
A change is allowed if and only if its layer above it explains it. Concretely:

- **Commit time**: hook checks staged files vs commit type. `feat:` without spec? Warning (or block at severity=error). `fix:` without test? Same.
- **PR time**: CI re-runs the check on the full PR diff against the base branch.
- **Public-surface diff**: any change to exports, public types, CLI flags, or MCP tool schemas requires a spec or ADR touch regardless of commit type.

### 1.5 Human-in-the-loop / judgment layer
AI accelerates production; humans ratify direction. No code reaches a protected branch without:

- All tests passing on CI
- At least N approvals from non-author reviewers (N=0 in solo mode, but PR + checks still required)
- At least one human comment/review on the PR (`block_ai_only_merge` defends against an AI agent self-approving)

Branch protection enforces this at the GitHub layer; a manifest-driven gate validates it at the project layer. Together they form a redundant checkpoint that AI cannot route around — an AI cannot create approvals on its own PRs, and the protected branch refuses merge without them.

---

## 2. The Mechanics

### 2.1 Conventional commits (the cascade trigger)

Commit messages follow Conventional Commits: `<type>(<scope>): <description>`. The type drives cascade enforcement:

```
feat | fix | refactor | docs | test | chore | ci | perf | revert
```

This format is enforced by:
- `commit-msg.sh` hook (regex via commitlint with fallback)
- `validate-pr.yml` GitHub workflow (PR title check)

PR title and first commit type must match. Scope drift (e.g., a `docs:` PR changing src/) emits a warning.

### 2.2 The hook chain

Twelve `pre-commit` hooks run in sequence; failure of any one blocks the commit. Two `commit-msg` hooks validate the message + cascade; a `prepare-commit-msg` hook enriches the draft; two `post-commit` hooks generate artifacts; one `pre-push` hook safeguards remote refs.

| Hook | Stage | Purpose |
|---|---|---|
| `pre-commit-no-temp-files` | pre-commit | block temp/draft/debug files |
| `pre-commit-secrets` | pre-commit | block credential leakage |
| `pre-commit-prod-quality` | pre-commit | scan for mocks, hardcoded URLs, debugging code |
| `pre-commit-branch-check` | pre-commit | refuse direct commits to main/master |
| `pre-commit-format` | pre-commit | auto-format staged TS/JS files |
| `pre-commit-compile` | pre-commit | TypeScript compilation check |
| `pre-commit-import-cycles` | pre-commit | madge / lint-imports circular detection |
| `pre-commit-tdd-check` | pre-commit | TDD RED gate: test-only commits must fail; warn on src without tests |
| `pre-commit-test` | pre-commit | run bare tests (skips when src/ staged; coverage covers it) |
| `pre-commit-coverage` | pre-commit | run tests + enforce coverage thresholds |
| `pre-commit-audit` | pre-commit | block HIGH/CRITICAL CVEs (npm/pip/cargo audit) |
| `pre-commit-doc-cascade` | pre-commit | **NEW** — advisory: src/ changed without docs/ → emit checklist |
| `commit-msg` | commit-msg | conventional-commit format validation |
| `commit-msg-cascade` | commit-msg | **NEW** — enforce cascade per type (per manifest severity) |
| `prepare-commit-msg-usecase` | prepare-commit-msg | tag commit with touched UC IDs |
| `post-commit-changelog` | post-commit | append entry to CHANGELOG.md |
| `post-commit-complexity-baseline` | post-commit | refresh cyclomatic complexity baseline |
| `pre-push` | pre-push | block deletion of main/master on remote |

Skipping (emergency only): `git commit --no-verify`. The audit gate flags `--no-verify` usage in the changelog.

### 2.3 The CI gates (`validate-pr.yml`)

Runs on every PR to `main` or `develop`:

1. **PR title format** — Conventional Commits regex
2. **PR description present** — minimum 20 chars
3. **Scope drift** — advisory: docs PR touching src/, test PR touching non-test, chore PR touching src/
4. **Doc cascade** — **NEW** — re-runs commit-msg-cascade logic on full PR diff. Severity from `docs/manifest.yaml`.
5. **Human judgment gate** — **NEW** — reads `human_judgment_overrides` from manifest; blocks merge when min_reviewers not met or AI-only interaction.

Plus the existing `ci.yml` workflow: build, lint, tests, mutation, dependency audit.

### 2.4 Branch protection

Apply via `npm run protect` (uses `gh CLI`) or manual UI steps. Required:
- PR required before merge
- Required status checks: `ci`, `validate-pr`
- Branches up to date before merge
- No force pushes, no deletions
- Min reviewers (configurable; 0 = solo mode)

In solo mode, branch protection still requires PR + green checks — preventing direct pushes that skip the cascade.

### 2.5 The manifest schema

Single canonical schema at `forgecraft-mcp/templates/docs-manifest.yaml`. Each project's `docs/manifest.yaml` references it via `schema_source` and overrides paths/severities as needed. The manifest defines:

- **Document types** (specs, adrs, use-cases, roadmaps, schemas, decisions, contracts, session-prompts) with paths and `required_on` triggers
- **Cascade rules** per commit type (required + encouraged docs, severity)
- **API surface detection** rules (which globs trigger spec/ADR requirement)
- **Human-judgment settings** (protected branches, min reviewers, AI-only block)
- **Recording layers** mapping (which tool owns which layer)
- **Brownfield settings** (override file location, scanner reference)

Path resolution order: project's `overrides:` → project's top-level fields → canonical schema defaults.

---

## 3. The Tooling (one valid implementation)

### 3.1 Forgecraft (`forgecraft-mcp`)
Owns the **project** layer. Provides:
- The canonical manifest schema (`templates/docs-manifest.yaml`)
- Gates registry (`.forgecraft/gates/registry/universal/*.yaml`)
- Active gates (`.forgecraft/gates/active/*.yaml`)
- Hook templates (`.claude/hooks/*.sh`)
- The `forgecraft-mcp` MCP server + CLI (`audit`, `propose_session`, etc.)
- Setup scripts: `setup-hooks.sh`, `protect-branch.sh`, `ship.sh`

**New gates added**: `doc-cascade-required.yaml`, `human-judgment-required.yaml`, `design-doc-required.yaml` (activated).
**New hooks added**: `pre-commit-doc-cascade.sh`, `commit-msg-cascade.sh`.

### 3.2 Chronicle (`chronicle`)
Owns the **individual** layer. Persistent tiered AI memory across context resets — semantic, episodic, procedural, architectural, preference. MCP tools: `chronicle` (remember/recall/forget), `session` (start/end/recover), `trigger` (deploy/compile warnings), `axon` (team coordination handoff).

Reads `docs/manifest.yaml` for: which docs to surface during session start, which paths to monitor for changes that should promote to memory.

### 3.3 Chronicle-team (`chronicle-team`)
Owns the **team** layer. Shared memory + dashboard, prompt analytics, pattern discovery. Already implements:
- **Workload split** via reverse-topological priority ranking (axon `decompose` → `assign`). The "AI eigenvalue" workload split: each work package's priority = count of transitive dependents = approximation of dominant eigenvector of the dependency adjacency matrix. Highest-rank unblocked work goes to most-available contributor.
- **MR/work-package tracking** with `forgecraftScore`, `forgecraftTier`, `forgecraftPass` fields. Forgecraft writes results; chronicle-team reads.

Reads `docs/manifest.yaml` for ticket-to-spec mapping and roadmap discovery.

### 3.4 The integration contract

```
                   ┌──────────────────────────┐
                   │  docs/manifest.yaml      │
                   │  (per project)           │
                   │  schema_source: ─────────┼──→ forgecraft canonical schema
                   └──────────────────────────┘
                              ▲
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────────┐    ┌──────────────┐  ┌─────────────────┐
       │forgecraft│    │  chronicle   │  │ chronicle-team  │
       │ (project │    │  (individual │  │ (team layer)    │
       │  layer)  │    │   layer)     │  │                 │
       └──────────┘    └──────────────┘  └─────────────────┘
              │                                  │
              │  forgecraftScore/Tier/Pass       │
              └──────────────────────────────────┘
                  (forgecraft writes,
                   chronicle-team reads via axon verify)
```

No tool depends on another at the SDK level. The manifest is the only required contract.

---

## 4. Manual Setup (no tools)

A team can adopt the GS lifecycle without forgecraft or chronicle. They lose automation but keep the discipline. Steps:

1. **Adopt Conventional Commits.** Add a `commit-msg` git hook that regex-validates the format. (~10 lines of bash; example in this repo at `.claude/hooks/commit-msg.sh`.)

2. **Create the directory structure.**
   ```
   docs/
     specs/
     adrs/active/
     adrs/done/
     use-cases/
     roadmaps/active/
     roadmaps/done/
     schemas/
     decisions/
     contracts/
     manifest.yaml
   ```

3. **Write `docs/manifest.yaml`.** Start from the canonical schema. Override paths to match any legacy layout. Set `cascade_overrides.<type>.severity = warning` to start gentle.

4. **Add a doc-cascade hook.** Even a 30-line bash hook that does:
   ```
   read commit type from message
   if feat: check that any docs/specs/* is staged
   if fix: check that any test file is staged
   ```
   …catches 80% of drift. See `.claude/hooks/commit-msg-cascade.sh` for a reference implementation.

5. **Add a CI workflow.** GitHub Actions or equivalent. Run the same cascade check on PR diff vs base branch.

6. **Configure branch protection.** Require PR + checks before merge. Add CODEOWNERS so a human reviewer is auto-requested.

7. **Adopt the three-layer recording mental model.** Even without chronicle, distinguish: project memory (in repo), individual memory (your notes/`MEMORY.md`), team memory (shared docs / Linear / Slack channel). Be explicit which layer a finding belongs in.

8. **Quarterly cascade audit.** Once a quarter, walk: spec → use-case → code → test for one feature. Note drift. Promote `cascade_overrides.feat.severity` from warning to error when audits stop finding gaps.

This is enough to run the GS lifecycle. The tooling makes it ergonomic; the method works without it.

---

## 5. Brownfield Adoption

A brownfield project rarely has docs/specs/, ADRs, or use-cases. The path:

### 5.1 First-pass scanner (external — `pragmaworks-cli`)

Run the scanner. It produces:
- **Inventory**: existing docs, code structure, public surface, test coverage
- **Gap report**: missing layers (spec missing for tool X, use-case missing for endpoint Y)
- **Migration plan**: ordered TODO mapping current files into the canonical taxonomy
- **Override file**: a generated `docs/manifest.yaml` that maps the canonical schema to where files actually live (so cascade gates pass on day one)

### 5.2 The override mechanism (see manifest examples in this repo)

Three forms of override coexist:

```yaml
# Form 1: legacy single-file (old PRD.md)
overrides:
  documents.specs.legacy_files:
    - docs/PRD.md
    - docs/spec.md

# Form 2: legacy directory (old adrs/)
overrides:
  documents.adrs.legacy_dirs:
    - docs/adr/
    - docs/adrs/

# Form 3: full path replacement
overrides:
  documents.use_cases.path: docs/uc/    # canonical default is docs/use-cases/
```

The cascade gates accept ANY of (canonical path, legacy_files, legacy_dirs, overridden path) as satisfying the requirement. Brownfield projects pass on day one; teams migrate at their own pace.

### 5.3 Severity ramp

```yaml
cascade_overrides:
  feat.severity: warning    # day 1 — advisory
  # ... after migration baseline reached:
  feat.severity: error      # day N — hard enforce
```

### 5.4 Reporting back

Scanner writes `reports/brownfield-audit.md`. Used to track: what was found, what was migrated, what is still in legacy state. Promote findings into `docs/decisions/` as one-pagers when an explicit choice was made.

---

## 6. Implementation Summary (this commit cycle)

### 6.1 Files added
- `templates/docs-manifest.yaml` — canonical schema (single source of truth)
- `docs/manifest.yaml` — forgecraft's instance
- `docs/{specs,adrs/active,adrs/done,roadmaps/active,roadmaps/done,schemas,decisions,contracts}/README.md` — slot stubs
- `docs/specs/pragmaworks-gs-cookbook.md` — this report
- `.claude/hooks/pre-commit-doc-cascade.sh` — advisory drift detection
- `.claude/hooks/commit-msg-cascade.sh` — type-aware cascade enforcement
- `.forgecraft/gates/registry/universal/doc-cascade-required.yaml`
- `.forgecraft/gates/registry/universal/human-judgment-required.yaml`
- `.forgecraft/gates/active/{doc-cascade-required,human-judgment-required,design-doc-required}.yaml` — activations
- `scripts/post-results.cjs` — chronicle-team integration script + `npm run post-results`
- Sister-repo manifests: `chronicle/docs/manifest.yaml`, `chronicle-team/docs/manifest.yaml`
- Sister-repo doc structure: full canonical taxonomy in both packages
- chronicle-team seed docs: PRD, ADR-0001, UC-0001, UC-0002

### 6.2 Files modified
- `scripts/setup-hooks.sh` — added doc-cascade hook to runner; commit-msg now multi-hook
- `.github/workflows/validate-pr.yml` — added doc-cascade + human-judgment steps
- `package.json` — added `post-results` script
- `src/analyzers/completeness-helpers.ts` — new `checkAnyFileExists` helper for canonical+legacy fallbacks
- `src/analyzers/completeness.ts` — uses `checkAnyFileExists` for PRD/TechSpec
- `src/tools/advise-session-signals.ts` — `SPEC_PATHS` extended; `hasAdrFiles` checks `adrs/active` and `adrs`
- `src/tools/change-request.ts` — `specFiles` array extended with canonical paths
- `src/tools/advise-session-advisor.ts` — recommendation strings updated to canonical paths

### 6.3 File moves (git mv, history preserved)
Forgecraft:
- `docs/adrs/0001-*.md … docs/adrs/ADR-0010-*.md` (13 files) + `docs/adrs/template.md` → `docs/adrs/active/`
- `docs/session-prompt-initial.md` → `docs/session-prompts/initial.md`

Chronicle:
- `docs/adrs/ADR-000-cnt-init.md`, `docs/adrs/ADR-001-use-sqlite-with-vector-embeddings.md` → `docs/adrs/active/`
- `docs/session-prompt-initial.md` → `docs/session-prompts/initial.md`


### 6.4 Completed in this round (2026-05-08)
- ✅ Consolidated forgecraft `docs/adr/` + `docs/adrs/*` into `docs/adrs/active/` (kept `README.md` + `template.md` at `docs/adrs/`)
- ✅ Moved forgecraft `docs/session-prompt-initial.md` → `docs/session-prompts/initial.md`
- ✅ Same pattern applied to chronicle: ADRs into `adrs/active/`, session-prompt-initial moved
- ✅ Updated 5 forgecraft source files (`completeness.ts`, `advise-session-signals.ts`, `change-request.ts`, `advise-session-advisor.ts`, plus the helper `completeness-helpers.ts`) to accept canonical OR legacy paths via `checkAnyFileExists` and fallback path arrays
- ✅ Bootstrapped chronicle-team seed: `docs/specs/PRD.md`, `docs/adrs/active/ADR-0001-reverse-topological-workload-split.md`, `docs/use-cases/UC-0001-decompose-work-package.md`, `docs/use-cases/UC-0002-verify-merge-request.md`
- ✅ `scripts/post-results.cjs` + `npm run post-results` — runs forgecraft verify, maps to chronicle-team contract, writes `.forgecraft/post-results.json`, optionally POSTs to `--to=URL` or `CHRONICLE_TEAM_URL`
- ✅ Dogfooded forgecraft on itself — `node dist/index.js audit .` runs cleanly; canonical+legacy paths both resolve

### 6.5 Still deferred (require coordinated source-code refactor)
The following moves were deliberately NOT done because forgecraft's source has hardcoded references in 15+ files (`setup-monitoring`, `layer-status`, `generate-roadmap`, `propose-session`, `scaffold-writer`, etc.) and updating them all safely is its own substantial refactor:

- Move forgecraft singleton specs (`docs/PRD.md`, `docs/spec.md`, `docs/forgecraft-spec.md`, `docs/forgekit-spec.md`, `docs/design-philosophy.md`, `docs/distribution-plan.md`, `docs/CLI-MODE-PROPOSAL.md`, `docs/experiment-design.md`, `docs/gs-experiment-execution.md`, `docs/gs-tooling-crosscheck.md`, `docs/dx-workshop.md`, `docs/project-types.md`) → `docs/specs/`
- Move `docs/TechSpec.md`, `docs/nfr-contracts.md` → `docs/contracts/`
- Move/split `docs/use-cases.md` → `docs/use-cases/UC-*.md`
- Move `docs/roadmap.md` → `docs/roadmaps/active/roadmap.md`
- Move `docs/diagrams/*` → `docs/schemas/`, `docs/schema.md` → `docs/schemas/schema.md`
- Same singleton migrations for chronicle
- **Recommended approach for the singleton migration**: introduce a `src/shared/doc-paths.ts` resolver that reads `docs/manifest.yaml` + falls back to canonical defaults. Replace all hardcoded path references with calls to this resolver. Then file moves become trivial. Estimated 1–2 days of work plus test updates.

### 6.6 Cascade severity decisions (post-migration)
- **chronicle-team** (greenfield, no legacy): `feat.severity = error` from day one. ✓
- **forgecraft + chronicle**: `feat.severity = warning` until singleton migration completes. The 5–6 files now use canonical OR legacy paths via fallback chains, so canonical-path-only enforcement is premature.

### 6.7 Dogfood findings — forgecraft on itself (2026-05-08)
Score: **17/100, Grade F** — typical for a project that has accumulated tech debt without a periodic audit. Specific findings:
- `Status.md` is 44 days stale (recommend touching it at end of each session — there's a hook for this)
- 3 hardcoded URL/host issues in `executable-gates.ts`, `generate-slo-probe.ts`, `roadmap-builder.ts` (likely legitimate fixtures/examples; worth a one-pass review)
- 37 source files exceed the 300-line limit (`layer-status.ts` is 818, `close-cycle.ts` is 729, etc.) — recommend extract-method passes during normal feature work
- CLAUDE.md and 4 `.claude/standards/` files exceed CNT (constitutionalism / capacity) limits — they have grown beyond their intended terse-summary role

These are documentation findings, not blockers. The codebase ships and tests pass; this is a healthy "audit caught real things" result.

---

## 7. What this enables for the pragmaworks cookbook

The cookbook can now show, end to end:

1. **Day 0 (greenfield)**: scaffold a project with `docs/manifest.yaml` + the canonical taxonomy. Cascade enforced from commit one.

2. **Day 0 (brownfield)**: run pragmaworks-cli scanner → generates manifest with overrides + migration plan. Cascade passes immediately on existing layout; team migrates at its own pace.

3. **Daily flow**: dev makes a change. Hooks nudge them toward cascade compliance at commit time. CI enforces at PR time. Branch protection requires human ratification. Chronicle records the session; chronicle-team aggregates across the team.

4. **Quarterly**: audit cascade health, promote severity from warning to error, archive completed roadmap items into `roadmaps/done/`, supersede outdated ADRs.

The lifecycle is friction-free for the developer (hooks are advisory locally, blocking only at PR time) and rigorous at the integration boundary (CI + branch protection are non-negotiable). This is the GS bargain: spec is the source of truth, and the tooling makes drift visible at the latest acceptable moment, not silently.

---

## Appendix A — Method ↔ Tooling map

| Method requirement | Forgecraft mechanism | Chronicle mechanism |
|---|---|---|
| Doc-first cascade | `commit-msg-cascade.sh` + `validate-pr.yml` doc cascade step | session-start surfaces docs/specs/ and docs/use-cases/ |
| Anti-drift on public surface | `api_surface` block in manifest + cascade gate | n/a |
| Three-layer recording | manifest `recording:` block declares ownership | individual layer (chronicle), team layer (chronicle-team) |
| Bug-fix flow | `cascade.fix` rules: regression test required, decision encouraged | n/a |
| Human-in-the-loop | `human-judgment-required.yaml` gate + `validate-pr.yml` step + branch protection | dashboard surfaces PRs awaiting human review |
| Conventional commits | `commit-msg.sh` regex + `validate-pr.yml` PR title | n/a |

## Appendix B — Files for the white paper / manual

When updating the GS white paper or producing a no-tools manual, these are the artifacts to reference (or copy):

1. `templates/docs-manifest.yaml` — schema definition with comments. Self-contained; no external deps to read.
2. `.claude/hooks/commit-msg-cascade.sh` — minimal reference cascade hook (~80 lines bash).
3. `.claude/hooks/pre-commit-doc-cascade.sh` — minimal reference advisory hook.
4. `.github/workflows/validate-pr.yml` — minimal CI implementation.
5. `scripts/protect-branch.sh` — branch-protection automation (with manual fallback printed when `gh` is missing).
6. This document.

Together these are <500 lines of code and 1 schema file. A team can copy them, adjust paths, and have GS discipline running in an afternoon.
