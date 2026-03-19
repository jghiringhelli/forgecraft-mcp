# GS Controlled Experiment — RealWorld Benchmark

This experiment compares two conditions for implementing the same backend API:

- **Control** (`control/`) — raw prompts, no GS artifacts
- **Treatment** (`treatment/`) — full ForgeCraft GS artifact cascade, then same prompts

See [experiment design doc](../docs/experiment-design.md) for full protocol, evaluation rubric, pre-registered predictions, and fairness constraints.

**Benchmark:** RealWorld (Conduit) — https://github.com/realworld-apps/realworld  
**Pre-registered:** March 11, 2026 (this commit precedes all implementations)

## Prompt Symmetry

The implementation tasks in `control/prompts/` and `treatment/prompts/` describe **identical endpoints and requirements**. The conditions differ in:

| Aspect | Control | Treatment |
|---|---|---|
| Context artifacts | API spec + README only | Full GS cascade (CLAUDE.md, ADRs, diagrams, schema, Status.md) |
| Per-prompt quality gates | Inline guidance (tech stack, layer rules, error format) | "Before committing: run Verification Protocol" |
| Test cadence | Tests requested per feature; prompt 07 is final completion pass | Tests requested per feature; prompt 06 is final consolidation |
| Prompt count | 7 | 6 |
| Pre-commit hooks | None | `.claude/hooks/` from ForgeCraft `add_hook` |

This is a deliberate asymmetry: the **control** shows the best achievable outcome via expert prompting alone; the **treatment** shows the outcome when the same prompts operate against a pre-built GS artifact cascade. The experiment isolates the effect of the artifact layer — not the effect of prompting skill.

## Status

| Condition | Artifacts | Implementation | Evaluation |
|---|---|---|---|
| Control | ✅ | ⬜ | ⬜ |
| Treatment | ✅ | ⬜ | ⬜ |
