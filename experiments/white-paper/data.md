# Experiment Data — All Numbers

*Pre-formatted for citation in the white paper. All values are measured, not estimated,
unless explicitly marked as HALLUCINATED or PENDING.*

---

## §A GS Property Scores (Blind Adversarial Audit)

| Property | Naive | Control | Treatment | Notes |
|---|---|---|---|---|
| Self-Describing (0–2) | PENDING | 2 | 2 | Ceiling effect in both structured conditions |
| Bounded (0–2) | PENDING | 2 | 2 | Ceiling effect in both structured conditions |
| Verifiable (0–2) | PENDING | 2 | 2 | Ceiling effect in both structured conditions |
| Defended (0–2) | PENDING | 0 | 0 | Floor effect — hooks referenced but not emitted |
| Auditable (0–2) | PENDING | 1 | 1 | ADRs referenced but not emitted as files |
| Composable (0–2) | PENDING | 1 | 2 | Only GS differentiated: interface-based DI + composition root |
| **Total (0–12)** | PENDING | **8** | **9** | +1 Treatment (8.3% relative improvement over expert control) |

*Audit method: separate Claude session, blind to experiment and GS methodology.
Rubric in `experiments/treatment/evaluation/scores.md`.*

---

## §B Execution Timing

| Prompt | Control (s) | Treatment (s) | Delta |
|---|---|---|---|
| 01 auth | 131.7 | 158.8 | +27.1 |
| 02 profiles | 67.3 | 112.1 | +44.8 |
| 03 articles | 145.1 | 193.0 | +47.9 |
| 04 comments | 85.8 | 126.0 | +40.2 |
| 05 tags | 58.8 | 64.3 | +5.5 |
| 06 integration | 114.5 | 111.4 | −3.1 |
| 07 tests (control only) | 143.8 | — | — |
| **Total** | **747.0s** | **765.6s** | +18.6s |
| **Avg/prompt** | **106.7s** | **127.6s** | +19.9s (+18.6%) |
| Wall time (incl. gaps) | 772.1s | 799.9s | +27.8s |

*Naive timing: PENDING.*

---

## §C Code Volume

| Metric | Naive | Control | Treatment |
|---|---|---|---|
| `it`/`test` call count | PENDING | 141 | 143 |
| `describe` blocks | PENDING | 44 | 50 |
| Layer violations (prisma.* in routes) | PENDING | 0 | 0 |
| Estimated LoC (non-blank, non-comment) | PENDING | 4,070 | 4,597 (+13%) |
| Response files generated | PENDING | 7 | 6 |
| Has CLAUDE.md | PENDING | ❌ | ✅ |
| Has commit hooks | PENDING | ❌ | ✅ (as prose, not files) |
| ADR count | PENDING | 0 | 4 (referenced, not emitted) |
| Has Prisma schema in P1 | PENDING | ❌ | ✅ |

---

## §D Real Test Coverage (Jest + PostgreSQL)

| Metric | Naive | Control | Treatment |
|---|---|---|---|
| Lines % | PENDING | **34.12%** | **27.63%** |
| Statements % | PENDING | 34.11% | 27.85% |
| Functions % | PENDING | 32.05% | 27.77% |
| Branches % | PENDING | 37.50% | 38.63% |
| Tests passing | PENDING | 52 / 186 (28%) | 33 / 33 (100%) |
| Test suites passing | PENDING | 5 / 14 (36%) | 4 / 10 (40%) |
| Coverage gate (80%) | PENDING | ❌ FAIL | ❌ FAIL |
| AI-reported coverage (hallucinated) | — | 94.52% (HALLUCINATED) | 93.1% (HALLUCINATED) |

*Control failure mode: TS error in `articleService.ts:159` + missing `/api/articles/feed` route*
*Treatment failure mode: `JWT_SECRET: string | undefined` not narrowed — blocked 6/10 suites*
*Both models stated 90%+ coverage in documentation. Real coverage: 27–34%.*

---

## §E Mutation Testing (Treatment Project Only)

*Scope: `src/services/**/*.ts`. Tool: Stryker + jest-runner + typescript-checker.*
*Post-experiment quality check. Not part of original experiment design.*

| Run | Tests | MSI | Killed | Survived | NoCoverage |
|---|---|---|---|---|---|
| Baseline (original generated tests) | 33 | **58.62%** | 48 | 23 | 25 |
| After Round 1 (coverage gaps filled) | 63 | **68.97%** | 68 | 32 | 4 |
| After Round 2 (assertion quality fixed) | 73 | **93.10%** | 99 | 8 | 0 |

| File | Final MSI | Survived |
|---|---|---|
| `auth.service.ts` | 100% | 0 |
| `comment.service.ts` | 100% | 0 |
| `profile.service.ts` | 90% | 1 |
| `article.service.ts` | 88.52% | 7 |
| `tag.service.ts` | n/a | 0 |

*The 93.1% coincidence: treatment AI hallucinated "93.1% coverage" in its docs.
Real line coverage was 27.63%. After mutation-driven test improvement, real MSI = 93.10%.
The number was right; it described the wrong thing.*

---

## §F Prediction Accuracy

| Prediction | Direction | Confirmed? |
|---|---|---|
| Verifiable ≈ control | T ≈ C | ✅ Confirmed |
| Composable: T > C | T ≥ +0.5 | ✅ Confirmed |
| LoC similar (≤ 15% delta) | ≤ 15% | ✅ Confirmed (13%) |
| Self-Describing: T > C | T ≥ +1 | ❌ Ceiling effect (both 2/2) |
| Bounded: T > C | T ≥ +0.5 | ❌ Ceiling effect (both 2/2) |
| Defended: T >> C | T = +2 | ❌ Floor effect (both 0/2) |
| Auditable: T >> C | T = +2 | ❌ Partial only (both 1/2) |
| Coverage: T ≥ C | T ≥ C | ❌ C > T (TS error in treatment) |
| Timing: T faster per prompt | T < C | ❌ T was 18.6% slower |

*3/9 predictions confirmed. 4 failures due to ceiling/floor effects from Amendment A control enhancement.*

---

## §G Commits and Run Identifiers

| Artifact | Value |
|---|---|
| Pre-registration commit | `bd2c05b` |
| Control amendment commit | `7661e62` |
| Control run session ID | `650a9f59-5a21-4eda-829a-ca46c5fa83be` |
| Treatment run session ID | `eb7ae491-33fa-4b4c-8b78-e75201ebf46f` |
| Naive run session ID | PENDING |
| Mutation gate added commit | `482a111` |
| Mutation testing done commit | `433ed1d` |
| GS template improvements commit | PENDING |
| Model | claude-sonnet-4-5 |
| Run date | March 13, 2026 |
| Benchmark | RealWorld Conduit API |
