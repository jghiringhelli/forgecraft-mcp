# GS Controlled Experiment — RealWorld Benchmark

This experiment compares two conditions for implementing the same backend API:

- **Control** (`control/`) — raw prompts, no GS artifacts
- **Treatment** (`treatment/`) — full ForgeCraft GS artifact cascade, then same prompts

See [experiment design doc](../docs/experiment-design.md) for full protocol, evaluation rubric, pre-registered predictions, and fairness constraints.

**Benchmark:** RealWorld (Conduit) — https://github.com/realworld-apps/realworld  
**Pre-registered:** March 11, 2026 (this commit precedes all implementations)

## Key Principle

The implementation prompts in `control/prompts/` and `treatment/prompts/` are **word-for-word identical**. The only difference between conditions is whether the GS artifact cascade exists when the prompts are executed.

## Status

| Condition | Artifacts | Implementation | Evaluation |
|---|---|---|---|
| Control | ✅ | ⬜ | ⬜ |
| Treatment | ✅ | ⬜ | ⬜ |
