# GS Controlled Experiment — Results

**Benchmark:** RealWorld (Conduit) backend API  
**Model:** claude-sonnet-4-5  
**Run date:** March 13, 2026  
**Pre-registration:** commit `bd2c05b` (design), `7661e62` (control prompt amendment)

---

## §1 GS Property Scores (Blind Adversarial Audit)

*Scored by a separate Claude session with no knowledge of the experiment or GS methodology.
Source: `{condition}/evaluation/scores.md`. Scale: 0 = absent, 1 = partial, 2 = fully present.*

| Property | Control | Treatment | Delta | Winner |
|---|---|---|---|---|
| **1. Self-Describing** | | | | |
| **2. Bounded** | | | | |
| **3. Verifiable** | | | | |
| **4. Defended** | | | | |
| **5. Auditable** | | | | |
| **6. Composable** | | | | |
| **Total (0–12)** | | | | |

### Score Evidence Summary (fill from scores.md)

**Control highest dimension:** 
**Control lowest dimension:** 
**Treatment highest dimension:** 
**Treatment lowest dimension:** 

---

## §2 Objective Metrics (Automated — evaluate.ts)

*Source: `{condition}/evaluation/metrics.md`.*

| Metric | Control | Treatment | Delta | Note |
|---|---|---|---|---|
| `it`/`test` call count (inline, static) | | | | Extracted from code blocks |
| `describe` blocks | | | | |
| Layer violations (prisma.* in route files) | | | | 0 = perfect |
| Error format compliance (of N sampled) | | | | `{"errors":{"body":[...]}}` |
| Estimated LoC (non-blank, non-comment) | | | | Raw code volume |
| Response files generated | | | | 6 (treatment) / 7 (control) |
| Has CLAUDE.md in output | | | | Expected: C=❌ T=✅ |
| Has commit hooks | | | | Expected: C=❌ T=✅ |
| ADR count | | | | Expected: C=0 T=4 |
| Has Prisma schema (pre-defined) | | | | Expected: C=❌ T=✅ |

---

## §3 Execution Timing

*Recorded from session.log.json — time per prompt (seconds).*

| Prompt | Control (s) | Treatment (s) | Delta | Note |
|---|---|---|---|---|
| 00 context-ack | | | | Initial context load |
| 01 auth | | | | Largest prompt (project setup) |
| 02 profiles | | | | |
| 03 articles | | | | Most complex feature |
| 04 comments | | | | |
| 05 tags | | | | Simplest feature |
| 06 integration | | | | |
| 07 tests (control only) | N/A | — | — | Control only |
| **Total** | | | | |

*Timing hypothesis: Treatment should be faster on feature prompts because GS artifacts pre-resolve architectural decisions. Control may be slower because the model must make and re-justify the same decisions each turn.*

---

## §4 Coverage (Real Tests — materialize + run-tests.ts)

*Source: Jest coverage report from `{condition}/output/project/`.*

| Metric | Control | Treatment | Delta |
|---|---|---|---|
| Lines % | | | |
| Statements % | | | |
| Functions % | | | |
| Branches % | | | |
| Test files | | | |
| Test suites passing | | | |
| Test suites failing | | | |

---

## §5 API Spec Conformance

*Source: RealWorld Postman collection run or HTTP smoke tests against materialized project.*

| Suite | Control Passed | Control Failed | Treatment Passed | Treatment Failed |
|---|---|---|---|---|
| Auth (POST /api/users, POST /api/users/login, GET /api/user, PUT /api/user) | | | | |
| Profiles (GET, follow, unfollow) | | | | |
| Articles (list, feed, get, create, update, delete, favorite) | | | | |
| Comments (list, add, delete) | | | | |
| Tags (GET /api/tags) | | | | |
| **Total** | | | | |

---

## §6 Qualitative Code Analysis (Manual Review)

*After reading output code from both conditions.*

### Naming Signal (0-10 sample)
*Pick 10 identifiers from each condition's service layer. Score = domain terms used (User, Article, Comment, Profile, Tag, slug, feed, favorite, follow) / 10.*

| | Control | Treatment |
|---|---|---|
| Naming signal score (0–10) | | |
| Sample identifiers reviewed | | |

### Error Handling Patterns
| Pattern | Control observed | Treatment observed |
|---|---|---|
| Custom error classes (not bare Error) | | |
| Error middleware at express level | | |
| Domain errors never carry HTTP codes | | |

### Architectural Patterns
| Pattern | Control observed | Treatment observed |
|---|---|---|
| Repository/service separation | | |
| Dependency injection (not `new Prisma()` in service) | | |
| Interface-based typing | | |
| Zod/validation at route boundary | | |

---

## §7 Pre-registered Predictions vs. Actual

*Pre-registered in `docs/experiment-design.md` §7.3, before any run.*
*Note: Prediction basis revised by Amendment A (expert-prompt control) — see design doc.*

| Prediction | Predicted direction | Observed delta | Confirmed? |
|---|---|---|---|
| Self-describing: Treatment > Control | T ≥ +1 | | |
| Bounded: Treatment > Control | T ≥ +0.5 | | |
| Verifiable: Similar (both prompted for tests) | T ≈ C | | |
| Defended: Treatment >> Control | T = +2 (pre-commit hooks) | | |
| Auditable: Treatment >> Control | T = +2 (ADRs, Status.md) | | |
| Composable: Treatment > Control | T ≥ +0.5 | | |
| Layer violations: Treatment < Control | T ≪ C | | |
| Coverage: Treatment ≥ Control | T ≥ C | | |
| Total LoC: Similar | ≤ 15% difference | | |
| Timing: Treatment faster on feature prompts | T < C per prompt | | |

---

## §8 Key Findings for White Paper

*Written after results observed. Summary for §7 of the paper.*

### Primary Finding


### On Defended and Auditable (expected GS advantage)


### On Bounded (layer discipline — indirect GS effect)


### On Verifiable (testing — partially controlled in both conditions)


### On Composable (dependency injection / interfaces)


### On Timing (decision cost reduction)


### Surprising results (if any)


---

## §9 Falsification Check

*Per pre-registered protocol: the hypothesis is FALSIFIED if Treatment ≤ Control on Self-describing AND Defended simultaneously.*

| Condition | Self-describing | Defended | Falsified? |
|---|---|---|---|
| Falsification trigger | T ≤ C | T ≤ C | Yes if both |
| Observed | | | |

**Falsification outcome:** *(fill after results)*

---

## §10 Limitations

- Single model (claude-sonnet-4-5), single run — not replicated
- Same model generates both conditions (no model independence)
- Amateur A environment (authors of GS designed the treatment artifacts) — selection bias possible
- Control prompt enhancement (Amendment A) narrows expected delta on Bounded and Verifiable vs. original design
- Timing measurements include Claude API server latency, not just reasoning time
- LoC estimated from code blocks in markdown, not compiled project

---

## §11 Run Notes

### Control
- Session ID: *(from session.log.json)*
- Completed: 
- Any errors/interruptions: none

### Treatment
- Session ID: *(from session.log.json)*
- Completed: 
- Any errors/interruptions: none
