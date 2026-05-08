# ADR-0001 — The Generative Specification Principle

**Date:** 2026-03-07
**Status:** accepted

## Status

`accepted` — Foundation decision for this project's methodology. All subsequent
architectural decisions reference this ADR for their theoretical grounding.

## Context

AI-assisted software development produces two failure modes:

1. **Drift**: The agent generates code that is syntactically correct but
   architecturally inconsistent with the project over time.

2. **Hallucination surface**: Under-specified prompts leave degrees of freedom
   that the model fills from its training distribution, not the project's actual
   requirements.

Both failures have the same root cause: **the specification does not constrain
the generation space sufficiently**.

Traditional approaches to this problem (more detailed prompts, longer CLAUDE.md
files, more examples) have diminishing returns. They add tokens without
reducing the generation space, because prose specifications are ambiguous and
cannot be verified automatically.

Reference framework: **Chomsky hierarchy**
- Type 3 (Regular): schemas, naming conventions, commit formats — parseable by finite automata
- Type 2 (Context-free): instruction files, ADRs — parseable by pushdown automata
- Type 1 (Context-sensitive): architectural patterns, module boundaries
- Type 0 (Unrestricted): natural language requirements

**Firth's distributional hypothesis** applied to LLMs:
"A token's meaning is its valid context." A specification's meaning is
the set of correct implementations it permits. A well-formed spec has a small,
unambiguous set.

## Decision

This project adopts the **Generative Specification** methodology:
all artifacts are treated as formal grammars that constrain the LLM's
generation space. A well-formed specification must satisfy six properties:

| Property | Definition | Missing consequence |
|---|---|---|
| **Self-describing** | Explains its own purpose without external context | Agent needs to ask clarifying questions every session |
| **Bounded** | Finite, unambiguous scope — in and out are explicit | Scope creep; conflicting implementations |
| **Verifiable** | Objective pass/fail at every module boundary | Subjective correctness; manual review bottleneck |
| **Defended** | Quality gates reject non-conforming output | Rules are advisory; violations accumulate silently |
| **Auditable** | Every structural decision recorded with rationale | Decisions re-derived from scratch; contradictions emerge |
| **Composable** | Specs combine without conflict; acyclic graph | Coupling; spec A contradicts spec B |

The artifact grammar (the set of artifacts that constitute specifications):
1. `CLAUDE.md` / `copilot-instructions.md` — behavioral constraints
2. ADRs — immutable decision records
3. C4/Mermaid diagrams — structural contracts
4. Zod / JSON Schema — data shape contracts
5. Naming conventions — intention-revealing identifiers
6. Package hierarchy — module boundary enforcement
7. Conventional commits + semver — change history as machine-readable spec
8. Tests (TDD) — executable specifications
9. Pre-commit hooks — automated enforcement of all of the above

Implementation is in `src/core/` (interfaces), `src/artifacts/` (grammar),
and `src/validators/` (enforcement).

## Consequences

Positive:
- Each session starts with a fully self-describing context — no warm-up prompts needed.
- Non-conforming output is rejected at commit time, not in code review.
- Agents can derive the correct implementation from the spec alone.
- The spec is itself machine-verifiable (the validator runs in CI).
- Composing multiple specs (e.g. UNIVERSAL + API + LIBRARY) produces deterministic output.

Negative / Trade-offs:
- More upfront effort to write well-formed specs.
- Hard to retrofit on an under-specified project (must document decisions retroactively).
- Requires discipline to maintain ADRs when decisions change.

Open questions:
- How do we measure "generation space compression" empirically?
- Should the six properties be encoded as a formal type system (dependent types)?
