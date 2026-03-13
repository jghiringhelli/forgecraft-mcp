# White Paper Evidence Package

This folder collects all evidence, data, and artifacts for the paper:
**"Generative Specification: Structured AI Prompting for Production-Quality Code"**

---

## How to Navigate

| Where to look | What you get |
|---|---|
| [RESULTS.md](../RESULTS.md) | Complete results across all 11 sections — the primary evidence document |
| [data.md](./data.md) | All key numbers in one place, pre-formatted for citation |
| [conditions/](./conditions.md) | Summary of all three experimental conditions with links to prompts |
| [gs-artifacts.md](./gs-artifacts.md) | What GS actually emits — the treatment artifact set |
| [code-comparison.md](./code-comparison.md) | Side-by-side code quality evidence (interfaces vs concrete, composition root) |
| [experiment-design.md](../../docs/experiment-design.md) | Pre-registered design (pre-dated all experimental runs) |

---

## The Experiment in One Paragraph

Three conditions were run to build the same backend API (RealWorld/Conduit in TypeScript):

1. **Naive** — unstructured prompting: "Build a REST API for Conduit using Node.js and TypeScript."
   No architecture guidance, no error format, no test requirements. Represents *vibe coding*:
   what happens when a junior developer (or non-engineer) hands AI a problem with no scaffolding.

2. **Control** — expert prompting: Full tech stack specification, layered architecture rules,
   error format specification, test naming conventions. Represents *best-practice prompting*
   as a senior engineer might write it — good, but no formal structure (no GS artifacts).

3. **Treatment** — Generative Specification: The full GS artifact cascade: CLAUDE.md, ADRs,
   C4 diagrams, NFRs, use-cases, test architecture doc, pre-defined Prisma schema.
   Same problem, but with GS as the structured specification layer.

All three used the same model (claude-sonnet-4-5), same benchmark (RealWorld Conduit API spec),
and same evaluation rubric (blind adversarial GS property audit, real test execution, mutation testing).

---

## Key Findings Summary

### GS Property Audit (0–12, blind adversarial scoring)

| Condition | Score | Notes |
|---|---|---|
| **Naive** | TBD (run pending) | Expected floor — no structure, no layers, no tests |
| **Control** | 8/12 | Expert prompting achieves ceiling on 3/6 properties |
| **Treatment** | 9/12 | +1 on Composable only — GS artifacts translated directly to interface-based DI |

**Most important finding:** Expert prompting was *more capable than anticipated*.
It hit the ceiling (2/2) on Self-Describing, Bounded, and Verifiable — the same as GS treatment.
The control condition with explicit architecture instructions produced layered code, proper naming,
custom error classes, and Zod validation — comparable to GS on 5 of 6 properties.

**GS's unique contribution:** The only differentiating dimension was **Composable** (+1).
Treatment's GS artifact: *"Depend on abstractions. Concrete classes are injected, never instantiated inside business logic."*
→ Model emitted: `IUserRepository`, `IArticleRepository` interfaces + explicit composition root in `app.ts`.
Control had constructor injection but against concrete types — functional but not substitutable.

### Defended Property (both conditions: 0/2)

The largest prediction failure. GS artifacts explicitly specify commit hooks (`.husky/pre-commit`).
Neither condition generated them as actual files. Both referenced them in prose documentation only.

**Root cause identified:** Models treat specification text as guidance for code structure,
not as directives to generate operational artifacts. The gap between "GS says hooks should exist"
and "model generates hook files" is a current model-level limitation.

**Corrective action taken:** GS templates updated post-experiment to explicitly instruct:
*"Commit hooks must be emitted as fenced code blocks in P1 — not referenced in prose."*
The experiment produced a concrete, actionable template improvement.

### Coverage Hallucination (both expert conditions)

Both conditions reported 90%+ test coverage in documentation.
Real measured coverage: **34% (control)**, **27% (treatment)**.

This is not a GS-specific finding — it's a model-level finding.
Models report aspirational outcomes, not measured ones.

**Corrective action:** Mutation testing added as a hard quality gate to GS templates (commit `482a111`).
Validated by running Stryker on the treatment project post-experiment: 58.62% → 93.10% MSI
in 3 rounds of test improvement. See [RESULTS.md §12](../RESULTS.md).

### Timing: GS was slower per prompt

| Condition | Total time | Avg per prompt |
|---|---|---|
| Control | 747s | 106.7s/prompt |
| Treatment | 766s | 127.6s/prompt |

Treatment generated 13% more code per turn. GS did not reduce generation cost —
it increased output density. The hypothesis (GS pre-resolves decisions, saving time) was falsified.
More accurate framing: GS shifts model behavior toward producing more comprehensive implementations.

### Naive Condition — Why It Matters

This is not primarily a comparison point for GS. It is an honest baseline.

The de facto deployment pattern for AI in most organizations is: senior engineers are behind
on AI adoption, and juniors/non-engineers are using it without structure ("vibe coding").
The naive condition is that pattern. It documents what the cost of no structure is —
in terms of architecture quality, testability, and code reliability — on a real-world benchmark.

GS is one answer to that cost. Expert prompting is another. The naive baseline makes the
magnitude of the problem visible before discussing solutions.

---

## Honest Limitations

- **Single model**: claude-sonnet-4-5 only. A stronger or weaker model may shift all scores.
- **Single run per condition**: Not replicated. Results are direction indicators, not statistical facts.
- **Author bias**: GS was designed by the same team running the experiment.
  Expert prompting control (Amendment A) was added specifically to narrow the expected GS advantage.
- **n=1 on Naive**: Run pending. Results will be added when it completes.
- **Ceiling/floor effects**: The GS property rubric saturates at 2/2 per dimension.
  A higher-resolution rubric would likely show larger treatment-control differences.

---

## File Inventory

### This folder (`experiments/white-paper/`)
- `README.md` — this file
- `data.md` — all numeric results, pre-formatted for citation
- `conditions.md` — three-condition comparison with prompts summary
- `gs-artifacts.md` — the GS artifact set (what treatment received)
- `code-comparison.md` — illustrative code quality differences

### Parent folder (`experiments/`)
- `RESULTS.md` — complete 12-section results document (primary evidence)
- `REALWORLD_API_SPEC.md` — the benchmark specification used
- `docker-compose.yml` — DB infrastructure for all three conditions
- `control/`, `treatment/`, `naive/` — condition inputs + outputs
- `runner/` — automated experiment infrastructure (run-experiment.ts, audit.ts, etc.)

### Repository root (`forgecraft-mcp/`)
- `templates/universal/instructions.yaml` — GS template (post-experiment improvements included)
- `docs/experiment-design.md` — pre-registered design document
- `docs/adrs/` — ADRs for ForgeCraft itself (GS self-applies)
