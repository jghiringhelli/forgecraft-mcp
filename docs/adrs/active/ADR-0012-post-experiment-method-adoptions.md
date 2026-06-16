# ADR-0012: Post-Experiment Method Adoptions — Model Tiering, YAML Frontmatter, Normative Keywords, the Rubric Guide

**Status**: Accepted
**Date**: 2026-06-16
**Author**: Juan Carlos Ghiringhelli
**Builds on**: ADR-0011 (generative-execution gate + sentinel/EG vocabulary)

---

## Context

Since ADR-0011, two pilot experiments (**MX**, model cost & tiering; **RND-1**, specification / verification / bounded-context under pressure) and the associated method work produced concrete, *measured* guidance that ForgeCraft — the executor arm of GS — should adopt. The canonical sources are public in the GS research repo (`github.com/jghiringhelli/generative-specification`): the Compendium (§7.8.H–I, §4.1.a, §4.4), the **Rubric Scoring Guide** (`docs/white-paper/GS_Rubric_ScoringGuide.md`), and the reproducible experiments (`experiments/mx/`, `experiments/rnd-1/`). This ADR records what ForgeCraft adopts and the concrete implementation each adoption implies. It does not revise ADR-0011; it extends it.

## Decision

### 1. Model tiering — different models for different tasks (measured: MX)
**Default code generation to the mid-tier model (Sonnet-class); reserve the strong model (Opus-class) for planning and for escalating tasks the mid model fails.** MX measured both at 149/149 on the full RealWorld/Conduit backend with the mid model at **≈6× lower cost**, and found multi-model *tiering* unjustified when the mid model one-shots the task (the strong-model planner alone cost more than the mid model's entire build). **ForgeCraft action:** any orchestration/subagent path selects the mid tier for generation by default; the strong tier is reserved for planning and hard escalation; tiering machinery is engaged only for tasks beyond the mid model's one-shot capacity (large/complex specs). Source: Compendium §7.8.H, `experiments/mx/`.

### 2. YAML frontmatter on generated harness documents and sentinel nodes
Adopt the **closed-key** YAML frontmatter schema (Self-describing made machine-readable): `id / type / status / tier / properties / obligations / generative_execution / depends_on`, with a `sentinel-node` specialization carrying `node / scope / load / categories / routes_to`. **ForgeCraft action — this is the consumer that makes the schema live:** (a) the **sentinel renderer emits** the frontmatter on the docs and sentinel nodes it generates; (b) a **well-formedness gate validates** the sentinel tree — root within the bounded line budget and the only `load: always` node, the five required categories collectively present (fail a tree with no `tool-sequencing` node), every `routes_to` resolves; (c) the **drift check** (PT-2) and the router/gates **consume** the keys instead of parsing prose. Minimal-sufficient: emit frontmatter only where a consumer reads it. Source: Rubric Scoring Guide (frontmatter schema), Compendium §4.4.

### 3. RFC 2119 / 8174 normative keywords in specs
Spec obligations are phrased with **MUST / MUST NOT / SHOULD / SHOULD NOT / MAY** (normative only when capitalized, per RFC 8174). **ForgeCraft action:** spec/use-case templates use them; the keyword **sets gate severity** — `MUST → blocking gate, SHOULD → warning, MAY → ungated` — and each `MUST` becomes an acceptance criterion and therefore a probe (the `obligations` frontmatter key counts them). This reuses the existing gate-severity machinery (FC-2). Source: Compendium §4.1.a.

### 4. Prescriptive over descriptive specs (measured: RND-1)
RND-1 showed a *descriptive/ambiguous* spec makes the model floor to the literal minimum (0/3 against the held-out intent) at equal token cost, while a *prescriptive* spec recovers full intent (3/3) — the **prescriptive-specification arm is the demonstrably load-bearing one** at current model capability. **ForgeCraft action:** the spec discipline and its gates favor prescriptive form — use cases with explicit postconditions and acceptance criteria, obligations phrased with §3's keywords. (Verification and bounded-context remain insurance whose value shows against weaker/adversarial agents and at large scale — RND-1 returned honest bounding nulls there.) Source: Compendium §7.8.I, `experiments/rnd-1/`.

### 5. The Rubric Scoring Guide as the scoring contract
**ForgeCraft action:** the `verify`/score path consumes the per-property **0/1/2 calibration anchors** from `GS_Rubric_ScoringGuide.md` (not ad-hoc heuristics); the `properties` frontmatter key attributes each artifact's contribution to `gs_score`; Defended scores derived without human review are flagged provisional. Source: Rubric Scoring Guide.

## What is LIVE vs PLANNED
- **Live (ADR-0011 + this session):** generative-execution gate + per-UC green/red flag (FC-1); static-analyzer gate (FC-2); multi-agent sentinel source-of-truth + drift check (PT-2); debt-marker harvest (PT-4).
- **Planned (this ADR's implementation backlog):** sentinel-renderer frontmatter emission + the tree well-formedness gate (§2); keyword→gate-severity wiring (§3); `verify` consuming the rubric anchors (§5). Model-tiering (§1) and prescriptive-spec discipline (§4) are operating guidance now; their enforcement (a tiering orchestrator; a descriptive-spec linter) is optional future work.

## References
- ADR-0011 (this repo). Canonical method: `generative-specification` Compendium §7.8.H–I, §4.1.a, §4.4; `GS_Rubric_ScoringGuide.md`. Experiments: `experiments/mx/`, `experiments/rnd-1/`.
