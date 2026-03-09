# Status.md

## Last Updated: 2026-03-09 (Session 5)

## Session Summary
- Added comprehensive test taxonomy blocks to 6 tag templates (UNIVERSAL + GAME, WEB-REACT, API, DATA-PIPELINE, ML)
- UNIVERSAL `test-taxonomy` block: 19-type test classification table, variant coverage matrix, pipeline mapping table
- GAME `game-testing` block: expose-store-to-window, vertical chain pattern, generative asset quality gates (visual + audio), MCP-mediated scene inspection
- WEB-REACT `web-react-testing` block: Storybook/Chromatic visual regression, Testing Library user-event, axe-core a11y
- API `api-testing` block: CDC mandatory + Pact broker, subcutaneous primary layer, DAST mandatory at staging, rate limiting assertions
- DATA-PIPELINE `data-pipeline-testing` block: data quality per stage, idempotency, backfill correctness, DLQ drain, volume/scale
- ML `ml-testing` block: data distribution, model regression, inference latency, adversarial inputs, bias/fairness assertions
- Total: 307 tests passing, 0 TypeScript errors, clean build

## Previous Session (Session 4)
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
