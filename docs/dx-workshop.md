# ForgeCraft DX Workshop Guide

> Hands-on guide for setting up ForgeCraft on your project and contributing
> a quality gate to the community flywheel.

---

## Prerequisites

| Requirement | Check |
|-------------|-------|
| Claude CLI (`claude`) installed | `claude --version` |
| ForgeCraft MCP server configured in `.mcp.json` | see §1 |
| Your project has at least a `docs/spec.md` or `README.md` with requirements | — |
| Git repo initialised | `git status` |

---

## 1. Install ForgeCraft MCP

Add to your project's `.mcp.json` (create if absent):

```json
{
  "mcpServers": {
    "forgecraft": {
      "command": "npx",
      "args": ["-y", "forgecraft-mcp@latest"],
      "env": {}
    }
  }
}
```

Verify it loads:
```bash
claude mcp list   # should show "forgecraft"
```

---

## 2. Configure the Workshop Server

Your `forgecraft.yaml` (created by `setup_project`) needs two fields:

```yaml
server_url: https://forgecraft-server-production.up.railway.app
contribute_gates: attributed   # gates submitted with your GitHub username
github_user: <your-github-handle>
```

Set your workshop API key as an environment variable:

```bash
export FORGECRAFT_API_KEY=fg_ws_<key-provided-at-workshop>
```

---

## 3. Run `setup_project`

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

## 4. Follow the Cascade

Run `check_cascade` to see what needs completing:

```
Use forgecraft to run check_cascade for /path/to/my-project
```

Fill in the scaffolded stubs. Then close the first cycle:

```
Use forgecraft to run close_cycle for /path/to/my-project
```

---

## 5. Contribute a Quality Gate

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

## 6. What Happens After Submission

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

## 7. Quick Reference: MCP Actions

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

## 8. Measuring Progress

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
| API key errors | Ensure `FORGECRAFT_API_KEY=fg_ws_...` is exported in current shell |
| CNT audit fails line-limit check | Run `cnt_add_node` to split large `.claude/*.md` files |
