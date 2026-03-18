# ForgeCraft MCP — Canonical Specification

> This is the authoritative specification for ForgeCraft MCP.
> It satisfies all six properties of a Generative Specification (ADR-0001).
> Last updated: 2026-03-07 | Version: 0.5.x

---

## 1. Identity (Self-describing)

**Name:** ForgeCraft MCP
**Purpose:** An MCP server and CLI tool that installs Generative Specification
into software projects — generating instruction files, hooks, and structural
scaffolding that constrain AI agent behavior to project-specific engineering standards.

**Governed artifacts:**
- `src/` — TypeScript source (MCP tool handlers, registry, analyzers, templates)
- `templates/` — YAML instruction blocks indexed by project tag
- `.claude/hooks/` — Pre-commit enforcement scripts
- `scripts/` — Developer tooling (setup-hooks.sh)
- `tests/` — Test suite (unit + integration + e2e)

**Not governed by this spec:**
- User projects that ForgeCraft scaffolds (they get their own specs)
- The publishing pipeline (see `../PUBLISHING-PLAYBOOK.md`)

---

## 2. Scope (Bounded)

### In scope
- MCP tool handlers: `setup_project`, `generate_instructions`, `refresh_project`,
  `scaffold_project`, `audit_project`, `review_project`, `classify_project`,
  `add_hook`, `add_module`, `configure_mcp`, `get_nfr_template`
- Template YAML registry (loading, composition, rendering)
- Project analyzers (tag detection, completeness, language detection)
- Shared infrastructure (config, errors, logger, filesystem utilities)
- CLI entry point (`src/cli.ts`)
- All tests in `tests/`

### Out of scope
- Template content decisions (those are per-tag ADRs)
- MCP SDK internals
- Node.js runtime behavior

---

## 3. Verification Criteria (Verifiable)

The spec is satisfied when ALL of the following pass:

| Gate | Tool | Pass condition |
|---|---|---|
| TypeScript compiles | `npx tsc --noEmit` | 0 errors |
| All tests pass | `npx vitest run` | 0 failures |
| Coverage ≥80% lines | `npx vitest run --coverage` | threshold met |
| No production anti-patterns | `pre-commit-prod-quality.sh` | 0 violations |
| No secrets in diff | `pre-commit-secrets.sh` | 0 matches |
| No temp/draft files | `pre-commit-no-temp-files.sh` | 0 blocked files |
| Spec artifacts composed | `checkComposition(allSpecs)` | composable: true |

---

## 4. Quality Gates (Defended)

Automated enforcement runs at every `git commit` via `.git/hooks/pre-commit`.
Gates execute in order: fail-fast on the first blocking violation.

```
Commit attempt
  └─ pre-commit-no-temp-files.sh   (blocks temp/draft/unofficial files)
  └─ pre-commit-secrets.sh          (blocks credential exposure)
  └─ pre-commit-prod-quality.sh     (blocks hardcoded URLs, mock data, god files)
  └─ pre-commit-branch-check.sh     (warns on direct commits to main)
  └─ pre-commit-format.sh           (auto-formats staged TS/JS)
  └─ pre-commit-compile.sh          (blocks TypeScript errors)
  └─ pre-commit-test.sh             (blocks test failures and coverage regression)
```

Claude agent hooks (in `.claude/settings.json`):
- `PreToolUse[run_in_terminal]` → `pre-exec-safety.sh` (blocks destructive commands)
- `PostToolUse[file edits]` → `post-edit-commit-reminder.sh` (warns at 15+ uncommitted files)

---

## 5. Decision History (Auditable)

| ADR | Decision | Status |
|---|---|---|
| ADR-0001 | Adopt Generative Specification methodology | accepted |

All architectural decisions are in `docs/adrs/`.
Before implementing a structural change, check: does an ADR cover this area?
If not, write one before implementing.

---

## 6. Composition Rules (Composable)

ForgeCraft composes project specs from tag combinations (UNIVERSAL + LIBRARY + CLI + API).
Composition rules:

- `UNIVERSAL` is always required (base layer)
- Tags combine additively — instruction blocks are merged, not overwritten
- No two tags may define conflicting constraints for the same artifact type
- The composed spec's module dependency graph must be acyclic (verified by `checkComposition`)

ForgeCraft's own spec artifacts (`src/core/`, `src/artifacts/`):

```
CommitHooksArtifact    (no deps)
AdrArtifact            (no deps)
SchemaArtifact         (no deps)
CommitHistoryArtifact  (no deps)
ClaudeInstructionsArtifact  (no deps)
```

All artifacts are independent leaves — no cycles possible.

---

## Architecture

```
┌─────────────────────────────────┐
│  MCP Tool Handlers (src/tools/) │  Zod schema → validated args → delegate
├─────────────────────────────────┤
│  Registry (src/registry/)       │  Load → Compose → Render instruction files
├─────────────────────────────────┤
│  Analyzers (src/analyzers/)     │  Tag detection, completeness, language
├─────────────────────────────────┤
│  Core / Artifacts / Validators  │  Generative Specification implementation
│  (src/core/, src/artifacts/,    │  (the six properties as interfaces + impls)
│   src/validators/)              │
├─────────────────────────────────┤
│  Templates (templates/**/)      │  YAML data files. No code. Tag-indexed.
├─────────────────────────────────┤
│  Shared (src/shared/)           │  Config, errors, logger, filesystem utils
└─────────────────────────────────┘
```

Layer rules:
- Tool handlers → Registry only (never directly to templates or analyzers)
- Registry → Analyzers, Templates (never to tools)
- Templates are data — imported as YAML, never as code
- Shared has zero imports from any other layer

---

## Commit Protocol

Format: `feat|fix|refactor|docs|test|chore(scope): description`

Scope vocabulary: `tools`, `registry`, `analyzers`, `templates`, `hooks`, `core`, `artifacts`, `validators`, `cli`, `shared`

Rules:
- One feature = one commit. Commit when tests pass.
- `feat` = new tool, tag, or hook; `MINOR` semver bump
- `fix` = bug fix; `PATCH` bump
- `feat!` or `BREAKING CHANGE:` footer = breaking API; `MAJOR` bump
- Template content changes = `chore(templates): ...` unless they change the YAML format (then `feat!`)

---

*This spec was generated by running `setup_project` + `scaffold_project` on 2026-03-07.*
*It is itself a Generative Specification and satisfies all six properties of ADR-0001.*
