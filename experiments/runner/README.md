# Experiment Runner

Standalone scripts that execute the GS vs. Plain-AI experiment via **direct Anthropic API calls**.
No GitHub Copilot, no forgecraft-mcp context, no CLAUDE.md — exactly what each condition specifies.

---

## Setup

```bash
cd experiments/runner
npm install
```

Required:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Optional — override the model (default: `claude-sonnet-4-5`):
```bash
export ANTHROPIC_MODEL=claude-opus-4-5
```

---

## PostgreSQL Setup

Two separate databases are used — one per condition — to prevent any cross-contamination.

### Option A — Docker Compose (local)

```bash
cd experiments/
docker compose up -d

export DATABASE_URL_CONTROL=postgresql://conduit:conduit@localhost:5433/conduit_control
export DATABASE_URL_TREATMENT=postgresql://conduit:conduit@localhost:5434/conduit_treatment
```

### Option B — Rancher / external Kubernetes PostgreSQL

Create two databases on your cluster, then export their connection strings:

```bash
export DATABASE_URL_CONTROL=postgresql://user:pass@rancher-host:5432/conduit_control
export DATABASE_URL_TREATMENT=postgresql://user:pass@rancher-host:5432/conduit_treatment
```

The databases just need to exist and be reachable — `run-tests.ts` runs `prisma migrate reset`
which creates all tables from the schema.

---

## Full Execution Order

### 1. Run the control arm (API calls — ~$2–5)
```bash
npx tsx run-experiment.ts --condition control
```
Model receives: API spec + problem statement + 7 prompts. Nothing else.

### 2. Run the treatment arm (API calls — ~$4–8)
```bash
npx tsx run-experiment.ts --condition treatment
```
Model receives: API spec + problem statement + CLAUDE.md + 4 ADRs + 4 diagrams
+ use-cases + test-arch + nfr + TechSpec + Prisma schema + 6 prompts.

### 3. Materialize generated code into real project directories
```bash
npx tsx materialize.ts --condition control
npx tsx materialize.ts --condition treatment
```
Extracts code blocks from response markdown → `output/project/` with real file structure.
Synthesizes `package.json`, `tsconfig.json`, `jest.setup.ts` if model didn't generate them.

### 4. Run actual tests against PostgreSQL
```bash
npx tsx run-tests.ts --condition control
npx tsx run-tests.ts --condition treatment
```
Runs: `npm install` → `prisma migrate reset` → `jest --coverage`.
Appends real statement/branch/function/line coverage % to `evaluation/metrics.md`.

### 5. Evaluate objective metrics (static grep — no DB needed)
```bash
npx tsx evaluate.ts
```
Counts test blocks, layer violations, error format compliance, artifact presence.
Writes `{condition}/evaluation/metrics.md` (step 4 appends coverage on top).

### 6. Blind auditor (fresh API session per arm)
```bash
npx tsx audit.ts --condition control
npx tsx audit.ts --condition treatment
```
Scores each of the 6 GS properties 0–2 from a session with no knowledge of this experiment.
Writes `{condition}/evaluation/scores.md`.

---

## Shortcuts

```bash
# Materialize + test in one step:
npx tsx run-tests.ts --condition control --materialize

# Check what context each arm sends before spending tokens:
npx tsx run-experiment.ts --condition control --dry-run
npx tsx run-experiment.ts --condition treatment --dry-run

# Resume a run from prompt 3 (uses saved responses for prompts 1+2):
npx tsx run-experiment.ts --condition control --resume 3
```

---

## All Options

| Flag | Applies to | Description |
|---|---|---|
| `--condition control\|treatment` | all | Which experiment arm |
| `--model MODEL` | `run-experiment`, `audit` | Override Claude model |
| `--resume N` | `run-experiment` | Restart from prompt N |
| `--dry-run` | `run-experiment`, `materialize`, `audit` | Inspect without side effects |
| `--materialize` | `run-tests` | Run materialize step first |
| `--skip-migrate` | `run-tests` | Skip `prisma migrate reset` (DB already set up) |

---

## Output Structure

```
experiments/
  docker-compose.yml            ← PostgreSQL (one DB per condition)
  control/
    output/
      01-auth-response.md
      02-profiles-response.md
      ...
      session.log.json          ← full conversation history
      project/                  ← materialized project (after materialize.ts)
        src/
        prisma/
        package.json
        ...
    evaluation/
      metrics.md                ← static metrics + real coverage (appended)
      scores.md                 ← auditor GS scores
  treatment/
    output/  ...
    evaluation/  ...
```

---

## Contamination Controls

- Calls `api.anthropic.com` directly — no VS Code, no Copilot, no project context
- System prompt: `"You are an expert TypeScript developer."` — no SOLID, no layers, no architecture framing
- Control receives zero architectural guidance
- Treatment receives only what was pre-registered in `docs/experiment-design.md §4.4`
- Auditor is a fresh API call with no mention of GS, ForgeCraft, or the experiment
- Zero imports from forgecraft-mcp in any script

---

## Fairness Notes

See `docs/experiment-design.md §6` for the two documented prompt differences
(test timing, Verification Protocol gate). Pre-registered before any implementation ran.

