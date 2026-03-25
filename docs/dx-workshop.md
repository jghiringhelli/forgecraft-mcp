# ForgeCraft DX Workshop Guide

> Hands-on guide for setting up ForgeCraft on your project and contributing
> a quality gate to the community flywheel.

---

## Prerequisites

| Requirement | Check |
|-------------|-------|
| Node.js 18+ installed | `node --version` |
| Git repo initialised | `git status` |
| Your project has at least a `docs/spec.md` or `README.md` with requirements | — |

You do **not** need Claude CLI or an AI client to run ForgeCraft. The CLI works standalone in any terminal. If you have an AI assistant (Claude, Copilot, Cursor), you can optionally add the MCP sentinel for guided setup.

---

## 1. Install ForgeCraft

### Option A — CLI only (works for everyone)

```bash
npx forgecraft-mcp setup .
```

That's it. ForgeCraft scans your project, auto-detects your stack, and generates all instruction files. No config needed.

### Option B — MCP sentinel (Claude CLI)

```bash
claude mcp add forgecraft -- npx -y forgecraft-mcp
```

Then in Claude: `Use forgecraft to run setup_project for .`

Remove the server after setup to reclaim token budget: `claude mcp remove forgecraft`

### Option C — MCP sentinel (GitHub Copilot in VS Code)

Create `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "forgecraft": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "forgecraft-mcp"]
    }
  }
}
```

Open Copilot Chat → switch to **Agent mode** → forgecraft tools appear automatically.

### Option D — MCP sentinel (Cursor)

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "forgecraft": {
      "command": "npx",
      "args": ["-y", "forgecraft-mcp"]
    }
  }
}
```

---

## 2. Run `setup_project`

Point Claude at your project root and run:

```
Use forgecraft to run setup_project for /absolute/path/to/my-project
```

ForgeCraft will:
1. Read your spec / README to infer tags, language, framework, sensitive-data flags
2. Write `forgecraft.yaml` with cascade decisions
3. Scaffold `docs/` stubs: `PRD.md`, `use-cases.md`, `diagrams/c4-context.md`, `adrs/`
4. Generate CLAUDE.md (CNT root) + `.claude/` context tree
5. Emit a `docs/session-prompts/INIT-001.md` with your first work prompt

Expected time: **~60 seconds**.

---

## 3. Follow the Cascade

Run `check_cascade` to see what needs completing:

```
Use forgecraft to run check_cascade for /path/to/my-project
```

Fill in the scaffolded stubs. Then close the first cycle:

```
Use forgecraft to run close_cycle for /path/to/my-project
```

---

## 4. Contribute a Quality Gate

During your work session, ForgeCraft may suggest a gate that isn't in the
registry yet. To submit it to the community flywheel:

```
Use forgecraft to run contribute_gate with:
  project_dir: /path/to/my-project
  gate_id: MY-GATE-001
  gate_title: "Descriptive title"
  check: "What the AI assistant should verify"
  pass_criterion: "Exact binary pass condition"
  tags: ["UNIVERSAL"]
  evidence_file: "path/to/relevant/file.ts"
```

### The 5 Convergence Attributes Checklist

Before submitting, verify your gate satisfies all five criteria. Gates that
fail any check are silently skipped — they will not reach the flywheel.

| # | Attribute | Question to ask | ✓ |
|---|-----------|-----------------|---|
| 1 | **Prescriptive** | Does the gate give a binary pass/fail with no advisory language ("consider", "may", "should")? | ☐ |
| 2 | **Agnostic** | Is the gate model-agnostic and domain-agnostic — OR is it correctly scoped to a specific tag (e.g. `FINTECH`, `HEALTHCARE`)? | ☐ |
| 3 | **Prompt healthy** | Can the `check` and `pass_criterion` be evaluated without reading prose? Are they machine-evaluable? | ☐ |
| 4 | **Deterministic** | Will the same codebase always produce the same result when the gate runs again? No randomness, no time-sensitive logic. | ☐ |
| 5 | **Convergent** | Does this gate close a real spec gap — raises S_realized? Is it a new gate, not a duplicate? | ☐ |

Submit the gate with `convergenceAttributes` all set to `true`:

```
contribute_gate ... convergence_attributes: { prescriptive: true, agnostic: true, prompt_healthy: true, deterministic: true, convergent: true }
```

---

## 5. What Happens After Submission

```
Your machine                ForgeCraft Server              GitHub
     │                            │                           │
     │──POST /contribute-gate────►│                           │
     │                            │──dedup check─────────────►│
     │                            │  (Jaccard ≥60% = dup)     │
     │                            │◄──────────────────────────│
     │◄──201 accepted─────────────│                           │
     │    (or 200 duplicate)      │──create Issue (quarantine)►│
     │                            │   label: gate-proposal    │
     │                            │   label: needs-review     │
```

1. **Exact duplicate** → `status: "duplicate"` response. No issue created.
2. **Similar gate** → `status: "accepted"` with `similarGates[]` warning.
3. **New gate** → GitHub Issue opened in [quality-gates repo](https://github.com/jghiringhelli/quality-gates).
4. Community review: up-vote with 👍, a maintainer merges approved gates.
5. Merged gates appear in the registry within 24 h and are available to everyone via `refresh_project`.

---

## 6. Quick Reference: Commands

| Action | When to run |
|--------|------------|
| `setup_project` | First time on a new project |
| `check_cascade` | Any time — verify cascade docs are present |
| `generate_session_prompt` | Start of every work session |
| `close_cycle` | End of every work session / feature complete |
| `refresh_project` | Pull latest registry gates into your project |
| `audit_project` | Weekly — score GS compliance + CNT health |
| `contribute_gate` | When you've identified a reusable quality gate |
| `start_hardening` | When `close_cycle` reports roadmap complete |

---

## 7. Measuring Progress

After each `close_cycle`, ForgeCraft appends a row to `docs/gs-score.md`:

```
| date       | loop | roadmap_item | s_realized | self-describing | bounded | ... |
|------------|------|--------------|------------|-----------------|---------|-----|
| 2025-06-01 | 1    | -            | 72%        | 2/2             | 1/2     | ... |
| 2025-06-01 | 2    | RM-001       | 85%        | 2/2             | 2/2     | ... |
```

`s_realized` is your convergence metric — watch it climb toward 100% as cycles complete.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `contribute_gate` returns `status: duplicate` | Gate already exists in registry — use `refresh_project` to pull it |
| `check_cascade` fails on `functional_spec` | Fill in `docs/PRD.md` — at minimum a 3-sentence problem statement |
| `setup_project` infers wrong tags | Edit `forgecraft.yaml` tags array and re-run `refresh_project` |
| CNT audit fails line-limit check | Run `cnt_add_node` to split large `.claude/*.md` files |
