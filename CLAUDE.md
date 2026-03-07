# CLAUDE.md — ForgeCraft MCP

> Full spec: `docs/spec.md` · ADRs: `docs/adrs/` · Hooks: `.claude/hooks/` · Git hooks: `scripts/setup-hooks.sh`
> Releases: `../PUBLISHING-PLAYBOOK.md`

## Identity
| | |
|---|---|
| Repo | github.com/jghiringhelli/forgecraft-mcp |
| Stack | TypeScript 5 · Node 18+ · @modelcontextprotocol/sdk |
| Tags | `[UNIVERSAL]` `[API]` `[CLI]` `[LIBRARY]` |
| Package | forgecraft-mcp (npm) |

## Generative Specification
This project implements and follows the Generative Specification methodology (ADR-0001).
A spec is well-formed when it satisfies six properties: **Self-describing · Bounded · Verifiable · Defended · Auditable · Composable**.

Artifacts in `src/core/` (interfaces), `src/artifacts/` (grammar), `src/validators/` (enforcement).
Before any structural change: check `docs/adrs/` for an existing decision. If none exists, write one first.

## Code Standards
- fn ≤50 lines · file ≤300 lines · params ≤5 (use objects beyond that)
- JSDoc on every public symbol · no abbreviations except: id, url, http, db, api
- Delete orphaned code — git has history · search `shared/` before writing new utilities
- Every new MCP tool handler: define Zod schema first, then handler, then tests

## SOLID (non-negotiable)
- **SRP**: one reason to change. "and" in description → split.
- **OCP**: extend via interfaces. Never modify working code for new behavior.
- **LSP**: any interface impl must be fully swappable.
- **ISP**: small, focused interfaces only.
- **DIP**: depend on abstractions. Constructor injection always. Composition root: `src/index.ts`.

## Zero: Hardcoded Values · Mocks in App Code · Bare Errors
- Config through env vars. Named constants for magic numbers. Validated at startup.
- Mocks in test files only. No TODO stubs — use `NotImplementedError`.
- Custom error hierarchy per module. Errors carry context (id, timestamp, op name).

## Interfaces First
interface → DTOs → consuming code → tests → concrete class. Always in that order.

## Architecture
``````
MCP Tool Handlers (src/tools/)     ← Zod schema + delegation only
Registry / Analyzers               ← Template composition, project analysis
Core / Artifacts / Validators      ← GenerativeSpec interfaces + implementations
Templates (templates/**/)          ← YAML data files. No code.
Shared (src/shared/)               ← Config, errors, logger, filesystem utils
``````
- Tool handlers → registry only (never directly to templates)
- Registry never imports from tools
- Templates are data — YAML only, never imported as code
- `shared/` has zero imports from any feature layer

## MCP Tool Contract
- Define Zod schema before handler. Schema is source of truth.
- Every tool returns structured JSON with actionable next steps.
- Tools that write files: list all created/modified paths in output.
- `setup_project` + `generate_instructions` both use `writeInstructionFileWithMerge` — preserve custom sections.

## Testing
- 80% line coverage (gate) · 90% new/changed · 95% critical paths (template composition, file generation)
- Names are specs: `rejects_unknown_tag` not `validation_test`
- Colocation: `tests/tools/classify.test.ts` mirrors `src/tools/classify.ts`
- Flaky = bug. Fix or quarantine.

## Library / CLI Standards
- `bin` + `files` in package.json scoped to `dist/` + `templates/` only
- SemVer: template YAML format change = MAJOR · new tag/hook = MINOR · fix = PATCH
- Test against public API, not internals · `tests/integration/` simulates real consumer usage

## Data Guardrails
- NEVER truncate or subset template content unless explicitly instructed.
- When composing multiple tags, include ALL content for ALL active tags.

## Commit Protocol
- Format: `feat|fix|refactor|docs|test|chore(scope): description`
- Scopes: `tools` `registry` `analyzers` `templates` `hooks` `core` `artifacts` `validators` `cli` `shared`
- One feature = one commit. Commit immediately when tests pass — never bundle.
- Update `Status.md` at end of every session.

## Corrections Log
### Learned Corrections
- [2026-02-23] Commit after each feature completes — never bundle. The post-edit-commit-reminder hook warns at 15+ uncommitted files.
- [2026-03-07] `generate_instructions` must not overwrite custom CLAUDE.md with generic template prose. The merge behavior should preserve project-specific sections over template defaults, not replace them.
