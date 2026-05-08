# ADR-0010: SDD Prior Art — Spec Kit, OpenSpec, and Parallel Convergence

**Status**: Accepted  
**Date**: 2026-04-17  
**Author**: Juan Carlos Ghiringhelli

---

## Context

During a Spec-Driven Development (SDD) conference session in April 2026, two tools were identified that share forgecraft's foundational premise: GitHub's **Spec Kit** and Fission AI's **OpenSpec**. Forgecraft and Codeseeker both have first commits from mid-2025, placing them contemporaneously with or prior to those tools. Establishing chronological precedence is neither possible nor important — what matters is that all three converged independently on the same idea.

The true common ancestor is not any single tool. It is **Spec-Driven Development** as a discipline — executable specifications, living documentation, and behavior-driven development — which predates all of them by decades (Cucumber 2008, FitNesse 2001, Ward Cunningham's FIT framework 2002). The LLM-native framing is what is new: using the spec as the AI's persistent bounded context rather than as a test framework. All three tools arrived at this framing independently because the same inflection point — cheap, stateless execution — made it newly economical for everyone at the same time.

This ADR documents the relationship, acknowledges shared roots, records the inspiration taken from both tools, and explains why the implementation paths diverged despite starting from the same SDD base.

---

## Prior Art

### GitHub Spec Kit
**Source**: https://github.com/github/spec-kit  
**Announced**: Early 2025

A four-artifact stack: Constitution.md (governance) → Spec.md (requirements) → Plan.md (architecture) → Tasks.md (ordered work breakdown). Designed to eliminate "vibe coding" by keeping AI agents anchored to a persistent specification. Technology-agnostic. Enforcement is discipline-based — no hooks, no CI gates, no automated checks.

### OpenSpec (Fission AI)
**Source**: https://github.com/Fission-AI/OpenSpec  
**Announced**: Early 2025

A three-phase model: Propose → Apply → Archive. Brownfield-first, designed for existing codebase evolution with ADDED/MODIFIED/REMOVED delta markers on spec changes. Generates tighter, more minimal specs than Spec Kit. No automated enforcement — practice requires "assembling tools and maintaining discipline."

---

## What Forgecraft Does Differently

All three tools start from the same premise: **the spec is the source of truth and the AI's bounded context**. The paths diverged because of a difference in first principles about *who enforces* the spec.

Spec Kit and OpenSpec treat enforcement as a human discipline problem. Forgecraft treats it as an engineering problem.

| Aspect | Spec Kit | OpenSpec | Forgecraft |
|---|---|---|---|
| **Enforcement** | Discipline + template constraints | Discipline + delta protocol | Hooks, gates, probes — structural at commit time |
| **Spec binding** | 4 artifacts (Constitution → Tasks) | Delta overlays on existing specs | L1-L4 ladder — each layer adds a probe and a gate |
| **Testing** | Test-first ordering in Plans | Not addressed | TDD-at-each-layer: L2 behavioral probes, L3 env probes, L4 SLO probes |
| **Drift detection** | AI consistency analysis (aspirational) | Delta markers on spec changes | `spec_diff`, gate violations, `layer_status` — machine-evaluable |
| **Living state** | Not addressed | Not addressed | `.claude/state.md` written by `close_cycle` — live leaf in the sentinel tree |
| **Sentinel tree** | Flat artifact stack | Flat proposal document | Navigable `.claude/` tree — bounded context, load only what is relevant |
| **Brownfield** | Greenfield-first | Explicitly brownfield-first | Both — `refresh` for brownfield, `setup_project` for greenfield |
| **Commit discipline** | Not enforced | Not enforced | Pre-commit hooks, TDD gate, `close_cycle` as cycle boundary |

The core divergence: forgecraft's thesis is that **an AI without enforcement will eventually violate the spec**, not because it is malicious but because it is stateless and context-bounded. Discipline-based systems require the human to remember to apply the discipline. Forgecraft makes the spec violations structurally unreachable by encoding them as gates that block commits and as probes that must pass before a cycle closes.

---

## What Was Adopted as Inspiration

Two ideas from these tools were incorporated after this discovery:

1. **`[NEEDS CLARIFICATION]` markers** (from Spec Kit's template constraint model): When forgecraft generates spec artifacts, ambiguous sections are marked explicitly rather than left as plausible-looking prose. The AI cannot act on ambiguity it cannot see.

2. **Proposal artifact before session generation** (from OpenSpec's Propose phase): `propose_session` produces a pre-implementation impact assessment — which specs change, which layers are affected, which gates must pass — before `generate_session_prompt` runs. This is Spec Kit's intent-first principle combined with forgecraft's layer-awareness.

---

## On Parallel Convergence

The simultaneous emergence of Spec Kit, OpenSpec, and Forgecraft from the same SDD premise is not a coincidence. It reflects a genuine inflection point in software development: LLMs made executable specifications economically viable for the first time, and the industry independently reached the same conclusion about what to do with that.

The divergence in paths is equally unsurprising. Spec Kit came from GitHub, where the constraint is tooling adoption across millions of developers — simplicity and discipline-based enforcement is the right call for that distribution. OpenSpec came from a brownfield-heavy consulting context, where delta specs and minimal overhead matter most. Forgecraft came from a production engineering context where **the cost of a spec violation is an incident**, not a code review comment — which is why enforcement is structural rather than advisory.

All three are correct for their intended context. The ideas are complementary.

---

## Decision

This ADR is recorded as a permanent acknowledgment of prior art and parallel convergence. Future readers of the codebase should understand that the design choices in forgecraft — particularly the gate/probe/hook enforcement model — were not made in ignorance of lighter alternatives, but in deliberate response to a different threat model: the stateless AI that will eventually drift from spec without structural enforcement.

References to Spec Kit and OpenSpec appear in `docs/design-philosophy.md`.
