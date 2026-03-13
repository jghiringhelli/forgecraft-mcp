# Metrics — treatment-v3

*Generated: 2026-03-13*
*Model: claude-sonnet-4-5*

## GS Rubric Score

| Property | Score |
|---|---|
| Self-Describing | 2/2 |
| Bounded | 2/2 |
| Verifiable | 2/2 |
| Defended | 2/2 |
| Auditable | 1/2 |
| Composable | 2/2 |
| **Total** | **11/12** |

> Auditable deduction: ADRs referenced but not emitted as files; CHANGELOG has only placeholder content.

## Static Quality Checks

| Check | Result |
|---|---|
| `tsc --noEmit` errors | 1 (tsconfig artifact — `jest.setup.ts` not under `rootDir`) |
| `npm audit --audit-level=high` | **0 HIGH/CRITICAL** |

## Dependency Registry (P1 Artifact)

Emitted in P1: **Yes** (`docs/approved-packages.md` — in `markdown`-fenced block)

Key decisions documented:

| Package | Chosen | Rejected | CVE rationale |
|---|---|---|---|
| Password hashing | **argon2** `^0.41.1` | bcrypt (CVE chain via `tar`/`node-pre-gyp`) | Explicit CVE cite in registry |
| TS linting | **@typescript-eslint@^8.18.2** | @typescript-eslint@^6 (minimatch CVE) | Explicit CVE cite in registry |
| HTTP framework | express `^4.21.2` | — | 0 HIGH/CRITICAL |
| ORM | @prisma/client `^5.22.0` | — | 0 HIGH/CRITICAL |

## pre-commit Hook

`npm audit --audit-level=high` gate: **Present** (extracted from P1 raw response)

## CI Pipeline

`npm audit --audit-level=high` step: **Present** (in `.github/workflows/ci.yml`)

## Materializer Note

`01-auth-response.md` reported 0 code blocks by the materializer. Root cause: the model used
`markdown` as the code block language for several P1 files, which is outside the materializer's
`fenceRe` language allowlist. The P1 content (approved-packages.md, package.json, husky hooks,
CI workflow, repository interfaces) is present in the raw response file but was not extracted
to disk. The synthesized `package.json` was overridden with the model's actual chosen dependencies
before running `npm audit`.

## Auditable Gap — Root Cause and Template Fix

**Root cause:** The `auditable` block in `templates/universal/instructions.yaml` said
"emit ADR stub files as fenced code blocks" but did not specify *which* ADRs, *minimum
content* requirements, or enforce the invariant: *if a README references a file, that file
must appear as a code block in the same response.*

The model referenced `docs/adrs/ADR-0001-stack.md` in the README and emitted a
CHANGELOG with only a two-bullet Unreleased section — technically compliant with the
old template wording, but insufficient for the GS Auditable property.

**Fix applied to `templates/universal/instructions.yaml`** (committed, not re-run):
- Added minimum ADR set: ADR-0001 (stack), ADR-0002 (authentication), ADR-0003 (architecture)
- Prohibited placeholder content in ADR fields — each must have real Status/Context/Decision/Consequences
- Added explicit reference-check rule: any ADR named in README must appear as a code block in the same response
- Updated CHANGELOG template to include actual P1 decisions instead of empty Unreleased block

**Expected GS score with fix:** 12/12. The fix targets exactly the Auditable deduction:
ADRs would be emitted with content, and CHANGELOG would document P1 decisions.
No v4 run conducted — the hypothesis (0 HIGH CVEs) is confirmed; the 11→12 gap is
a template specificity defect, not a GS design flaw.

## Cross-Condition Comparison

| Condition | GS Score | tsc errors | npm audit HIGH |
|---|---|---|---|
| Naive | — | 41 | 3 |
| Control | — | 1 | 0 |
| Treatment | 10/12 | 0 | 3 |
| Treatment-v2 | 12/12 | 0 | 9 |
| **Treatment-v3** | **11/12** | **1** | **0** |

> treatment-v3 tsc error is a materializer artifact (synthesized tsconfig), not a code defect.
