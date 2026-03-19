# Quality Gates System
<!-- Load when: adding new quality gates, understanding gate lifecycle, debugging contribution flow,
     designing new gate categories, or working on close_cycle / refresh_project actions. -->

## Design Principles

- Gates are evidence-backed: every gate must cite a real bug, incident, or near-miss it would have caught
- Gates are tool-agnostic where possible: describe the check as a process, not a command
- Implementation types: logic (no tools) | process (workflow) | tooled (requires packages) | mcp (requires MCP tool) | cli (uses shell commands)
- Priority is community-voted, not submitter-decided
- The folder IS the state: gate lifecycle is visible from filesystem structure alone

## Gate Lifecycle

```
AI discovers gate during cycle
         │
         ▼
.forgecraft/gates/project/active/{id}.yaml   ← status: beta
         │
         │ close_cycle + generalizable: true + evidence present
         ▼
forgecraft-server /contribute/gate           ← API key validated
         │
         ▼
GitHub Issue opened (gate-proposal + quarantine labels)
         │
         │ community votes (👍 reactions)
         ▼
Gate approved → merged to quality-gates registry
         │
         │ next refresh_project for matching-tag projects
         ▼
.forgecraft/gates/registry/{tag}/{id}.yaml   ← status: ready
         │
         │ if supersedes an active project gate (same domain+phase)
         ▼
.forgecraft/gates/project/retired/{id}.yaml  ← deprecatedBy: registry-gate-id
```

## Gate Categories (domain field)

| Domain | Examples |
|---|---|
| security | hardcoded-secrets, sql-injection, owasp-l1 |
| simulation-integrity | engine-sha-provenance, parameter-bounds |
| financial-invariants | pnl-decomposition, position-limits |
| data-lineage | pipeline-metadata, schema-drift |
| api-contract | breaking-change, pagination-required |
| test-quality | mutation-score, zero-test-gate |
| dependency-health | audit-high-crit, license-compliance |
| environment-hygiene | vscode-extension-dedup, docker-container-reuse |
| code-quality | duplicate-detection, orphan-detection |
| state-machine | guard-matrix, transition-coverage |
| concurrency | race-condition-check, deadlock-prevention |

## Gate Priority Levels

| Priority | Meaning | close_cycle behavior |
|---|---|---|
| P0 | Blocking -- fail = no deploy | Blocks close_cycle if gate fires |
| P1 | Warning -- fail = PR comment | Advisory in close_cycle output |
| P2 | Advisory | Informational only |

Community votes on priority separately from inclusion. P0 requires higher vote threshold.

## Risk Assessment Fields

All three are independent assessments, all `low | medium | high`:

- **likelihood**: How often this gate fires on real projects matching its tags
- **impact**: How severe the failure is when it fires
- **confidence**: How reliable the detection is (low = more false positives expected)

These help teams decide which gates to run in time-sensitive contexts (run P0 high-confidence gates first).

## Writing a Good Gate

Required for contribution (will be rejected without these):
1. `evidence`: Real bug, incident, or near-miss. The more specific, the better.
2. `domain`: Choose from the taxonomy above (or propose a new one)
3. `failureMessage`: What the AI/developer sees when the gate fires
4. `fixHint`: One-line actionable fix

Optional but valuable:
- `cwe` / `owasp`: For security gates, link to standards
- `references`: Tool docs, CVEs, blog posts
- `parameters`: Default values that projects can override (e.g. coverage threshold)
- `language`: Scope to specific languages if the check is language-specific
- `paths.exclude`: Exclude test fixtures, migrations, generated files

## Parameters System

Gates can be parameterized for project customization:
```yaml
# In registry gate:
parameters:
  threshold: "80"      # default coverage threshold

# In project forgecraft.yaml (override):
gate_parameters:
  coverage-minimum:
    threshold: "90"    # this project requires 90%
```

## Environment Variables for forgecraft-server

| Variable | Required | Purpose |
|---|---|---|
| GITHUB_TOKEN | YES | Opens GitHub Issues on genspec-dev/quality-gates. Without this, /contribute/gate returns 503. |
| ADMIN_KEY | Recommended | Enables GET /quarantine admin endpoint |
| PORT | No | Defaults to 3000 |

## API Key Format

`fg_[32 alphanumeric characters]` -- e.g. `fg_aB3dEfGhIjKlMnOpQrStUvWxYz123456`

Keys are validated by format only in the current MVP. Future: database validation with tier tracking.
Rate limit: 20 gate submissions per key per calendar month (free tier).
429 response with upgrade link when exceeded.
