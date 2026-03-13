# Experiment Conclusions — Analytical Synthesis

*Cross-condition analysis of the three-condition GS experiment.*
*Primary evidence: [RESULTS.md](../RESULTS.md) and [data.md](./data.md).*

---

## §1 What the Three Conditions Conclusively Show

The progression across conditions is **monotonic on every measured instrument**:

| Instrument | Naive | Control | Treatment | Direction |
|---|---|---|---|---|
| GS audit total (0–12) | 5 | 8 | 9 | ↑ monotonic |
| Estimated LoC | 2,575 | 4,070 | 4,597 | ↑ monotonic |
| Static test count | 57 | 141 | 143 | ↑ monotonic |
| Real coverage (lines) | 0% | 34% | 28%* | Structured >> unstructured |
| Test suite compiles | ❌ | ✅ | ✅ | Structured >> unstructured |
| Avg time/prompt (s) | 65.5 | 106.7 | 127.6 | ↑ with structure |

*Treatment 28% because 6/10 suites fail a JWT_SECRET type-narrowing TS error — the 4 compilable suites pass at 100%.

**The primary claim this data supports:**

> Structure — whether expert prompting or GS — prevents catastrophic output failure.
> The naive condition produced an internally incoherent project: a test suite that forever
> cannot compile because it references database models that were never emitted as files.
> Both structured conditions produced compilable, layered, testable code.

**What it does NOT support:**  
That GS is strongly better than expert prompting. The control–treatment gap is +1 point
(8→9, 8.3% relative improvement), exclusively on the Composable dimension. The experiment
was not powered to distinguish small differences; a single run with a single model does not
constitute statistical evidence.

---

## §2 The Defended Floor — A Structural Finding

All three conditions scored **0/2** on the Defended property. This is the experiment's
most stable finding because it is identical across all three conditions, and the auditor's
reasoning was consistent.

The Defended property requires **operational artifacts emitted to disk**:
- `.husky/pre-commit` — enforces checks before each commit
- `.github/workflows/ci.yml` — enforces checks on every push/PR
- `commitlint.config.js` — enforces commit message format

None of the three conditions emitted any of these. Not even the treatment, which explicitly
specified hooks in its GS artifacts. This reveals a behavioral pattern:

> Models treat specification text as guidance for application code structure.
> They do not treat it as directives to generate operational/infrastructure artifacts.

The treatment condition's CLAUDE.md contained this exact instruction:
```
Pre-commit hook (.husky/pre-commit): tsc --noEmit && npm test
CI (.github/workflows/ci.yml): lint → type-check → test → coverage gate
```
The model cited these in documentation prose. It never emitted them as files.

**This is the "Emit vs. Reference" failure in its most consequential form.**
When an artifact is described rather than emitted, it does not exist in the project.
A developer receiving the output has documentation that claims enforcement exists.
No enforcement exists.

---

## §3 The Mutation Testing Question

**Can we conclude that both GS and expert prompting need mutation testing for the Defended boundary to be meaningfully satisfied?**

**Short answer: Yes — with two layers of nuance.**

### Layer 1: Hooks don't exist yet (the precondition is unmet)

To be technically Defended (2/2), hooks must first exist as files. None of the three
conditions achieved this. Before discussing what hooks *enforce*, they must *exist*.

The experiment's corrective action (GS template post-experiment improvement: "Emit, Don't Reference")
addresses this prerequisite. A future run with this improvement applied might emit actual hook files.

### Layer 2: Hooks enforcing only `npm test` are insufficient

If hooks were emitted and enforced `npm test`, the Defended gate would technically be satisfied.
But the post-experiment mutation testing on the treatment project shows what that gate would
actually catch:

| Round | Test count | MSI | Surviving mutants |
|---|---|---|---|
| Baseline (generated) | 33 | 58.62% | 23 killed by nothing |
| After coverage improvement | 63 | 68.97% | — |
| After assertion quality | 73 | 93.10% | 8 remaining |

The original generated test suite — which `npm test` would pass — missed 23 mutants.
These are not edge cases: they include wrong operator substitutions (`>` → `>=`),
removed `async` modifiers, and swapped conditional branches. A commit hook running
only `npm test` would pass code with all 23 of these defects. The gate exists but
doesn't meaningfully defend.

**The conclusion:**

A system is *technically* Defended when hooks exist and `npm test` passes.
A system is *meaningfully* Defended when the enforced test suite has sufficient
mutation coverage to catch the class of bugs that surviving mutants represent.

For the GS rubric to capture this distinction, the Defended criterion should specify:
> "CI pipeline includes mutation score gate. Pre-commit enforces: type-check + tests.
> CI enforces additionally: mutation score gate (MSI ≥ 65%)."

Both control and treatment conditions would need this to be explicitly prompted.
It is not implicit in "write a CI pipeline."

### What this means for the template

The post-experiment improvement added mutation score gates to `commit-protocol` in
`templates/universal/instructions.yaml`. But that only addresses the *specification*
layer. To generate a CI workflow that *actually runs Stryker*, the model would need
explicit instruction to emit `.github/workflows/ci.yml` with a concrete stryker run step.

That is a specifiable requirement. It is not currently part of the P1 emitted artifacts.

---

## §4 What Would Achieve a Perfect Score (12/12)

No condition came close to 12/12. The ceiling effects on Bounded/Verifiable/Self-Describing
and the floor effects on Defended/Auditable cap what any single approach can achieve today.
Here is a precise, testable inventory of what is missing.

> **Implementation status (as of commit `7e06e78`):** All items in §4.4 (Defended) and §4.5
> (Auditable) have been added to `templates/universal/instructions.yaml`. The Dependency
> Inversion pattern (§4.6) has been made explicit. A GS v2 experimental run against the same
> benchmark is the next step to confirm whether these template changes produce the expected
> score movement. See [RESULTS.md §13.5](../RESULTS.md) for how the gap was originally
> identified.

### 4.1 Self-Describing — already at 2/2 (ceiling, not an issue)

Both structured conditions reached maximum. Nothing to add here.

### 4.2 Bounded — already at 2/2 (ceiling, not an issue)

Even the naive condition reached 2/2 on this dimension. Layered architecture emerges
from any prompt that names "API" — models apply it without explicit instruction.

### 4.3 Verifiable — at 2/2 for compilable projects

The naive condition scored 2/2 despite its tests being unable to compile. The auditor
scored based on test structure and naming (which were correct) without access to runtime
behavior. The rubric does not penalize for compilation failures in this dimension.

For the rubric to capture "tests actually run," Verifiable would need a sub-criterion:
"Test suite executes against a real database and achieves ≥ 80% line coverage."
At that standard: naive = 0/2, control = 0/2 (34%), treatment = 0/2 (28%).
**No condition would pass Verifiable** if the criterion required real, measured coverage.

This suggests the GS rubric has a measurement gap: it rewards the form of verification
(test structure exists) without verifying the function (tests actually execute and pass).

### 4.4 Defended — 0/2 everywhere (the key gap)

**What is missing to achieve 2/2:**

These files must be emitted as path-annotated code blocks, not described in prose:

```
.husky/pre-commit
.husky/commit-msg
.github/workflows/ci.yml
commitlint.config.js
```

**`.husky/pre-commit` minimum content:**
```sh
#!/usr/bin/env sh
npx tsc --noEmit && npm test
```

**`.github/workflows/ci.yml` minimum content for meaningful defense:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint src
      - run: npx prisma migrate deploy
      - run: npm test -- --coverage
      - run: npx stryker run   # mutation gate — this is the key addition
```

**For GS specifically:** The treatment CLAUDE.md already specifies this. The missing
step is a P1 prompt directive: *"Emit `.github/workflows/ci.yml` and `.husky/pre-commit` as
fenced file blocks."* The post-experiment improvement added "Emit, Don't Reference" to the
commit-protocol section. It needs to be explicit enough that the model generates the file,
not just acknowledges the concept.

### 4.5 Auditable — 1/2 for both structured conditions

**What is missing to achieve 2/2:**

Treatment referenced 4 ADRs (ADR-0001 through ADR-0004) but emitted zero ADR files.
Control emitted zero ADR files or conventional commit setup.

Required absent artifacts:

| File | Content |
|---|---|
| `docs/adrs/ADR-0001.md` | Architecture decision record (stack choice) |
| `docs/adrs/ADR-0002.md` | Authentication strategy |
| `docs/adrs/ADR-0003.md` | Error format decision |
| `CHANGELOG.md` | Initial entry: `## Unreleased` block |
| `commitlint.config.js` | `module.exports = {extends: ['@commitlint/config-conventional']}` |

The ADR stub requirement was added to GS templates post-experiment
("ADR Stubs — Emit in P1"). For control, this would require an explicit instruction
in the README or prompts: *"Create docs/adrs/ADR-0001.md documenting the stack decision."*

### 4.6 Composable — 2/2 for treatment, 1/2 for control

**What control needs to achieve 2/2:**

Control uses constructor injection but against concrete types (`new UserRepository(prisma)`
with `prisma` injected, but `UserRepository` is the concrete class, not an interface).

Required additions to control README or prompts:
```
Define repository interfaces before concrete classes:
  interface IUserRepository { findByEmail(email: string): Promise<User | null>; ... }
class PrismaUserRepository implements IUserRepository { ... }
Services depend on IUserRepository, not PrismaUserRepository.
```

This is a specifiable, one-paragraph addition to the control README that would
likely push Composable from 1→2 for control. GS treatment achieves this via the
`SOLID Principles` block in CLAUDE.md + the explicit IRepository pattern in ADRs.

### 4.7 The Hypothetical Perfect Score

| Approach | What to add | Difficulty |
|---|---|---|
| **GS treatment** | Emit hooks + CI + ADR files + mutation gate in CI | Medium — template change only; requires "Emit, Don't Reference" for infrastructure files |
| **Expert prompting** | Add: DI interfaces, emit hooks/CI, emit ADR stubs | High — requires 5–8 paragraphs of additional README specification; all prose |
| **Naive** | Not feasible without fundamental restructuring | N/A |

The GS advantage in achieving 12/12 is that the **changes are centralized**:
update `templates/universal/instructions.yaml` once, and all GS-powered projects
inherit the improvement. For expert prompting, each project README must be
manually updated with the new requirements — the knowledge is not composable.

---

## §5 The Annotation Failure and What It Proves

The naive condition's most important finding is not its GS score (5/12) — it is
that the project **cannot compile its own tests**.

The cause is mechanical and precise:  
The model wrote `model Article`, `model Comment`, `model Tag`, `model Favorite`
inside non-path-annotated code blocks in response P3. The materializer extracts
only path-annotated blocks. The article router, article controller, and all test
files reference these models. They do not exist in the schema.

This is not a "bad code quality" failure. It is an *incoherence failure*:
the output references facts about the world that do not exist in the output.

**What this proves about file-path annotation conventions:**

File-path annotation (`// src/filename.ts` as the first line of a fenced block)
is not mere documentation. It is a **coherence mechanism**. When a model is
instructed to annotate every code block with its target path:

1. The emitted code can be mechanically extracted and assembled
2. The model must decide *which file* a change belongs to before writing it
3. That decision forces reconciliation: if `Article` is referenced in `routes/articles.ts`,
   the model must also emit `model Article` in `schema.prisma` or the annotation is wrong
4. Non-annotated blocks are inherently disconnected — they describe changes but
   don't commit to where those changes live

Both structured conditions used path-annotated blocks throughout (enforced by
system prompt in the GS runner). Neither produced a schema/test coherence failure.
The naive condition had no such requirement. The schema was incomplete.

**The conclusion for methodology:**  
Structured prompting's minimum viable requirement for a coherent multi-file project
is not architectural guidance — it is **output format specification**. Instructing
the model on how to emit code (path-annotated fenced blocks) is as important as
instructing it on what code to write.

---

## §6 What This Experiment Does Not Tell Us

Honest boundaries on what can be concluded:

1. **One model, one run**: All three conditions were run once with claude-sonnet-4-5.
   A different model, a stronger model, or a replicated run might produce different
   relative scores. The direction of the finding (structure > unstructured) is likely
   robust; the magnitude (8 vs 9 out of 12) is not.

2. **Author-designed rubric**: The GS property rubric was designed by the same team
   that designed GS. An independently designed rubric might weigh different
   dimensions and produce different scores. The rubric was validated by running it
   blind (separate AI session, no knowledge of experiment) but was not externally reviewed.

3. **Benchmark limitations**: The RealWorld Conduit API is a well-known benchmark.
   All models under test were likely pre-trained on Conduit implementations. Results
   on a novel, proprietary domain benchmark might differ.

4. **The Defended floor is shared, but not equivalent**: Naive, control, and treatment
   all scored 0/2 on Defended. These zeros are not the same. Naive: no hooks, no CI,
   no awareness. Control: described hooks in README, didn't emit them. Treatment:
   specified hooks in formal GS artifacts, still didn't emit them. The progression is real
   even within a 0/2 floor — the score captures existence, not intent.

5. **Coverage ≠ correctness**: Both structured conditions produced real, executable code.
   Real coverage is 28–34%, not 90%+ as hallucinated in documentation. Neither project
   is production-ready. The experiment demonstrates a meaningful distance between
   AI-generated code and production-ready code, but does not measure that distance precisely.

---

## §7 Recommended Next Experiments

Given the findings, these are the most informative follow-up experiments:

| Experiment | What it would test |
|---|---|
| **GS v2 with "Emit, Don't Reference"** | Does the post-experiment template improvement actually cause hooks + CI + ADR files to be emitted? Does Defended change from 0→2? |
| **Replication (3 independent runs per condition)** | Does the scoring direction hold? How much variance is there in a single model across runs? |
| **Different model (GPT-4o or Gemini 1.5 Pro)** | Is the Composable +1 GS advantage model-specific? Do other models respond differently to structured artifacts? |
| **Rubric modification: Verifiable with real coverage gate** | What score does each condition get when Verifiable requires ≥ 80% real measured coverage? Result would likely be 0/2 for all three. |
| **Mutation gate in prompt** | What happens if the P1 prompt explicitly includes: "Your CI pipeline must run `npx stryker run`"? Does it emit it? Does it pass? |
| **Naive v2 with output format specification only** | What if naive prompts add only one rule: "Annotate every code block with its file path"? Does the annotation failure disappear? Does GS score improve? |
