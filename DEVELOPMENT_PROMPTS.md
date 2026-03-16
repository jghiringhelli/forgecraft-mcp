# Development Prompts — ForgeCraft MCP

Bound, self-contained session prompts for each roadmap item.
Each prompt is executable to completion without additional narration.

---

## P-001 — ~~Add §16 Context Loading Strategy to Practitioner Protocol White Paper~~ ✅ COMPLETE

> **Status:** §16 "Context Loading Strategy" already exists in the Practitioner Protocol
> at lines ~470–500. It covers: context loading order, what to exclude, MCP server budget
> (≤3), and the token-budget rationale that produced the pointer architecture + `get_reference`
> on-demand dispatch. No action required.

**Original specification references:**
- Load `CLAUDE.md` (architectural constitution)
- Load `docs/forgecraft-spec.md` §4 (GS methodology)
- Load `Status.md` (current session state)
- Load `templates/universal/reference.yaml` (guidance blocks for exact wording)
- Load `C:\workspace\argos\argos_automation\docs\forge\delivery\GenerativeSpecification_PractitionerProtocol.md` (white paper being extended)
- Do NOT load test files, `node_modules`, or `dist`

**Precondition:**
The practitioner protocol white paper exists at:
`C:\workspace\argos\argos_automation\docs\forge\delivery\GenerativeSpecification_PractitionerProtocol.md` The five GS guidance procedure blocks have been moved from
`instructions.yaml` to `templates/universal/reference.yaml` with `topic: guidance`. The
`get_reference(resource: guidance)` tool is implemented and callable. The white paper
currently lacks explicit coverage of the `get_reference` tool contract as the recommended
on-demand procedure dispatch mechanism.

**Scope:**
- ADD: New §16 "Context Loading Strategy and On-Demand Procedure Dispatch" to the white paper
- ADD: Reference to `DEVELOPMENT_PROMPTS.md` as the canonical Procedural Memory artifact
- ADD: Description of the `get_reference(resource: guidance)` tool contract (what it returns,
  when to call it, how it replaces inline CLAUDE.md content)
- ADD: Rationale for the token-budget constraint motivating CLAUDE.md skeleton + pointer pattern
- UPDATE: Any existing section that references inlining GS procedures into CLAUDE.md (change the
  recommendation to the pointer pattern)
- NOT IN SCOPE: Changes to §1–§15. Do not alter the white paper's theory sections, the five
  memory types framing, or the six GS properties. Additive changes only.

**Acceptance criteria:**
- [ ] §16 exists with a clear description of the context loading order (constitution first, spec
      second, ADRs third, Status.md fourth, session prompt last)
- [ ] §16 describes the CLAUDE.md token-budget constraint: target <200 lines; the 5 detailed
      GS procedure blocks (session loop, context loading, incremental cascade, bound roadmap,
      diagnostic checklist) are referenced via `get_reference(resource: guidance)` rather than
      inlined
- [ ] §16 covers the `DEVELOPMENT_PROMPTS.md` artifact: its role as Procedural Memory, its
      relationship to the bound-roadmap GS property, and the bound prompt format
- [ ] §16 explains the MCP server budget limit (≤3 active servers) and why it matters for
      context attention
- [ ] Any existing section that says "include X in CLAUDE.md" is updated if X is now in the
      guidance blocks — the new recommendation is to add a pointer line and use `get_reference`
- [ ] The white paper section numbering is consistent after addition
- [ ] The final draft reads at a practitioner level — not implementation docs, but principled
      rationale a senior engineer would act on

**Architecture constraints:**
- This is a documentation task in the white paper project — no code changes in forgecraft-mcp
- Write in the white paper's existing register (principled, concise, practitioner-oriented)
- Each paragraph of §16 must be independently purposeful — no filler transitions
- Don't introduce new terminology not already defined in §1–§15

**Commit message:** docs(white-paper): add §16 context loading strategy and on-demand procedure dispatch

---

## P-002 — Artifact Coverage: Fix 0% core + 37% artifacts Coverage

**Specification references:**
- Load `CLAUDE.md` (testing pyramid section)
- Load `src/core/index.ts` (GenerativeSpec type exports)
- Load `src/artifacts/index.ts` (public artifact barrel)
- Load `tests/core/properties.test.ts` (just created — pattern reference)

**Precondition:**
`tests/core/properties.test.ts` exists. Five test files in `tests/artifacts/` have been
created (`claude-instructions`, `commit-hooks`, `schema`, `adr`, `commit-history`).
Coverage baseline: `src/core` 0%, `src/artifacts` 37%.

**Scope:**
- VERIFY: `npm test -- --coverage` runs cleanly
- FIX: Any import path errors, missing exports, or wrong constructor signatures in the test files
- TARGET: `src/core` ≥ 80% (covered by artifact instantiation in tests), `src/artifacts` ≥ 80%
- NOT IN SCOPE: Changing artifact implementation code. Fix tests only.

**Acceptance criteria:**
- [ ] `npm test` exits 0 with all tests passing
- [ ] `src/core` coverage ≥ 80%
- [ ] `src/artifacts` coverage ≥ 80%
- [ ] No skipped or pending tests added

**Architecture constraints:**
- Test against public API only — no testing of private methods
- Use `mkdtempSync` for any tests requiring real filesystem interaction

**Commit message:** test(artifacts): fix coverage — src/core 0% and src/artifacts 37% gates

---

## P-003 — Add get_reference(guidance) Integration Test

**Specification references:**
- Load `src/tools/get-reference.ts` (getGuidanceHandler)
- Load `tests/tools/get-reference.test.ts` (existing test patterns)
- Load `templates/universal/reference.yaml` (guidance blocks)

**Precondition:**
`getGuidanceHandler` is implemented and exported from `src/tools/get-reference.ts`. The
five guidance blocks exist in `reference.yaml` with `topic: guidance`. The router dispatches
`resource: "guidance"` to `getGuidanceHandler()`.

**Scope:**
- ADD: Integration test in `tests/tools/get-reference.test.ts` (or a new
  `tests/tools/get-guidance.test.ts`) that calls `getGuidanceHandler()` and verifies:
  - Returns 5 guidance blocks
  - Content contains "Session Loop"
  - Content contains "Context Loading"
  - NOT included in `composeTemplates` instruction blocks (verify exclusion)

**Acceptance criteria:**
- [ ] `npm test` exits 0 with new tests passing
- [ ] At least 3 test cases for `getGuidanceHandler`
- [ ] No guidance block IDs appear in `composed.instructionBlocks` when running `composeTemplates(["UNIVERSAL"], ...)`

**Commit message:** test(get-reference): add integration tests for guidance resource

---

## P-004 — White Paper: Record Treatment-v3 Results + Prescriptive-at-All-Levels Findings

**Specification references:**
- Load `experiments/white-paper/conclusions.md` (§9 — Static Quality Checks, §9.4a)
- Load `experiments/white-paper/conditions.md` (per-condition condition profiles)
- Load `experiments/white-paper/data.md` (quantitative results table)
- Load `experiments/treatment-v3/README.md` (hypothesis, delta from v2, artifact cascade)
- Load `experiments/treatment-v3/evaluation/` (audit scores, metrics — post-run)
- Load `templates/universal/instructions.yaml` lines 1-150 (dependency-registry + language-stack-constraints blocks)

**Precondition:**
Treatment-v3 experiment has completed:
- `experiments/treatment-v3/output/project/` exists with generated code
- `experiments/treatment-v3/evaluation/` has `audit-report.json` and `metrics.md`
- `npm audit --audit-level=high` has been run on `experiments/treatment-v3/output/project/`
- GS audit score is available (expected: 12/12 or close given artifact cascade matches v2)

**Background — what treatment-v3 tested:**
Treatment-v2 achieved 12/12 GS score but had 9 HIGH CVEs (the highest of all conditions).
Root cause: `bcrypt` → native dep CVE chain + `@typescript-eslint@^6` → old minimatch CVE.
Neither the GS rubric nor the CLAUDE.md had any mechanism forcing dependency auditing.

Treatment-v3 added, as GS artifacts prescribed in the CLAUDE.md:
1. `docs/approved-packages.md` — AI-maintained approved-package registry, emitted in P1
2. `dependency-registry` block prescribing: audit-before-add, update registry after every add, commit gate on HIGH/CRITICAL, zero-tolerance without named ADR
3. Pre-commit hook updated: `npm audit --audit-level=high` gate added
4. CI pipeline: `npm audit --audit-level=high` as required step
5. Seed defaults: `argon2` explicitly preferred over `bcrypt` with rationale; `@typescript-eslint@^8` explicitly specified

**Scope:**
- ADD §10 "Treatment-v3: Prescriptive Dependency Governance" to `conclusions.md`
  Subsections:
  - §10.1 — Hypothesis and treatment delta (from treatment-v2)
  - §10.2 — Results: GS audit score, npm audit HIGH count, does `docs/approved-packages.md` exist in output?
  - §10.3 — Did the AI choose argon2 or bcrypt?
  - §10.4 — Cross-condition comparison table (add treatment-v3 column)
  - §10.5 — Finding: Does prescriptive GS + explicit seed defaults eliminate the CVE problem?
  - §10.6 — Limit: This tests one AI, one run. Hypothesis is directional, not proved by N=1.

- UPDATE `conditions.md` — add treatment-v3 condition profile

- UPDATE `data.md` — add treatment-v3 column to the quantitative results table

- UPDATE §9.4a cross-condition table in `conclusions.md` — add treatment-v3 row for tsc/eslint/npm audit

- UPDATE §9.6 "Recommended Runner Extensions" — note that evaluator should check for `docs/approved-packages.md` presence and `argon2 vs bcrypt` selection as new metrics in future runs

- ADD to `conclusions.md` a brief "Prescriptive at All Levels" synthesis paragraph:
  GS prescriptiveness must extend to dependency governance, not just architecture. The experiment shows that structural quality (layers, interfaces, tests) and dependency security are fully orthogonal — high GS scores do not imply low CVE counts unless the spec explicitly prescribes dependency auditing. Treatment-v3 tests whether making the AI the owner of a living approved-package registry closes this gap.

- ADD §10.7 "Verifiable vs Executable — Two Distinct Quality Dimensions":
  The treatment-v3 Hurl spec run revealed that GS Verifiable 2/2 and Executable 0/2 are
  orthogonal. GS evaluates raw response content (does the code exist, is it well-structured,
  are tests present?). It cannot detect whether the code compiles and routes correctly. The
  route-wiring gap (app.ts not updated incrementally), the JWT StringValue type mismatch, and
  the bio normalization bug were invisible to the rubric but fatal to runtime compliance.
  Introduce the **Executable dimension (0–2)**: 0 = fails to compile or start, 1 = partial
  spec pass (<80%), 2 = ≥80% of spec files pass. Record treatment-v3 as Verifiable 2/2 /
  Executable 0/2 and explain why the runner design (--tools "") contributed to the gap.

- ADD §10.8 "Main Conclusion: GS as a Specification-Completeness Amplifier":
  This is the paper's central claim, supported by all five conditions.

  Let $S \in [0, 1]$ be the **specification completeness** for a given quality dimension
  (architecture, testing, dependency security, runtime compliance). Let $I(S)$ be the
  expected number of human-feedback iterations required to reach a correct implementation
  in that dimension. The empirical claim is:

  $$I(S) \approx \frac{1}{S}$$

  At $S = 1$ (formal executable spec, e.g. a Hurl suite): the verify loop closes
  automatically in a single pass — no human judgment required. At $S \to 0$ (pure
  creative output, undefined requirements): every iteration requires a human oracle.

  GS is a **specification-completeness amplifier**: it raises $S$ before generation by
  forcing human judgment into structured, reusable artifacts (ADRs, CLAUDE.md blocks,
  approved-package registries, pre-commit hooks) rather than absorbing that judgment
  reactively in post-generation prompts. Each treatment condition advances $S$ in one
  additional dimension:

  | Condition | Dimension advanced | Observable effect |
  |---|---|---|
  | naive | baseline (no amplification) | maximum gap in all dimensions |
  | control | expert prompting | structural improvement only |
  | treatment | architecture ADRs + CLAUDE.md | higher GS score |
  | treatment-v2 | explicit test contracts per feature | 12/12 GS but CVE gap exposed |
  | treatment-v3 | dependency registry + audit gate | 0 HIGH CVEs, runtime gap exposed |
  | treatment-v4 | verify loop (tsc + jest feedback) | hypothesis: Executable 0→2 |

  The CVE gap in treatment-v2 and the runtime gap in treatment-v3 are not failures of
  the method — they are confirmations of the formula. Specification completeness in the
  dependency-security and runtime-compliance dimensions was still low ($S \approx 0$),
  so convergence required interventions that were not yet prescribed.

  This framing is falsifiable and domain-independent. The open research question is
  whether $S$ can be raised to near-1 across all dimensions for a given domain class,
  enabling reliable single-pass generation.

**Acceptance criteria:**
- [ ] `conclusions.md` has §10 with all 8 subsections
- [ ] treatment-v3 npm audit HIGH count reported (expected: 0)
- [ ] Whether `docs/approved-packages.md` was emitted in P1 is recorded (yes/no + what packages it listed)
- [ ] Whether AI chose argon2 or bcrypt is explicitly reported
- [ ] §10.7 reports treatment-v3 Verifiable and Executable scores explicitly
- [ ] §10.7 defines the Executable dimension (0–2) with criteria
- [ ] §10.8 contains the $I(S) \approx 1/S$ formulation with the five-condition evidence table
- [ ] §10.8 explains each treatment delta as an advancement of $S$ in a specific dimension
- [ ] §10.8 states the main finding without overclaiming: directional, N=1 per condition
- [ ] `data.md` updated with treatment-v3 column and Executable score row
- [ ] `conditions.md` updated with treatment-v3 profile
- [ ] No claim of statistical significance — N=1 run, directional finding only

**Architecture constraints:**
- White paper register: principled, concise, practitioner-oriented — not implementation docs
- Do NOT modify §1–§9 findings. Additive only.
- If treatment-v3 did NOT eliminate CVEs (unexpected), record that faithfully and diagnose why the prescription was insufficient
- §10.8 is the conclusion of the paper — write it last, after all §10.1–10.7 evidence is recorded

**Commit message:** docs(white-paper): add §10 treatment-v3 results + Executable dimension + main conclusion I(S)≈1/S
