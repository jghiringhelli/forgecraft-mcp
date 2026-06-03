# PRD: ForgeCraft MCP — Generative Specification Framework

## Background & Context

AI coding assistants are productive out of the box but drift without structure. They have no persistent memory of prior sessions, no architectural discipline unless one is encoded in every session's context, and no mechanism to prevent the gradual erosion of code quality that accumulates across many incremental sessions.

The specific failure mode: a project starts clean, the AI assistant does good work in session 1, but by session 12 it has forgotten the layer boundaries, is hardcoding things that belong in config, and its commits are undescribed. The developer fixed these things in session 3, but that correction didn't survive. There is no institutional memory.

ForgeCraft addresses this by implementing the Generative Specification (GS) model as a toolchain. GS formalizes the insight that **specification is the scarce resource when code generation is near-free**. ForgeCraft scaffolds the spec artifacts (CLAUDE.md, ADRs, use cases, status.md) and the enforcement layer (pre-commit hooks, quality gates) that make architectural discipline persistent across sessions and across AI assistants.

The secondary problem: every AI assistant has its own instruction file format. A team using Claude Code, Cursor, and Copilot needs three different instruction files with the same content. ForgeCraft generates all of them from one source of truth.

## Stakeholders

| Role | Who | Interest |
|---|---|---|
| **Primary user** | Solo developer or small team using AI coding assistants | Wants consistent quality without manual overhead |
| **Secondary user** | Engineering lead at a team migrating to AI-assisted development | Wants standardized practices across the team |
| **Maintainer** | JC (sole maintainer, v1.x) | Sustainable development with automation-supported quality gates |
| **Community** | Contributors proposing quality gates | Gate library grows through generalized patterns from real projects |
| **AI assistant** | Claude, Cursor, Copilot, Windsurf, Cline, Aider | Reads the generated instruction files every session |

## User Stories

### Setup & Onboarding
- **US-001**: As a developer starting a new project, I want ForgeCraft to analyze my spec and scaffold the instruction files, hooks, and doc stubs so that I don't need to set up the AI harness manually.
- **US-002**: As a developer with an existing project, I want ForgeCraft to detect what I already have and add only what's missing so that it doesn't overwrite my existing setup.
- **US-003**: As a developer, I want to run one command and get a fully configured project so that the time to productive AI-assisted development is minutes, not days.

### Quality & Compliance
- **US-004**: As a developer, I want pre-commit hooks that block bad commits before they land so that code quality is enforced structurally, not by convention.
- **US-005**: As a developer, I want an audit score (0–100) that tells me exactly where the gaps are so that I know what to fix next.
- **US-006**: As a CI pipeline, I want to run `audit` and fail the build when the score drops below threshold so that quality regressions are caught automatically.

### Session Continuity
- **US-007**: As a developer starting a session, I want ForgeCraft to generate a bound prompt referencing the spec and current roadmap item so that the AI assistant starts with complete context and doesn't drift out of scope.
- **US-008**: As a developer, I want `status.md` to track what's in progress and what decisions were made so that each session can continue from where the last left off.

### Architecture & Documentation
- **US-009**: As a developer making an architectural decision, I want to generate a MADR-format ADR in one command so that decisions are recorded while the reasoning is fresh.
- **US-010**: As a developer, I want the GS cascade check to tell me which of the 5 spec artifacts are complete and which need work so that I know the project is ready to build from.

### Multi-Assistant
- **US-011**: As a developer using multiple AI assistants, I want ForgeCraft to generate all instruction files from one run so that every assistant sees the same standards.

### Community
- **US-012**: As a developer with a reusable quality gate, I want to contribute it to the registry so that other projects benefit from patterns discovered in my project.

## Requirements

### Functional Requirements

**Setup**
- FR-001: `setup_project` shall analyze the project directory and infer stack, language, and framework tags from file signatures.
- FR-002: `setup_project` shall generate all instruction files for the specified output targets (claude, cursor, copilot, windsurf, cline, aider) from a single invocation.
- FR-003: `setup_project` shall write `forgecraft.yaml` as the persistent project config after phase 2.
- FR-004: `setup_project` shall write `docs/PRD.md`, `docs/TechSpec.md`, `docs/status.md`, `docs/manifest.yaml` stubs if they do not exist (idempotent — never overwrites existing content).
- FR-005: `setup_project` shall install pre-commit hooks unless hooks already exist.
- FR-006: `refresh` shall detect tag changes and show a before/after diff without applying (preview mode default); `--apply` applies.

**Quality**
- FR-007: `audit` shall score a project 0–100 across completeness, structural, and behavioral dimensions.
- FR-008: `audit` shall surface per-violation details (file, line, pattern name) for anti-pattern findings.
- FR-009: `verify` shall run the project's test suite and score the 7 GS properties based on results and project structure.
- FR-010: Pre-commit hooks shall check: no temp files, no secrets, code quality, TypeScript compilation, import cycles, test coverage, dependency audit.

**Cascade & Session**
- FR-011: `check_cascade` shall evaluate all 5 GS initialization steps and return per-step PASS/FAIL/STUB/WARN/SKIP.
- FR-012: `generate_session_prompt` shall produce a bound prompt that references the spec section, acceptance criteria, and ADR context for one roadmap item.
- FR-013: `propose_session` shall analyze the requested change, read through the relevant spec/use-case, and produce a task breakdown with scope estimate before the implementation begins.

**Architecture Records**
- FR-014: `generate_adr` shall write a MADR-format ADR with auto-incremented sequence number to `docs/adrs/`.
- FR-015: ADR files shall link to the implementation artifacts they govern via `@gs-links` frontmatter when applicable.

**Layer Tracking**
- FR-016: `layer_status` shall report L1–L4 completion per use case in `docs/use-cases.md`.
- FR-017: `generate_harness` shall scaffold L2 probe files at `.forgecraft/harness/uc-NNN.yaml`.

**MCP Sentinel**
- FR-018: The `forgecraft` sentinel tool shall read only `forgecraft.yaml`, `CLAUDE.md`, and `.claude/hooks/` to derive its recommendation — no other files.
- FR-019: The `forgecraft` sentinel tool shall cost ≤200 tokens per invocation.

**Doc-Code Integrity**
- FR-020: The pre-push hook shall block pushes where public surface files changed without corresponding spec or ADR updates, unless a `docs/change-manifest.md` is staged explaining the code-only change.
- FR-021: Source files that implement a spec or ADR decision shall carry `@gs-links` frontmatter comments referencing the linked documents.
- FR-022: The doc-cascade hook shall verify that `@gs-links` references in changed source files were also touched in the same commit.

### Non-Functional Requirements

- **NFR-001 (Token footprint)**: The MCP sentinel tool shall cost ≤200 tokens. The full action router shall cost ≤1,500 tokens.
- **NFR-002 (No runtime footprint)**: ForgeCraft is a setup-time tool. It writes files and exits. It has no persistent process, no database, no network dependency at runtime.
- **NFR-003 (Idempotency)**: All write operations check for existing content before writing. Running `setup_project` twice on the same project shall not overwrite user-modified files.
- **NFR-004 (CLI parity)**: Every MCP action shall also be available as a CLI command. The MCP server is not the exclusive interface.
- **NFR-005 (Node ≥18)**: ForgeCraft requires Node.js 18+. No polyfills for older runtimes.
- **NFR-006 (Test coverage)**: Line coverage ≥79%, branch coverage ≥70%, function coverage ≥80%.
- **NFR-007 (Mutation score)**: Sentinel renderer MSI ≥75%. Core tool MSI ≥65%.

## Out of Scope

- **Runtime enforcement**: ForgeCraft does not run as a daemon or proxy. It writes files and exits.
- **AI execution**: ForgeCraft does not execute AI agents or call LLMs. It generates the instructions that AI agents read.
- **Hosting / cloud**: No ForgeCraft cloud service. The tool runs locally; quality gates are local or CI.
- **IDE plugins**: No VS Code extension, no JetBrains plugin. The MCP server is the IDE integration surface.
- **Automated spec writing**: ForgeCraft generates spec stubs; filling them with content is the developer's responsibility.
- **Versioned instruction files**: ForgeCraft does not version-control CLAUDE.md changes. Git does that.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Time to first productive AI session | < 10 minutes from `setup_project` | Manual test on fresh projects |
| Audit score on a fresh scaffold | ≥ 70/100 | `audit` after `setup_project` on a clean dir |
| Test coverage | ≥ 79% lines | `vitest run --coverage` |
| MCP token footprint | ≤ 200 (sentinel), ≤ 1,500 (full) | Measured at MCP registration |
| npm downloads | Growing MoM | npm stats |

## Open Questions

- **OQ-001**: Should `@gs-links` be a comment convention or a separate sidecar file (`.gs-links.json`)? Comment is zero-infrastructure; sidecar is machine-parseable without regex. → See ADR-0011 (pending).
- **OQ-002**: Should architecture CNT splitting be automatic (triggered by file size) or always-on for projects above a certain complexity tier? → Needs experiment; default to always-on for `recommended` tier.
- **OQ-003**: How should the self-check comparison handle templates that ForgeCraft intentionally generates as stubs (PRD.md, TechSpec.md)? → Stubs should count as "present" for cascade purposes but flag as "unfilled" in the self-check report.
