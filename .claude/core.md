# ForgeCraft — Core Invariants
_Always loaded. Every session, every task, no exceptions._

## Architecture Invariants
- **Hexagonal (Ports & Adapters)**: API/CLI → Services → Domain ← Port Interfaces ← Adapters. Never skip layers.
- **No monolith**: Split files when you'd describe them with "and". One reason to change per module.
- **Dependencies point inward only**: Domain has zero external imports. Adapters implement ports, never the reverse.
- **No circular imports**: Module dependency graph must be acyclic (hook-enforced).
- **TypeScript strict**: `"strict": true` AND `"noUncheckedIndexedAccess": true` in tsconfig.json.
- **ESM imports**: All local imports use `.js` extensions (TypeScript ESM project).
- **Max function length**: 50 lines. Max parameters: 5 (use parameter object beyond that).

## Commit Protocol
1. Write failing test first (RED) — run it, show output.
2. Write minimum implementation (GREEN) — run suite, show output.
3. Refactor under green — no new behavior.
4. Commit sequence: `test(scope): [RED] ...` → `feat(scope): ...` → `refactor(scope): ...`
5. One logical change per commit. Never `feat:` without a preceding `test:` in the branch.

## GS Property Checklist (inspect before closing any session)
- **Self-describing**: System explains itself from its own artifacts alone?
- **Bounded**: Every unit has explicit scope? Context window to modify any unit is predictably bounded?
- **Verifiable**: Correctness checkable without human judgment? Verification automatic, fast, blocking?
- **Defended**: Destructive operations structurally prevented (hooks, gates) — not just discouraged?
- **Auditable**: Current state and full history recoverable from artifacts alone?
- **Composable**: Units combinable without unexpected coupling? AI can work on any unit in isolation?

## Session Gate
The cascade must pass before `generate_session_prompt` produces a prompt.
Run `check_cascade` to verify. If it fails, fix the blocking step before generating.
Layer order: L1 Blueprint → L2 Harness → L3 Environment → L4 Monitoring.
A gap at any layer blocks advancement to the next.

## Layer Navigation (L1→L4)
| Layer | What it means | Primary artifact |
|---|---|---|
| **L1 Blueprint** | Use cases documented, cascade complete, no gate violations | `docs/use-cases.md`, cascade steps |
| **L2 Harness** | Behavioral contracts verified by executable probes | `tests/harness/`, `harness-run.json` |
| **L3 Environment** | Infrastructure and environment contracts verified | `env-probe-run.json` |
| **L4 Monitoring** | SLO and monitoring contracts verified | `slo-probe-run.json` |

Read `.claude/state.md` for current layer completion status before any implementation session.
