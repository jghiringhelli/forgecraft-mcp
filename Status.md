# Status.md

## Last Updated: 2026-03-07 (Session 3)

## Session Summary
- Implemented Generative Specification methodology (ADR-0001): `src/core/`, `src/artifacts/`, `src/validators/`
- Fixed `mergeInstructionFiles()` merge direction — existing content now wins over template prose
- Updated 4 filesystem tests to reflect the new semantics; added 57 new genspec tests
- Restored compact CLAUDE.md (85 lines) after `generate_instructions` overwrote it
- Fixed `setup_project` skip-vs-merge inconsistency (merged into dist)
- Total: 295 tests passing, 0 TypeScript errors, clean build

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
