# Experiment Runner

Standalone scripts that execute the GS vs. Plain-AI experiment via **direct Anthropic API calls**.
No GitHub Copilot, no forgecraft-mcp context, no CLAUDE.md — exactly what each condition specifies.

---

## Setup

```bash
cd experiments/runner
npm install
```

Set your API key:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Optional — override the model (default: `claude-sonnet-4-5`):
```bash
export ANTHROPIC_MODEL=claude-opus-4-5
```

---

## Execution Order

### 1. Run the control arm
```bash
npx tsx run-experiment.ts --condition control
```
The model receives:
- `REALWORLD_API_SPEC.md`
- `control/README.md`
- 7 implementation prompts (features built first, tests deferred to prompt 07)
- Nothing else.

### 2. Run the treatment arm
```bash
npx tsx run-experiment.ts --condition treatment
```
The model receives:
- `REALWORLD_API_SPEC.md`
- `treatment/README.md` + `treatment/CLAUDE.md`
- All 4 ADRs, 4 diagrams, use-cases, test-arch, nfr, TechSpec, Prisma schema
- 6 implementation prompts (inline tests per feature + Verification Protocol gate)
- Nothing else.

### 3. Evaluate objective metrics (both conditions)
```bash
npx tsx evaluate.ts
```
Writes `{condition}/evaluation/metrics.md` for each arm.

### 4. Run the blind auditor (both conditions)
```bash
npx tsx audit.ts --condition control
npx tsx audit.ts --condition treatment
```
Sends each arm's output to Claude in a **fresh API session** with no knowledge of the experiment.
Scores each of the 6 GS properties 0–2. Writes `{condition}/evaluation/scores.md`.

---

## Options

| Flag | Description |
|---|---|
| `--condition control\|treatment` | Which arm to run |
| `--model MODEL` | Override model (also `$ANTHROPIC_MODEL`) |
| `--resume N` | Resume from prompt N (uses saved responses for prior turns) |
| `--dry-run` | Print context + prompts without calling the API |

---

## Output Structure

```
experiments/
  control/
    output/
      01-auth-response.md
      02-profiles-response.md
      ...
      session.log.json      ← full conversation history
    evaluation/
      metrics.md            ← objective metrics (by evaluate.ts)
      scores.md             ← auditor GS scores (by audit.ts)
  treatment/
    output/  ...
    evaluation/  ...
```

---

## Contamination Controls

- Scripts call `https://api.anthropic.com` directly — no VS Code, no Copilot, no project context
- System prompt is generic: "You are an expert TypeScript developer"
- Control receives zero architectural guidance — no SOLID, no layers, no CLAUDE.md
- Treatment receives only what was pre-registered in `docs/experiment-design.md §4.4`
- Auditor sessions are fresh API calls — no shared state with the implementation sessions
- Each script has no imports from forgecraft-mcp whatsoever

---

## Fairness Notes

See `docs/experiment-design.md §6` for the documented prompt differences between conditions
(test timing, Verification Protocol gate). These are pre-registered intentional differences,
not post-hoc adjustments.
