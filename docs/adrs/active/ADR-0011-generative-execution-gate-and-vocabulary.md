# ADR-0011: Generative Execution as a Gated, Auditable Capability — and the Sentinel/Generative-Execution Vocabulary

**Status**: Accepted
**Date**: 2026-06-15
**Author**: Juan Carlos Ghiringhelli

---

## Context

ForgeCraft is the **executor arm of Generative Specification (GS)**. Two things the method now insists
on were described but not yet *first-class* in this tool, and one piece of vocabulary the human uses was
not defined where the assistant reads it first. This ADR records all three so a future session (and
ForgeCraft's own stateless reader) can process how the tool now works.

1. **GS does not eliminate defects.** Even with a perfect harness, generation produces residual bugs;
   without exercising the running system there is no way to detect and localize them. This is reinforced
   by the Darwin-Gödel Machine's documented reward-hacking (an agent faking its own test logs): **an
   agent's report of its own success is not verification.** The detection layer is *generative
   execution*, and its pass/fail must be an **objective, recorded, gated** artifact — not advisory prose
   and not a self-report.

2. **The term "generative execution" was ambiguous.** Asked to "do generative execution," an assistant
   tended to default to a single Playwright e2e or "run the test suite," missing the point.

3. **The entry-point file had no agent-agnostic name.** Saying "claude" got taken as the literal
   `CLAUDE.md`; naming several tools got taken as the literal set. The human needs one generic word.

---

## Decision — what is LIVE now

### 1. Generative execution = the multimodal verification loop, sourced objectively
"Generative execution" means: **exercise each use case against the running system across independent
signals** (state, behavior, contract, logs) and check coherence — the multimodal verification loop. It
is **NOT** a single Playwright e2e and **NOT** "run the unit tests." In this codebase its objective
source is **`run_harness`** (`src/tools/run-harness.ts`), which runs per-UC probes in `tests/harness/`
(`.hurl` contracts, `.spec.ts` UI, `.sh`/`.db.sh` state/logs, `.sim.ts`/`.k6.js` simulation/load) and
writes `.forgecraft/harness-run.json`. The canonical loop (run_harness → `consolidateGenerativeExecution` → gate) is referred to as *gs-verify-deploy*. **It is now a packaged skill:** every scaffolded project ships `/generative-execution` (`templates/universal/skills.yaml`, core tier → `.claude/commands/generative-execution.md`), surfaced in the lifecycle Tool Sequencing table. The skill drives `run_harness`, reads the per-UC green/red flags, frames a red as a specification violation, routes runtime discoveries into the §6c discovery log, and applies the §6f audit-RUN caveat for stochastic pipelines — closing the field gap that ForgeCraft had skills for unit tests but none for the manual QA loop that catches in-the-wild bugs.

### 2. Per-use-case green/red flag (FC-1)
Each UC now carries a durable `generativeExecution` status — `green | red | unrun` — defined in
`src/shared/types/verify.ts` (`UcGenerativeExecution`) and persisted in `.forgecraft/verification-state.json`.
- It is written **only** from `run_harness` output, by `consolidateGenerativeExecution()` in
  `src/tools/generative-execution-gate.ts`, called at the end of `runHarnessHandler`. **There is no
  happy-path tool that sets a UC green by hand** (`source: "manual"` exists in the type but is never
  written) — this keeps the flag an objective signal, not a self-report.
- Probe mapping: `pass → green`; `fail|error|timeout|not_implemented|tool_missing → red`; no probe →
  `unrun`. A UC with several probes takes the worst status.

### 3. `close_cycle` gates on it (acceptance gate)
`closeCycle()` (`src/tools/close-cycle.ts`, Step 1.6) **blocks acceptance** (`ready: false`,
`generativeExecutionStatus` field on `CloseCycleResult`) when any in-scope UC is not `green` and not
overridden. `unrun` blocks too — **no objective evidence = not accepted** (the GS stance). Red UCs are
reported with the remediation framing: *a red probe is a specification violation → fix the spec and
regenerate, do not patch the symptom.*

### 4. Override is auditable, file-based, never silent
A red UC is excused from blocking only via `forgecraft.yaml → generative_execution.overrides[]`
(`{ uc, rationale }`, **rationale mandatory** — empty rationale is not a valid override), parsed by
`loadGenerativeExecutionOverrides()`. An override never sets a UC green; it only records, with a reason,
that a red was accepted. This mirrors the existing cascade-decision override pattern.

### 5. The evaluator is pure (and reusable)
`evaluateGenerativeExecution(projectRoot, inScopeUcIds)` does only read-only loads — no writes, no
`process.exit`, no console — so it is reusable as an objective oracle elsewhere (it is the planned
evaluator/oracle for the model-tiering experiment).

### Vocabulary (canonical defs in `soma/docs/method/convenciones-asistente.md`)
- **"El sentinela"** (alt. "el ancla", "la raíz") = the **agent-agnostic entry-point instruction file**
  the assistant reads first (`AGENTS.md` / `CLAUDE.md` / `.cursor/rules` / copilot-instructions),
  whatever its real filename. Refer to the entry file as *the sentinel* from the start of a session.
  **Disambiguation:** this is NOT ForgeCraft's internal `sentinel` code (`src/sentinel/*`,
  `src/registry/sentinel-renderer.ts`) — that machinery *generates and reads* sentinels; "el sentinela"
  is the entry-point file itself. ForgeCraft's own sentinel is its generated `CLAUDE.md`.
- **"Ejecución generativa"** = as defined in §1 above.

### Model-usage guidance (measured, MX pilot — `soma/docs/experiments/mx-pilot/`)
On RealWorld/Conduit tasks verified by a hurl oracle, **Sonnet matched Opus at 100% correctness for ~⅕
the cost**, and **model-tiering did not pay off when the mid-tier model could one-shot the task** (an
Opus planning step alone cost more than Sonnet's entire one-shot build). Operational guidance for the
executor: **default to the mid-tier model (Sonnet) for generation; reserve the strong model (Opus) for
planning/hard escalation; tiering only earns its overhead on tasks beyond the mid model's one-shot
capacity.**

---

## What is PLANNED (not yet implemented — do not assume it exists)
- ~~**FC-2:** a static-analyzer gate hook~~ — **SHIPPED since this ADR** (see ADR-0012). The pure
  evaluator `evaluateStaticAnalyzers()` lives in `src/tools/static-analyzer-gate.ts`, treats
  eslint/tsc/complexity/audit as one structural-discipline signal, is config-gated
  (`forgecraft.yaml → static_analysis`, same auditable-override pattern as FC-1), and is enforced at
  `close_cycle` Step 1.7 (`staticAnalyzerStatus` on `CloseCycleResult`). Sonar/Code Climate remain
  absent → skip seams.
- **Tiered orchestration + token/$ journal:** the planner→executor→evaluator→escalate motor and an
  append-only JSONL journal with token/cost columns (the evaluator above is the reusable piece).
- **Cross-signal coherence:** asserting UI == logs == DB for a UC (today `run_harness` runs signals
  independently). **Run-distribution evidence** (below) is the related refinement for stochastic pipelines.
- **Release/promotion gate:** a `ProjectGate` firing the generative-execution check on the `release`
  hook (today only `close_cycle`/acceptance gates on it).

## Refinement — objective evidence for *stochastic* generative pipelines (VairixDX field study)
The green/red flag treats one `run_harness` pass as the objective signal. That is sound for
deterministic UCs, but the VairixDX brownfield study (an LLM **executive-generation** pipeline run
under a GS harness) showed a single pass is weak evidence for a *stochastic* pipeline: its own
audit-RUN log recorded a 89/100 peak (Run 4) against a ~83 baseline across runs, and a fix could read
GREEN on one run and miss on the next purely from upstream LLM variance. The discipline that pipeline
adopted — a **reusable end-to-end fixture run repeatedly, scored on a multi-axis rubric, with explicit
stochasticity honesty (do not trust a single peak)** — is the correct shape of objective evidence when
the system under test is itself generative. Planned consequence for FC-1: allow a UC probe to be marked
*stochastic* and require an N-run distribution (pass-rate threshold), not a single green, before the
gate accepts it.

---

## Consequences
- Generative execution is now **default and auditable** in the cycle (the *Auditable* and *Executable*
  properties), not an optional ad-hoc step. Residual defects surface and localize to the spec.
- The executor arm now *enforces* what the method *claims*: a cycle cannot be accepted while a use case's
  objective verification is red (or unproven), absent a recorded, reasoned override.
- A team that wants to ship a red UC must write down why — turning silent shortcuts into an auditable ledger.
- **Independent field validation (VairixDX brownfield A/B/C study):** a configured GS harness vs.
  by-the-book GS vs. naive, on a real maintenance task, reproduced our greenfield (KX/AX) results —
  context-precision is the mechanism (utilization 10% → 44% → **82%**), **hooks are a token multiplier**
  (~63% of session savings at **0 token cost**, the same reason FC-1/FC-2 gates live in hooks not
  prose), and **rework cost dominates** (naive 3.06× more expensive once expected rework is included).
  7-property score 2/14 → 10/14 → **14/14**. This is the brownfield companion to the greenfield arms and
  confirms the executor-arm stance that objective, hook-borne verification is what makes the cycle pay off.

## References
- Commits: `6cdf005`, `8e3872c`, `92ee911`, `f37bb14` (FC-1). Tests: `tests/tools/generative-execution-gate.test.ts` (+ close-cycle/run-harness), 80/80 green.
- Code: `src/tools/generative-execution-gate.ts`, `src/tools/run-harness.ts`, `src/tools/close-cycle.ts`, `src/shared/types/verify.ts`.
- Method/convention: `soma/docs/method/convenciones-asistente.md`. Tracking: `soma/docs/STATE.md`. Pilot: `soma/docs/experiments/mx-pilot/`.
