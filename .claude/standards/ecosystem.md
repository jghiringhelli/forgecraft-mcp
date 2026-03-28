# ForgeCraft Ecosystem
<!-- Load when: working on cross-repo features, understanding data flow, debugging the flywheel,
     or setting up a new environment. Not needed for routine forgecraft-mcp feature work. -->

## Repos at a Glance

| Repo | Purpose | URL |
|---|---|---|
| **forgecraft-mcp** | MCP tool -- scaffolds projects, drives GS methodology, cascade enforcement | github.com/jghiringhelli/forgecraft-mcp |
| **forgecraft-server** | HTTP backend -- API key validation, gate quarantine, GitHub Issues integration | github.com/jghiringhelli/forgecraft-server |
| **quality-gates** | Community registry -- YAML gate files, index.json, GitHub Actions for graduation | github.com/jghiringhelli/quality-gates |
| **genspec-portal** | Public portal -- taxonomy browser, flywheel explainer | github.com/jghiringhelli/genspec-portal |

## Live URLs

| Service | URL |
|---|---|
| forgecraft-server health | https://forgecraft-server-production.up.railway.app/health |
| forgecraft-server gates | https://forgecraft-server-production.up.railway.app/gates |
| forgecraft-server quarantine (admin) | https://forgecraft-server-production.up.railway.app/quarantine |
| quality-gates index | https://raw.githubusercontent.com/jghiringhelli/quality-gates/main/index.json |
| genspec-portal | https://jghiringhelli.github.io/genspec-portal/ |

## The Flywheel Cycle

1. **`setup_project`** — spec ingested, tags derived, cascade decisions made, artifacts scaffolded, hooks installed
2. **`check_cascade`** — 5-step cascade enforced; FAIL/STUB blocks session prompt until resolved
3. **`generate_session_prompt`** — cascade gate → implementation plan; includes Execution Loop and test command
4. **Execution loop** — TDD: write failing test → implement → run tests → loop until green; Playwright/simulations as applicable
5. **`close_cycle`** (NEW) — cascade re-check, gate assessment, `contribute_gate` call for generalizable gates, promotes gates to `promoted/` folder, detects CodeSeeker gates to run
6. **`contribute_gate`** — API key validated → forgecraft-server → GitHub Issue opened on `jghiringhelli/quality-gates` with `gate-proposal` + `quarantine` labels → community votes
7. **Approved gate** — merged to registry YAML → `refresh_project` pulls it for next project setup

## Data Flow Diagram

```
user project
  └─ forgecraft-mcp (runs locally)
       │
       ├─ refresh_project ──► pulls gates_registry_url for project tags
       │                       writes to .forgecraft/gates/registry/{tag}/
       │                       retires superseded active gates
       │
       ├─ check_cascade ──────► reads .forgecraft/gates/project/active/
       │                        reads .forgecraft/gates/registry/{tag}/
       │
       └─ close_cycle ────────► assesses active gates → contribute_gate()
                                      │
                                      ▼
                          forgecraft-server (Railway)
                          POST /contribute/gate
                          X-Forgecraft-Key: fg_[32]
                          GITHUB_TOKEN required
                                      │
                                      ▼
                          GitHub Issue on jghiringhelli/quality-gates
                          labels: gate-proposal + quarantine
                                      │
                          community votes (👍 reactions)
                                      │
                                      ▼
                          Gate approved → merged to registry YAML
                                      │
                          next refresh_project for matching-tag projects
                                      │
                                      ▼
                          .forgecraft/gates/registry/{tag}/{id}.yaml

genspec-portal (GitHub Pages)
  ├─ taxonomy.json (committed, updated via npm run export:taxonomy)
  └─ index.json ← fetched live from quality-gates on page load
```

## Gate Folder Structure

```
.forgecraft/
  gates/
    registry/        # read-only, pulled from public registry on setup/refresh
      {tag}/         # one subfolder per project tag (universal/, api/, fintech/, etc.)
        {id}.yaml    # one file per gate
    project/
      active/        # project gates being enforced (AI writes here)
      promoted/      # submitted to community registry
      retired/       # superseded by registry gate (has deprecatedBy field)
  exceptions.json
  contributions.json
  pending-contributions.json
```

Old `.forgecraft/project-gates.yaml` (flat file) is still supported — auto-migrated to `project/active/` on first read.

## forgecraft-server

**Location**: `C:\workspace\forgecraft-server\`
**Deploy**: Railway — `cd C:\workspace\forgecraft-server && railway up --detach`

**Env vars** (set in Railway dashboard or via `railway variables set`):

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | **YES** | Opens GitHub Issues on `jghiringhelli/quality-gates`. Without this, `POST /contribute/gate` returns 503. |
| `ADMIN_KEY` | Recommended | Enables `GET /quarantine` admin endpoint |
| `PORT` | No | Defaults to 3000 |

**Routes**:
- `GET  /health` — status, version, timestamp, quarantineCount
- `POST /contribute/gate` — requires `X-Forgecraft-Key: fg_[32]` header; Zod-validated; opens GitHub Issue; rate limit 20/month per key; returns `issueUrl`
- `GET  /gates` — proxies quality-gates `index.json`
- `GET  /taxonomy` — serves `taxonomy.json` for portal
- `GET  /quarantine` — admin only (`X-Admin-Key` header); lists open quarantine issues from GitHub API

**Auth behavior**:
- Missing/invalid `X-Forgecraft-Key` → 401
- Rate limit exceeded (>20/month) → 429 with upgrade link
- Missing `GITHUB_TOKEN` on server → 503

## Quality Gates Registry

**Location**: `C:\workspace\genspec-dev-quality-gates\`

**Structure**:
```
gates/
  universal/          ← applies to all projects
  api/                ← API projects
  fintech/            ← financial/DeFi projects
  environment-hygiene/← workspace hygiene gates
  code-quality/       ← code duplication, orphan detection
  security/           ← OWASP, secrets, injection
  ... (one folder per domain/tag)
index.json            ← generated by scripts/build-index.js, committed on every change
GATE_SCHEMA.md        ← schema reference for writing new gates
```

**Current count**: 22 gates total

**Recent additions (Session 28)**:
- `environment-hygiene/vscode-extension-deduplication.yaml`
- `environment-hygiene/package-manager-check-before-install.yaml`
- `environment-hygiene/docker-container-reuse.yaml`
- `environment-hygiene/codeseeker-semantic-search-before-grep.yaml`
- `code-quality/codeseeker-duplicate-detection.yaml`
- `code-quality/codeseeker-orphan-detection.yaml`

**Adding a gate**:
1. Create `gates/<domain>/<id>.yaml` following GATE_SCHEMA.md
2. Run `node scripts/build-index.js` to regenerate `index.json`
3. Commit and push — portal updates automatically on next page load
4. For community submissions: use `forgecraft contribute_gate` action

## Gate Schema (ProjectGate)

### Identity
| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique kebab-case identifier |
| `title` | string | ✅ | Human-readable name |
| `description` | string | ✅ | What the gate checks and why |

### Classification
| Field | Type | Required | Description |
|---|---|---|---|
| `domain` | string | ✅ | Gate category (security, api-contract, environment-hygiene, code-quality, etc.) |
| `status` | `beta\|ready\|deprecated` | ✅ | Gate maturity |
| `source` | `registry\|project` | ✅ | Origin of the gate |
| `implementation` | `logic\|process\|tooled\|mcp\|cli` | ✅ | How the gate is executed |
| `os` | `windows\|unix\|cross-platform` | ✅ | OS compatibility |
| `priority` | `P0\|P1\|P2` | No | Enforcement severity (community-voted) |

### Execution
| Field | Type | Required | Description |
|---|---|---|---|
| `check` | string | ✅ | The check to perform |
| `passCriterion` | string | ✅ | What constitutes a pass |
| `failureMessage` | string | No | Message shown to AI/developer when gate fires |
| `fixHint` | string | No | One-line actionable fix |
| `tools` | ToolRequirement[] | No | Tools required to run this gate |
| `parameters` | Record<string, string> | No | Default parameter values; projects can override |

### Scope
| Field | Type | Required | Description |
|---|---|---|---|
| `tags` | string[] | No | Project tags this gate applies to |
| `paths.include` | string[] | No | Glob patterns to include |
| `paths.exclude` | string[] | No | Glob patterns to exclude (e.g. test fixtures) |
| `phase` | string | No | GS lifecycle phase |
| `hook` | string | No | Pre-commit hook attachment point |
| `minVersion` | string | No | Minimum forgecraft-mcp version required |
| `maxVersion` | string | No | Maximum forgecraft-mcp version supported |

### Risk Assessment
| Field | Type | Required | Description |
|---|---|---|---|
| `likelihood` | `low\|medium\|high` | No | How often gate fires on real projects |
| `impact` | `low\|medium\|high` | No | Severity when gate fires |
| `confidence` | `low\|medium\|high` | No | Detection reliability (low = more false positives) |

### Standards References
| Field | Type | Required | Description |
|---|---|---|---|
| `cwe` | string | No | CWE identifier (e.g. `CWE-798`) |
| `owasp` | string | No | OWASP reference (e.g. `A02:2021`) |
| `references` | string[] | No | URLs: tool docs, CVEs, blog posts |

### Lifecycle
| Field | Type | Required | Description |
|---|---|---|---|
| `addedAt` | string (ISO date) | ✅ | When gate was created |
| `deprecatedBy` | string | No | ID of registry gate that supersedes this one |

### Provenance
| Field | Type | Required | Description |
|---|---|---|---|
| `generalizable` | boolean | No | Whether gate is a candidate for community submission |
| `evidence` | string | No | Real bug/incident this gate would have caught |
| `gsProperty` | string | No | GS property this gate enforces |
| `contributor` | string | No | GitHub handle (attributed mode only) |
| `approvedAt` | string | No | ISO date when graduated to registry |

## ToolRequirement Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Tool name (e.g. `codeseeker`, `docker`) |
| `version` | string | No | Minimum required version |
| `installHint` | string | No | How to install if missing |
| `optional` | boolean | No | If true, gate degrades gracefully when tool is absent |

## Contribution Flow

**Configuration** in project's `forgecraft.yaml`:
```yaml
contribute_gates: false        # default — nothing sent
contribute_gates: anonymous    # gate sent, no attribution
contribute_gates: attributed   # gate + GitHub handle, earns Pro credit on approval
```

**Submission requirements**: gate must have `generalizable: true` and `evidence` field present.
Already-submitted gates tracked in `.forgecraft/contributions.json` (prevents duplicates).
Pending (pre-retry) gates tracked in `.forgecraft/pending-contributions.json`.

**What happens on submission**:
1. forgecraft-mcp sends gate to `POST /contribute/gate` with `X-Forgecraft-Key` header
2. forgecraft-server validates API key (format + rate limit)
3. forgecraft-server opens GitHub Issue on `jghiringhelli/quality-gates` with labels `gate-proposal` + `quarantine`
4. Response includes `issueUrl` pointing to the created issue
5. Community votes via 👍 reactions; maintainers review
6. Approved gate merged to `gates/<domain>/<id>.yaml` via PR; GitHub Action updates `index.json`
7. Next `refresh_project` on any project with matching tags pulls the gate to `registry/<tag>/`

**API key format**: `fg_[32 alphanumeric]` — e.g. `fg_aB3dEfGhIjKlMnOpQrStUvWxYz123456`
**Rate limit**: 20 gate submissions per key per calendar month (free tier). 429 on excess.

## forgecraft.yaml Key Fields

```yaml
gates_registry_url: https://raw.githubusercontent.com/jghiringhelli/quality-gates/main/index.json
server_url: https://forgecraft-server-production.up.railway.app
contribute_gates: false   # false | anonymous | attributed
github_user: ""           # required for attributed mode
tools:
  test: npm test
  mutation: npx stryker run stryker.sentinel.json
  audit: npm audit --audit-level=high
cascade:
  steps:
    - id: check-tests
      ...
```

## Exceptions Mechanism

**File**: `.forgecraft/exceptions.json`
**Purpose**: Register false positives in pre-commit hooks so they are never re-discovered.
**Schema**: `{ version, exceptions: [{ id, hook, pattern, reason, addedAt, addedBy, adr? }] }`

Current exceptions:
- `hooks-yaml-token-pattern`: `templates/universal/hooks.yaml` triggers secrets scanner
  because it contains regex *patterns* for detecting tokens, not actual tokens.

## Portal Updates

The portal has two data sources:
1. **`taxonomy.json`** (committed in portal repo) — instruction blocks, hooks, archetypes.
   Update by running `npm run export:taxonomy` in forgecraft-mcp and committing to genspec-portal.
2. **quality-gates `index.json`** (fetched live) — community gates. Auto-updates on page load.
   No portal deploy needed when gates are added.

## Branch / Release Strategy

- **`main`** — production. Merged from `docs/gs-specs` on 2026-03-19 (1.0).
- Feature branches off `main`. Merge via `--no-ff` PR.
- Tag releases: `git tag v1.0.0 && git push origin v1.0.0`
- npm publish: `npm run build && npm publish --access public`
