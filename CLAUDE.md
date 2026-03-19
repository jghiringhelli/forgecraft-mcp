# CLAUDE.md — Generative Specification Framework

<!-- ForgeCraft sentinel | 2026-03-18 | tags: UNIVERSAL, LIBRARY, CLI, API | npx forgecraft-mcp refresh . --apply to update -->
<!-- Load standards files only when the current task requires them. -->

## Project Identity
- **Project**: Generative Specification Framework
- **Language**: typescript
- **Release Phase**: production
- **Tags**: [UNIVERSAL] [LIBRARY] [CLI] [API]

**Current work → read `Status.md` first.**

---

## Critical Rules — Always Active
_These apply regardless of task. Never defer them._

**Hygiene (disk safety)**
- Check before installing: `code --list-extensions | grep -i <name>` · `docker ps -a --filter name=<svc>` · `.venv` reuse if major.minor matches.
- Never `docker run` without checking for an existing container. Prefer `docker compose up`.
- Workspace >2 GB outside `node_modules/`/`.next/`/`dist/` → warn before continuing.
- Synthetic data >100 MB or >7 days old without reference → ask before retaining.

**Code integrity**
- No hardcoded config. No mocks in production code. Never skip layers: API → services → repositories.
- Every public function has a JSDoc comment with typed params and returns.
- Split a file when you use "and" to describe what it does.

**Commits**
- Conventional commits: `feat|fix|refactor|docs|test|chore(scope): description`
- One logical change per commit. Update `Status.md` at end of every session.
- Commit BEFORE any risky refactor.

**Data**
- NEVER sample, truncate, or subset data unless explicitly instructed.
- State exact row counts, column sets, and filters for every data operation.

**TDD**
- Write a failing test (`test: [RED]` commit) BEFORE the implementation commit.
- Tests are specifications — name them as behaviors, not as code paths.

---

## Wayfinding — Load Standards on Demand
| When working on… | Read |
|---|---|
| Architecture, SOLID, hexagonal layers, DTOs, ports/adapters, production standards | `.claude/standards/architecture.md` |
| Tests, TDD, coverage, test doubles, property-based, mutation testing | `.claude/standards/testing.md` |
| CI/CD, environments, deployment strategy, graceful shutdown, infra-as-code | `.claude/standards/cicd.md` |
| REST/GraphQL endpoints, auth, rate limiting, versioning, contracts | `.claude/standards/api.md` |
| ADRs, artifact grammar, use cases, GS self-refinement, naming conventions | `.claude/standards/spec.md` |
| Clarification protocol, feature completion, code generation, known pitfalls | `.claude/standards/protocols.md` |
| Ecosystem repos, live URLs, gate registry, contribution flow, forgecraft-server | `.claude/standards/ecosystem.md` |
| Quality gate lifecycle, gate schema, contribution flow, close_cycle, flywheel design | `.claude/standards/quality-gates.md` |
| Project-specific rules, framework choices, corrections log | `.claude/standards/project-specific.md` |
| Ambiguity pattern, when/how to ask for clarification, ⚡ Ambiguity format | `.claude/standards/communication-protocol.md` |

---

## Session Protocol
1. Read `Status.md` — know what's in progress before writing a line.
2. Load the relevant standards file(s) from the wayfinding table above.
3. Update `Status.md` before ending the session.
