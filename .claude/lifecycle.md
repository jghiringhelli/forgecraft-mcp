<!-- CNT branch: lifecycle | load when starting a session or implementing a change -->

## Memory Map — What to Load and When

| Memory type | Artifact | Load when |
| --- | --- | --- |
| **Semantic** — architectural rules | `CLAUDE.md` (`.claude/index.md`) + `.claude/core.md` | Every session (always load) |
| **Procedural** — how to work | `.claude/lifecycle.md` + `.claude/standards/` | Implementing or starting a feature |
| **Episodic** — decisions and state | `docs/adrs/active/` + `docs/status.md` | Starting a session, structural changes |
| **Relationship** — behavioral contracts | `docs/use-cases.md` | Before implementing any behavior |
| **Working** — current task | Sub-tasks from Feature Estimation | During implementation (keep minimal) |

Read in this order at session start: `docs/status.md` → relevant use case → relevant ADR → `.claude/core.md`

## GS Initialization Cascade

Run `check_cascade` before implementing anything:

1. **Functional spec** — `docs/PRD.md` exists with real content
2. **Architecture** — `docs/TechSpec.md` + `docs/architecture/` present
3. **Constitution** — `CLAUDE.md` (`.claude/index.md`) + `.claude/core.md` loaded
4. **Decision records** — at least one ADR in `docs/adrs/active/`
5. **Behavioral contracts** — use cases in `docs/use-cases.md` with acceptance criteria

If any step fails: fix it before generating code.

## Feature Estimation (required before any requested change)

Before writing any code:
1. **Read** the relevant use case in `docs/use-cases.md` or spec in `docs/specs/`
2. **Identify** all files that will be touched (source, tests, docs)
3. **Break into sub-tasks** — each sub-task: ≤3 files, one clear acceptance criterion
4. **State the scope boundary** — what this change does NOT touch
5. **Confirm** the breakdown with the user before writing any code

Each sub-task must be completable without reloading the full spec.

## Tool Sequencing

| Task type | Recommended sequence |
| --- | --- |
| New MCP action | Read use case → Write test ([RED]) → Add to dispatch → Implement ([GREEN]) → Commit |
| New template block | Read PRD section → Write template YAML → Write test → Commit |
| Bug fix | Grep error → Read failing test → Fix → Add regression test → Commit |
| Refactor | Read architecture → Check layers → Change → Run tests → Commit |
| Schema change | Read data-model → Update schema types → Regen → Update UC → Commit |

## Session Loop Invariant (close-of-session gate)

Before closing any session:

1. ✅ Typecheck passes — no type errors
2. ✅ Lint passes — no promoted warnings
3. ✅ Affected tests pass
4. ✅ If structural decision: ADR written in `docs/adrs/active/`
5. ✅ Commits are atomic Conventional Commits
6. ✅ `docs/status.md` updated — current state, open items, recent decisions
7. ✅ If UC acceptance criteria changed: `docs/use-cases.md` updated

If incomplete: document in `docs/status.md` before stopping.
