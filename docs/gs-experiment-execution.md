# GS vs. Plain AI — RealWorld Experiment: Execution Spec

**Version:** 1.0 — March 2026  
**Status:** Ready to execute  
**Design reference:** `docs/experiment-design.md` (pre-registered March 11, 2026)  
**Benchmark:** RealWorld (Conduit) — https://github.com/realworld-apps/realworld  
**Hypothesis:** A full GS artifact cascade produces structurally superior output to "raw prompts only" on the same implementation task, measured against the six GS properties and objective structural metrics.

This document is the execution protocol. The design and pre-registered predictions are in the design doc. The design does not change. This document tells you how to run it.

---

## Phase 0: Pre-Run Checklist

Complete these before issuing any implementation prompt to either condition.

- [ ] Confirm current ForgeCraft commit hash: `git -C /path/to/forgecraft-mcp rev-parse HEAD` — record in RESULTS.md
- [ ] Confirm treatment artifacts are complete (see §1 below)
- [ ] Confirm control folder has no CLAUDE.md, no ADRs, no ForgeCraft output of any kind
- [ ] Confirm both `control/prompts/` and `treatment/prompts/` contain identical files (diff them: `diff -r experiments/control/prompts/ experiments/treatment/prompts/`)
- [ ] Confirm `output/` directories are empty in both conditions
- [ ] Confirm evaluation `scores.md` and `metrics.md` are blank templates in both conditions
- [ ] Record the model being used for implementation (name + version) in RESULTS.md

If any item fails, do not begin. Resolve the issue and re-check.

---

## Phase 1: Treatment Artifact Verification

The treatment condition requires a complete GS artifact cascade in place before the first implementation prompt. Verify every artifact:

| Artifact | Expected Location | Check |
|---|---|---|
| Architectural constitution | `experiments/treatment/CLAUDE.md` | [ ] Exists and is ForgeCraft-generated (`setup_project` output) |
| ADR-001: Stack selection | `experiments/treatment/docs/adrs/001-stack.md` | [ ] Exists |
| ADR-002: Authentication | `experiments/treatment/docs/adrs/002-auth.md` | [ ] Exists |
| ADR-003: Layered architecture | `experiments/treatment/docs/adrs/003-layers.md` | [ ] Exists |
| ADR-004: Error handling | `experiments/treatment/docs/adrs/004-errors.md` | [ ] Exists |
| C4 Context diagram | `experiments/treatment/docs/diagrams/c4-context.md` | [ ] Exists |
| C4 Container diagram | `experiments/treatment/docs/diagrams/c4-container.md` | [ ] Exists |
| Domain model diagram | `experiments/treatment/docs/diagrams/domain-model.md` | [ ] Exists |
| Sequence diagrams | `experiments/treatment/docs/diagrams/sequences.md` | [ ] Exists |
| Database schema | `experiments/treatment/prisma/schema.prisma` | [ ] Exists |
| Use cases | `experiments/treatment/docs/use-cases.md` | [ ] Exists |
| Test architecture spec | `experiments/treatment/docs/test-architecture.md` | [ ] Exists |
| NFR document | `experiments/treatment/docs/nfr.md` | [ ] Exists |
| Status.md | `experiments/treatment/Status.md` | [ ] Exists |
| Commit hooks | `experiments/treatment/.claude/hooks/` | [ ] Directory exists and contains hook files |
| MCP config | `experiments/treatment/.claude/settings.json` | [ ] Exists |
| Folder structure | `experiments/treatment/src/` | [ ] Exists with scaffolded layout |

If any artifact is missing from the treatment condition, **create it before proceeding**. The treatment design doc (§4 of experiment-design.md) specifies what each artifact must contain.

---

## Phase 2: Running the Control Condition

### 2.1 Session Setup

Open a fresh Claude session (new context window — no prior conversation). Load only:
- `experiments/control/README.md` (the problem statement)
- `experiments/REALWORLD_API_SPEC.md` (the API spec)

Do NOT load:
- Any ForgeCraft output
- CLAUDE.md of any project
- The GS paper
- This experiment document
- Any architecture guidance

The agent's context at session start: the problem statement and the external API spec. Nothing else.

### 2.2 Execution Order

Issue prompts in order. After each prompt, wait for the agent to commit before issuing the next. Do not intervene to correct architecture, suggest patterns, or redirect — the control condition is what the agent produces without any specification guidance.

1. Issue the problem statement (§5.1 of experiment-design.md)
2. Issue `experiments/control/prompts/01-auth.md`
3. Issue `experiments/control/prompts/02-profiles.md`
4. Issue `experiments/control/prompts/03-articles.md`
5. Issue `experiments/control/prompts/04-comments.md`
6. Issue `experiments/control/prompts/05-tags.md`
7. Issue `experiments/control/prompts/06-integration.md`

### 2.3 Output Capture

After the final prompt completes, copy the entire generated codebase into `experiments/control/output/`. Include:
- All source files
- All test files
- `package.json`, `tsconfig.json`
- Anything the agent created

Do NOT copy in:
- `node_modules/`
- `.env` files with real secrets
- The ForgeCraft output that belongs to the treatment condition

### 2.4 Control Completion Marker

Create `experiments/control/evaluation/run-complete.md`:

```markdown
# Control Run Complete

**Date:** YYYY-MM-DD  
**Model:** [model name and version]  
**Session prompts issued:** 6 (problem statement + 5 feature prompts + 1 integration)  
**Implementation committed:** [yes/no]  
**Notes:** [any session anomalies — agent restarts, clarification exchanges, notable deviations]
```

---

## Phase 3: Running the Treatment Condition

### 3.1 Session Setup

Open a fresh Claude session (new context window — separate from the control session, no shared history). Load in this order:

1. `experiments/treatment/CLAUDE.md`
2. `experiments/treatment/docs/adrs/001-stack.md` through `004-errors.md`
3. `experiments/treatment/docs/diagrams/c4-context.md`
4. `experiments/treatment/docs/diagrams/c4-container.md`
5. `experiments/treatment/docs/diagrams/domain-model.md`
6. `experiments/treatment/docs/diagrams/sequences.md`
7. `experiments/treatment/prisma/schema.prisma`
8. `experiments/treatment/docs/use-cases.md`
9. `experiments/treatment/docs/test-architecture.md`
10. `experiments/treatment/Status.md`
11. `experiments/REALWORLD_API_SPEC.md`
12. `experiments/treatment/README.md` (the treatment problem statement)

Context loading order follows the practitioner manual §16 protocol: constitution first, then ADRs, then diagrams, then schema, then behavioral specs, then status, then the external spec, then the task.

### 3.2 Execution Order

Issue prompts in the identical order as the control condition. The prompt files are word-for-word identical — do not modify them.

1. Issue the problem statement (§5.2 of experiment-design.md — the treatment version, which references the artifacts)
2. Issue `experiments/treatment/prompts/01-auth.md`
3. Issue `experiments/treatment/prompts/02-profiles.md`
4. Issue `experiments/treatment/prompts/03-articles.md`
5. Issue `experiments/treatment/prompts/04-comments.md`
6. Issue `experiments/treatment/prompts/05-tags.md`
7. Issue `experiments/treatment/prompts/06-integration.md`

Do not intervene to improve output quality. The treatment's advantage must come from the artifacts, not from in-session coaching.

### 3.3 Output Capture

Copy the generated codebase into `experiments/treatment/output/`. Same rules as the control condition.

### 3.4 Treatment Completion Marker

Create `experiments/treatment/evaluation/run-complete.md` with the same format as the control version.

---

## Phase 4: Objective Metrics Collection

For each condition, compute the following. Record results in `experiments/{condition}/evaluation/metrics.md`.

### 4.1 Test Count

```bash
# From the output/ directory of each condition
find . -name "*.test.ts" -o -name "*.spec.ts" | xargs grep -c "^[[:space:]]*\(it\|test\)(" | awk -F: '{sum+=$2} END {print sum}'
```

Or: `npx jest --listTests | wc -l` (file count); `npx jest --verbose 2>&1 | grep -c "✓"` (individual test count).

Record: number of test files, number of individual test cases.

### 4.2 Test Coverage

```bash
cd experiments/{condition}/output
npm install
npx jest --coverage --coverageReporters=text-summary 2>&1 | tail -20
```

Record: lines %, statements %, branches %, functions %.

### 4.3 Layer Violations

Count direct Prisma calls in route handler files (control will not have a service layer by definition; treatment should have none):

```bash
# Prisma imports in route files
grep -rn "from '@prisma/client'\|prisma\." experiments/{condition}/output/src/routes/ | wc -l
grep -rn "from '@prisma/client'\|prisma\." experiments/{condition}/output/src/controllers/ | wc -l
```

Record: count of direct DB calls from route/controller layer.

### 4.4 API Spec Conformance

If the RealWorld API test suite is available (https://github.com/realworld-apps/realworld):

```bash
# Start the application
cd experiments/{condition}/output
npm run dev &

# Run spec conformance tests
cd ../../..
npx newman run realworld-api-spec-tests.json --env-var "APIURL=http://localhost:3000/api" 2>&1 | tail -30
```

Record: passing / failing / total endpoint tests.

If the automated suite is not available, manually verify each endpoint category: auth, profiles, articles, comments, tags. Record as a binary: each endpoint either conforms or does not.

### 4.5 Naming Signal

Sample 10 random function names from the production source (not test files) of each condition:

```bash
grep -rn "function \|=> {" experiments/{condition}/output/src/ | grep -v test | shuf -n 10
```

Score each name 0–2:
- 0 = Generic (`processData`, `handleRequest`, `doAction`)
- 1 = Partially specific (`getUserData`, `handleArticle`)
- 2 = Domain-precise (`findArticleBySlug`, `validateJwtAndExtractUser`, `buildFeedQuery`)

Record: total naming signal score out of 20, with the 10 sampled names.

### 4.6 Commit Quality

```bash
git -C experiments/{condition}/output log --oneline 2>/dev/null | head -20
```

Score: 1 if all commits use conventional format (`feat:`, `fix:`, `refactor:`, etc.). 0 if not.

Record: commit count, commit quality score (0/1).

### 4.7 Structural Artifacts Count

Count: ADR files, diagram files, CLAUDE.md presence (boolean), test architecture doc presence (boolean).

For the control: all expected to be zero/absent. For the treatment: all expected to be present.

---

## Phase 5: Auditor Assessment

The auditor scores each output against the six GS properties. This is a **blind** assessment: the auditor does not know which condition produced which output.

### 5.1 Auditor Session Setup

Fresh context window. No prior conversation. Load:

```
You are a software architecture auditor. Your task is to evaluate the following codebase against six structural properties. Score each property 0–2 using the rubric provided. Cite specific evidence for each score.

You are not to know that this is part of an experiment. Evaluate what you see.

--- SCORING RUBRIC ---

Score each property 0–2:
0 = Absent or architecturally violated
1 = Partially present (some evidence, but incomplete)
2 = Structurally present and enforced

Properties and evidence criteria:

SELF-DESCRIBING (2): A CLAUDE.md or equivalent exists, covers architecture + conventions + naming. A stateless reader can determine what the system is from artifacts alone.

BOUNDED (2): Route handlers delegate to services; services delegate to repositories; no cross-layer imports visible. Function length ≤ 50 lines across sampled files.

VERIFIABLE (2): Tests are present, organized by concern, written against interfaces not implementations. Test names are behavioral specifications. Coverage threshold is ≥ 80%.

DEFENDED (2): Commit hooks are present and configured. A lint/format gate is present. Pre-commit enforcement is visible in configuration files.

AUDITABLE (2): Conventional commits are present in git history. ADRs exist. A Status.md or equivalent decision log exists. Decision history is recoverable from artifacts alone.

COMPOSABLE (2): Services depend on interfaces or abstractions. No direct database calls from route layer. Repository pattern is visible. No implicit global service state.

--- CODEBASE TO EVALUATE ---
[Paste output directory file listing + key source files]
```

### 5.2 Files to Provide the Auditor

Provide the auditor with:
1. Full directory listing of `output/`
2. Contents of: `src/routes/` (or `src/controllers/`), `src/services/`, `src/repositories/` (if present)
3. At least one complete service file and one complete route handler file
4. `package.json` (for hook configuration visibility)
5. `.husky/` or `.claude/hooks/` contents (or their absence)
6. `docs/` directory listing (to show ADR / diagram presence or absence)
7. Three representative test files
8. Git log (first 15 commits): `git log --oneline`

Do not provide the REALWORLD_API_SPEC.md, the experiment design document, or anything that would reveal which condition is being evaluated.

### 5.3 Output Format

Ask the auditor to produce:

```markdown
# Audit Results

## Self-Describing: [0/1/2]
Evidence: [specific file or observation]

## Bounded: [0/1/2]
Evidence: [specific file or observation]

## Verifiable: [0/1/2]
Evidence: [specific file or observation]

## Defended: [0/1/2]
Evidence: [specific file or observation]

## Auditable: [0/1/2]
Evidence: [specific file or observation]

## Composable: [0/1/2]
Evidence: [specific file or observation]

## Total: [sum]/12

## Overall structural assessment (2–3 sentences):
```

### 5.4 Running Both Auditor Sessions

Run the control audit first. Record scores in `experiments/control/evaluation/scores.md`.
Run the treatment audit in a separate fresh context window. Record scores in `experiments/treatment/evaluation/scores.md`.

Use the identical auditor prompt for both. Do not modify the prompt between sessions.

---

## Phase 6: Results Population

After both conditions are scored and metrics are collected, populate `experiments/RESULTS.md`:

1. Fill in the Summary Table (GS property scores + objective metrics for both conditions)
2. Fill in the Pre-registered Predictions vs. Actual table (§7.3 of experiment-design.md vs. observed)
3. Write a 3–5 paragraph narrative:
   - What the scores showed
   - Whether the pre-registered predictions were confirmed
   - What the falsification condition (§7.3 of design doc) shows — was it met or not?
   - Honest account of any anomalies (model restarts, clarification exchanges, surprising outputs)
4. Add a section: **"What This Changes in ForgeCraft"**
   - If treatment outperforms control on Defended and Auditable: confirms that hook chain and commit discipline are meaningful signals — maintain as P1 features
   - If treatment and control score similarly on Bounded: investigate whether CLAUDE.md layer rules are being read and enforced by the model
   - If control produces test coverage comparable to treatment: review whether the treatment's test architecture spec and coverage gate are contributing, or whether the prompts alone drive it
   - If any prediction fails: record honestly; update `docs/gs-tooling-crosscheck.md` backlog accordingly

---

## Phase 7: Post-Results Actions

### 7.1 ForgeCraft Updates

If the cross-check findings in `docs/gs-tooling-crosscheck.md` are confirmed by experiment results (e.g., Auditable and Defended scores are high in treatment, confirming hooks and ADRs matter), advance P1 backlog items.

If results suggest unexpected gaps (e.g., Bounded score in treatment is not higher than control despite CLAUDE.md layer rules), open an issue, diagnose, and address in the next ForgeCraft session.

### 7.2 White Paper Update

The white paper (§7.7.B) proposed this experiment precisely. Results go into §7.7.B as first execution evidence. If the falsification condition is met (Treatment and Control score identically on Self-describing and Defended), update §7.7.B to report that result honestly. If the predictions hold, update §7.7.B to report confirmed first-execution results and note what the next replication should address.

Add a brief note in §7.7 (Threats to Validity) on the single-agent limitation: this corroborates or challenges the no-control-condition threat, but does not close the single-practitioner replication gap.

### 7.3 Publication

Commit the filled RESULTS.md as: `feat(experiments): run GS vs plain-AI experiment, add results`

Write a technical post for the ForgeCraft blog / README using the before/after structure:
- Control: no CLAUDE.md, no hooks, raw prompts → scores / layer violations / coverage
- Treatment: full GS cascade → scores / layer violations / coverage
- Delta: the structural difference, with specific evidence

This is the empirical demonstration the ForgeCraft community needs. A real controlled comparison, pre-registered before the implementation, executed on a well-known benchmark.

---

## Appendix: Quick-Reference Execution Order

```
1. Pre-run checklist (Phase 0)
2. Verify treatment artifacts (Phase 1)
3. Control run: fresh session, problem statement, 6 prompts (Phase 2)
4. Record control run-complete.md
5. Treatment run: fresh session, load all artifacts, problem statement, same 6 prompts (Phase 3)
6. Record treatment run-complete.md
7. Collect objective metrics for both conditions (Phase 4)
8. Auditor session — control (Phase 5.1–5.4)
9. Auditor session — treatment (fresh context, same prompt)
10. Populate RESULTS.md (Phase 6)
11. Commit results
12. Post-results actions: ForgeCraft backlog, white paper §7.7.B update (Phase 7)
```

**Total estimated active engagement:** 3–5 hours (implementation sessions are agent-driven; active time is setup, prompt issuance, output capture, and auditor sessions).

**The hardest constraint:** Keep the auditor blind. Never tell the auditor which condition produced which output. The blind assessment is what makes the scores meaningful.
