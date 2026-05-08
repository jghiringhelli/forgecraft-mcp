# Design Philosophy — Why Forgecraft Enforces What Others Leave to Discipline

## The Shared Premise

In early 2025, three tools independently converged on the same foundational idea: **the specification should be the AI's persistent context, not an afterthought written after the code**.

- **GitHub Spec Kit** — Constitution → Spec → Plan → Tasks. Keep the AI anchored.
- **OpenSpec (Fission AI)** — Propose → Apply → Archive. Delta specs for evolving codebases.
- **Forgecraft** — L1 Blueprint → L2 Behavioral Harness → L3 Environment → L4 Monitoring.

All three start from Spec-Driven Development. All three agree that a spec is the source of truth and that the AI should read it before acting. The paths diverged because of a single question: **who enforces it?**

---

## The Divergence: Discipline vs. Structure

Spec Kit and OpenSpec answer: the human enforces it, aided by good tooling and clear protocols. This is a reasonable answer for a broad audience — most developers won't adopt a tool that requires running a daemon, wiring hooks, or instrumenting their CI pipeline before they can write a line of code.

Forgecraft answers differently: **the structure enforces it**, because a stateless AI without structural enforcement will eventually violate the spec. Not maliciously — it simply cannot remember the constraint across sessions without a machine-readable signal that blocks progress when the constraint is violated.

This is not a criticism of the lighter tools. It is a different threat model.

If the cost of a spec violation is a code review comment, discipline-based enforcement is sufficient. If the cost is a production incident, structural enforcement is necessary. Forgecraft is built for the second case.

---

## The Four-Layer Ratchet

Where Spec Kit has four artifacts (constitution, spec, plan, tasks), forgecraft has four *layers* — each with a different verification mechanism and a different regeneration target when it fails.

| Layer | Spec artifact | Verification | Failure → regenerate |
|---|---|---|---|
| L1 Blueprint | Use cases, ADRs, gates | Gate evaluation at close_cycle | The missing spec artifact |
| L2 Behavioral Harness | UC postconditions + probe specs | Probe execution (run_harness) | The implementation |
| L3 Environment | Env contracts + IaC | Env probe execution (run_env_probe) | The infrastructure config |
| L4 Monitoring | NFR contracts + SLO specs | SLO probe execution (run_slo_probe) | The alert/dashboard config |

This is TDD applied at every layer. The probe is the test. The spec is the oracle. A failing probe is not a test failure — it is a specification violation, and the AI's instruction is unambiguous: go back to the spec and regenerate, do not patch the symptom.

---

## The Bounded Context Problem

All three tools grapple with the same constraint: an LLM has a finite context window, and loading the full specification into every session is wasteful, slow, and degrades accuracy as the spec grows.

Spec Kit solves this with modular artifacts — load the relevant document for the current task. OpenSpec solves it with delta overlays — load only what changed.

Forgecraft solves it with a **sentinel tree**: a navigable `.claude/` directory where CLAUDE.md is the entry point, `.claude/index.md` is the router, `.claude/core.md` is always loaded, and task-specific branches are loaded only when relevant. The AI reads the index, determines which branch covers the current task, and loads exactly that — no more.

The critical addition: `.claude/state.md` is a live leaf in the tree, overwritten by `close_cycle` after every run. It contains the current layer completion, active gate violations, and the single most important next action. Every session begins with current state, not stale documentation.

---

## What Was Adopted from Prior Art

After discovering Spec Kit and OpenSpec in April 2026, two ideas were integrated into forgecraft:

**`[NEEDS CLARIFICATION]` markers**: Borrowed from Spec Kit's template constraint model. When forgecraft generates spec artifacts — use cases, session prompts, ADRs — ambiguous sections are explicitly marked. The AI cannot act on ambiguity it cannot see. A `[NEEDS CLARIFICATION]` marker forces the human to resolve it before the session can proceed.

**Proposal phase before session generation**: Borrowed from OpenSpec's Propose phase. The `propose_session` tool produces a pre-implementation impact assessment: which specs are affected, which layers are impacted, which gates must pass. This runs before `generate_session_prompt`. The session prompt is a commitment to implement; the proposal is the reasoning that justifies the commitment.

---

## On Being Late to a Correct Idea

Spec-driven development is not new. Executable specifications, living documentation, and behavior-driven development (BDD) have existed since Cucumber (2008), FitNesse (2001), and Ward Cunningham's FIT framework (2002). The LLM-native framing is new — using the spec as the AI's persistent context rather than as a test framework — but the underlying discipline is decades old.

Forgecraft, Spec Kit, and OpenSpec all arrived at this independently because the LLM inflection point made it newly economical. When the executor is stateless and cheap, the specification becomes the bottleneck. All three tools recognized this simultaneously.

The ideas are not competing. They are complementary implementations of the same insight at different points on the enforcement spectrum. Use the lightest tool that matches your threat model.
