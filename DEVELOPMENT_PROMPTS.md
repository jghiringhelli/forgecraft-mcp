# Development Prompts — ForgeCraft MCP

Bound, self-contained session prompts for each roadmap item.
Each prompt is executable to completion without additional narration.

---

## P-001 — Add §16 Context Loading Strategy to Practitioner Protocol White Paper

**Specification references:**
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
