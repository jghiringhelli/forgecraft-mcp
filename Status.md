# Status.md

## Last Updated: 2026-03-12 (Session 11)

## Session Summary
Language-independence rework for `forgecraft metrics` probes.

**Commits**: `e8d1246` (TechSpec+roadmap), `a37d412` (metrics command), `ced5c7e` (eval metrics), `0549910` (language-agnostic probes)

**Key changes:**
- Expanded `language-detector.ts`: 7 languages (Go, Rust, Java, Ruby, C#, Python, TypeScript), exported `LANGUAGE_EXTENSIONS`, tiebreak fixed (TypeScript default when equal)
- Rewrote `code-probes.ts` for language independence:
  - LOC: uses `LANGUAGE_EXTENSIONS` — counts all recognised source extensions, not TS-only
  - Coverage: LCOV-first (universal: c8/pytest-cov/go-test/cargo-tarpaulin/JaCoCo/simplecov), istanbul JSON fallback, Cobertura XML fallback
  - Layer violations: language-keyed DB client patterns + depcruise when available for TS
  - Dead code: knip (TS) | vulture (Python) | deadcode (Go)
  - Complexity: ESLint (TS) | radon cc (Python) | gocognit (Go)
  - Mutation: Stryker (TS) | mutmut (Python) | go-mutesting (Go) | cargo-mutants (Rust)
  - Generic tool runner: node_modules/.bin (JS), python -m (Python), PATH (others)
- Fixed broken pre-commit hook: unrendered `{{max_file_length | default: 300}}` and `{{coverage_minimum | default: 80}}` placeholders in 3 hook scripts

**Tests:** 374/374 passing

## Previous Session (Session 10)
**Commit**: `f7c54fa` — feat(templates): expand UNIVERSAL/WEB-REACT with full GS methodology

**New blocks in `templates/universal/instructions.yaml`** (14 → 22 instruction blocks):
- `artifact-grammar` (core): §6 taxonomy — 15 artifact types, linguistic analog, function, six-property self-test checklist
- `naming-as-grammar` (core): layer-scoped naming vocabulary table, technique transport via naming
- `adr-protocol` (core): ADR format, when-to-write rules, session protocol, immutability + supersession
- `use-case-triple-derivation` (recommended): use case → implementation contract + acceptance test + user docs; diagnostic rule
- `living-documentation` (recommended): derived-not-maintained doctrine, tooling table, polyglot note
- `agentic-self-refinement` (recommended): generate→evaluate→adjust loop, domain application table, wrong-history anti-pattern
- `wrong-specification-risk` (recommended): mitigations, diagnostic signs
- `gs-test-techniques` (recommended): adversarial posture, expose-store-to-window, vertical chain test, mutation adversarial audit, multimodal quality gates (visual PCA + LUFS audio), MCP-mediated inspection

**`templates/universal/review.yaml`** (4 → 5 review blocks):
- `artifact-completeness` review dimension: 10-item checklist (constitutional completeness, ADRs, Status.md, naming, schemas, diagrams, use cases, commit discipline, living docs, wrong-spec indicator)

**`templates/universal/structure.yaml`** (15 → 19 structure entries):
- Added: `docs/diagrams/`, `docs/use-cases/`, `specs/`, explicit `docs/adr/` with naming note

**`templates/web-react/instructions.yaml`**:
- Added `expose-store-to-window` and `vertical-chain-test` blocks to `web-react-testing`
- Game template already had these from Session 5

**Test fix**: `tests/registry/loader.test.ts` — `validDimensions` extended with `'artifact-completeness'`

**Composition**: UNIVERSAL 14→22 instruction blocks, 4→5 review blocks, 15→19 structure entries
**Tests**: 307/307 passing, 0 TypeScript errors

## Previous Session (Session 5)
- Added comprehensive test taxonomy blocks to 6 tag templates (UNIVERSAL + GAME, WEB-REACT, API, DATA-PIPELINE, ML)
- UNIVERSAL `test-taxonomy` block: 19-type test classification table, variant coverage matrix, pipeline mapping table
- GAME `game-testing` block: expose-store-to-window, vertical chain pattern, generative asset quality gates (visual + audio), MCP-mediated scene inspection
- WEB-REACT `web-react-testing` block: Storybook/Chromatic visual regression, Testing Library user-event, axe-core a11y
- API `api-testing` block: CDC mandatory + Pact broker, subcutaneous primary layer, DAST mandatory at staging, rate limiting assertions
- DATA-PIPELINE `data-pipeline-testing` block: data quality per stage, idempotency, backfill correctness, DLQ drain, volume/scale
- ML `ml-testing` block: data distribution, model regression, inference latency, adversarial inputs, bias/fairness assertions
- Total: 307 tests passing, 0 TypeScript errors, clean build

- Added domain Playbook system: tag-specific, multi-phase, ordered agent workflow templates
- New types: `PlaybookStep`, `PlaybookPhase`, `PlaybookTemplate` in `src/shared/types.ts`
- `loader.ts` and `composer.ts` extended to load and collect playbooks
- New handler: `src/tools/get-playbook.ts` — renders playbooks with phase filter support
- Wired into `get_reference` dispatch in `forgecraft-router.ts` (`resource: "playbook"`)
- `templates/fintech/playbook.yaml` — 6-phase quant model pipeline
- `templates/game/playbook.yaml` — 5-phase game sim + art pipeline

## Feature Tracker
| Feature | Status | Branch | Notes |
|---------|--------|--------|-------|
| Git hooks + pre-commit chain | ✅ Done | main | 7-hook chain, setup-hooks.sh |
| Vitest coverage gate | ✅ Done | main | @vitest/coverage-v8, 80% threshold |
| setup_project merge fix | ✅ Done | main | Was silently skipping existing files |
| GenerativeSpec interfaces | ✅ Done | main | 6 properties, src/core/ |
| Artifact grammar (5 artifacts) | ✅ Done | main | src/artifacts/ |
| Spec validators | ✅ Done | main | validateSpecs, checkComposition |
| Genspec tests | ✅ Done | main | 57 new tests |
| mergeInstructionFiles fix | ✅ Done | main | Existing content wins |
| Domain Playbook system | ✅ Done | main | FINTECH (6 phases) + GAME (5 phases); on-demand via get_reference |
| Test taxonomy blocks | ✅ Done | main | 6 tag templates; 19-type table, variant matrix, pipeline mapping, tag-specific extensions |

## Known Bugs
| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| B-01 | `generate_instructions` merge erased handwritten CLAUDE.md | High | ✅ Fixed (root cause) |
| B-02 | `setup_project` skipped existing instruction files | Medium | ✅ Fixed |

## Technical Debt
| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Missing artifact impls (diagram.ts, naming.ts, etc.) | Low | Medium | Low |
| No integration test for full setup_project flow | Medium | Medium | Medium |

## Current Context
- Working on: nothing blocked
- Decisions pending: user to provide updated Forge methodology (Session 1 note)

- Next steps:

## Architecture Decision Log
| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| | | | |
