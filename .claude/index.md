# ForgeCraft — Architecture Sentinel
<!-- CNT root | always loaded, routing only (≤80 lines) -->

> **CNT root** — load always-load files, then navigate to the relevant branch.
> If anything contradicts `docs/PRD.md`, PRD wins. Raise an ADR to change course.

## Always Load

- `.claude/core.md` — non-negotiables: SOLID, arch invariants, commit protocol, prohibited ops
- `docs/status.md` — current project state and open items
- `.claude/corrections.md` — past AI mistakes on this project (read before acting)

## Navigate by Task

| You're about to... | Load these branches |
| --- | --- |
| Implement a feature | `.claude/lifecycle.md` → `docs/use-cases.md` → `.claude/routes/docs.md` |
| Fix a bug | `.claude/lifecycle.md` → linked test → `.claude/routes/code.md` |
| Change architecture / layers | `.claude/core.md` → `docs/architecture/layers.md` → `docs/adrs/` |
| Change a module boundary | `.claude/core.md` → `docs/architecture/modules.md` |
| Change data model / schema | `docs/architecture/data-model.md` → `.claude/routes/docs.md` |
| Add / change MCP tool or action | `.claude/standards/api.md` → `docs/use-cases.md` |
| Add / change sentinel template | `.claude/standards/architecture.md` → `docs/architecture/modules.md` |
| Write / fix tests | `.claude/standards/testing.md` → `.claude/routes/code.md` |
| Review CI / hooks / deployment | `.claude/standards/cicd.md` |
| Start a new session | `.claude/lifecycle.md` → `docs/status.md` → relevant use case |

## Project Identity

- **Name**: forgecraft-mcp
- **Tags**: UNIVERSAL, CLI, LIBRARY, API
- **Stack**: TypeScript/Node.js CLI + MCP server

## Doc Obligation Table

| Change type | Read first | Produce after |
| --- | --- | --- |
| New feature | `docs/PRD.md` + relevant use case | Spec decision record in `docs/specs/` |
| Architecture change | `docs/architecture/layers.md` + ADR index | ADR in `docs/adrs/active/` |
| Schema change | `docs/architecture/data-model.md` | Update schema + ERD |
| Module boundary | `docs/architecture/modules.md` | Update modules.md + ADR if non-obvious |
| Bug fix | Linked use case + failing test | Regression note in use case |

## @gs-links Convention

`// @gs-links: docs/use-cases.md#UC-NNN, docs/adrs/active/NNNN-slug.md`
Source files that implement a decision carry this. Linked docs must be staged with code.
The `pre-commit-gs-links.sh` hook enforces this; escape with `docs/change-manifest.md`.
