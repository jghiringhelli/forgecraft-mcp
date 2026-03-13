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

## Cross-Condition Comparison

| Condition | GS Score | tsc errors | npm audit HIGH |
|---|---|---|---|
| Naive | — | 41 | 3 |
| Control | — | 1 | 0 |
| Treatment | 10/12 | 0 | 3 |
| Treatment-v2 | 12/12 | 0 | 9 |
| **Treatment-v3** | **11/12** | **1** | **0** |

> treatment-v3 tsc error is a materializer artifact (synthesized tsconfig), not a code defect.
