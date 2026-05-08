# ForgeCraft Workflow Playbook

> Copy-paste prompts for every situation. After `npx forgecraft-mcp setup`, your AI has the context. These prompts direct the work.

---

## Quick Reference

| Situation | Start here |
|---|---|
| New project, blank slate | [Greenfield Setup](#greenfield-setup) |
| Existing project, first time with ForgeCraft | [Brownfield Integration](#brownfield-integration) |
| Want session-start advice automatically | [Session Advisor Setup](#session-advisor-setup) |
| Lock main/develop — require PR + CI to merge | [GitHub Branch Protection](#github-branch-protection) |
| Audit returned failures | [Remediation by Failure Type](#remediation-by-failure-type) |
| Getting ready to ship | [Pre-Release Hardening](#pre-release-hardening) |
| Just shipped, what now | [Post-Deployment](#post-deployment) |
| Project scope changed significantly | [Drift Detection](#drift-detection) |
| Mobile app (React Native) setup | [Mobile / React Native Setup](#mobile--react-native-setup) |
| Publishing an npm package | [npm Package Publishing](#npm-package-publishing) |
| Monorepo with multiple packages | [Monorepo Setup](#monorepo-setup) |

---

## Session Advisor Setup

Get proactive advice from your AI assistant at the start of every session — no prompting required.

**Any MCP-capable agent (Cursor, Cline, Windsurf, Copilot, Aider):**

Add one line to your rules file (CLAUDE.md / .clinerules / .windsurfrules / etc.):

```
At the start of every session, call forgecraft_actions { action: "advise_session", project_dir: "<absolute path>" } and surface the response to the user.
```

**Claude Code only — automatic hook (no rules file change needed):**

1. Copy `.forgecraft/hooks/session-advisor.sh` to `.claude/hooks/session-advisor.sh`
2. Add to `.claude/settings.json`:

```json
"hooks": {
  "UserPromptSubmit": [{
    "matcher": "",
    "hooks": [{ "type": "command", "command": "bash .claude/hooks/session-advisor.sh" }]
  }]
}
```

The advisor works on any project — `forgecraft.yaml` not required. It reads what's present, flags what's missing, and surfaces active gate violations.

---

## GitHub Branch Protection

Locks `main` and `develop` so that:
- No one can push directly (PRs required)
- CI (`ci` job) must pass before merge
- PR title + description must be valid (`validate-pr` job)
- No force pushes, no branch deletion

### Option A — Automated (recommended)

```bash
# One-time auth (if not already logged in):
! gh auth login

# Apply protection to main + develop:
npm run protect

# Solo project (0 required reviewers — PR still required):
npm run protect -- --solo

# Custom branches:
npm run protect -- --branches main,staging

# Preview without making changes:
npm run protect -- --dry-run
```

The script auto-detects your repo from `git remote origin` and calls the GitHub API. If `develop` doesn't exist yet it's silently skipped.

### Option B — Manual (no gh required)

1. Go to **GitHub → your repo → Settings → Branches**
2. Click **Add branch ruleset** (or "Add rule" on older UI)
3. Apply to each protected branch (`main`, `develop`):

| Setting | Value |
|---|---|
| Branch name pattern | `main` (repeat for `develop`) |
| Require a pull request before merging | ✓ ON |
| Required approvals | 1 (or 0 for solo projects) |
| Dismiss stale reviews on new commits | ✓ ON |
| Require status checks to pass | ✓ ON |
| Require branches to be up to date | ✓ ON |
| Required status checks | `ci` and `validate-pr` |
| Allow force pushes | ✗ OFF |
| Allow deletions | ✗ OFF |

> **Note on required checks**: `ci` and `validate-pr` must have run at least once on the repo before GitHub lets you add them as required checks. Push a PR first, let CI run, then come back and add the checks.

---

## Design-First (Before Any Feature Work)

Run before writing code for any non-trivial feature. Based on the gstack "office hours → plan review" discipline: define the problem and explore alternatives before touching a file.

```
Read CLAUDE.md, docs/PRD.md (if it exists), and Status.md.

We are about to start work on: [feature name / problem statement].

Before writing any code, produce a design document in docs/PRD.md covering:

1. PROBLEM STATEMENT
   In one paragraph: what user pain are we solving, for whom, and why now?
   If this already exists in docs/PRD.md, confirm it is still accurate.

2. USE CASES (add to docs/use-cases.md)
   For each new capability:
   UC-NNN: [Actor] [action] so that [outcome]
   Precondition: [state before]
   Main flow: [numbered steps]
   Exceptions: [error cases and how they're handled]

3. ALTERNATIVES CONSIDERED
   List 2-3 approaches you evaluated. For each:
   - What it is
   - Why it was rejected or deprioritized

4. RECOMMENDED APPROACH
   Which option and why. What are the main risks or unknowns?

5. ARCHITECTURE IMPACT (update docs/TechSpec.md if needed)
   ASCII diagram showing: where does this fit in the existing layers?
   What new dependencies does it introduce?
   What existing interfaces change?

6. TEST PLAN
   For each use case: what are the observable behaviors?
   Map each to a test: unit / integration / mutation target.
   Identify failure modes that need explicit test coverage.

Do NOT write any implementation code in this step.
Commit: docs(design): add design doc for [feature name]

After I review and approve the design, we will begin TDD with:
   test(scope): [RED] [behavior from use case]
```

---

## Greenfield Setup

Run once when starting a new project:

```
Read CLAUDE.md and docs/PRD.md.

This is a new project. The spec is in docs/. Set up the initial folder structure
following the hexagonal architecture layers described in .claude/standards/architecture.md:
- src/domain/       (entities, value objects — zero external deps)
- src/services/     (use cases, orchestration — depends on port interfaces only)
- src/ports/        (abstract contracts: repositories, gateways)
- src/adapters/     (concrete implementations: DB, external APIs, HTTP)
- src/api/          (route handlers — thin, validation + delegation only)

Create one module per use case listed in docs/use-cases.md.
Each module owns its models, service, repository interface, and route handler.
No cross-module imports except through src/shared/.

After scaffolding, run: npx forgecraft-mcp audit .
Target: 0 failing checks before writing the first feature.
Commit: chore(scaffold): initialize project structure
```

---

## Brownfield Integration

Run after `npx forgecraft-mcp setup .` on an existing codebase:

```
Read CLAUDE.md and Status.md.

Run: npx forgecraft-mcp audit .

Do not change any existing behavior. This pass is structural only.

For each failing check, in priority order:
1. Missing docs (PRD.md, TechSpec.md) — write a skeleton from the existing code, do not invent requirements
2. Missing hooks — run: npx forgecraft-mcp add-hook pre-commit .
3. Stale Status.md — update it now to reflect current state
4. Hardcoded URLs — extract to .env.example (see remediation prompt below)
5. File length violations — split by responsibility (see remediation prompt below)

Do NOT refactor any business logic in this pass.
Do NOT rename public APIs.
Commit each fix type separately.

After each fix type: run npx forgecraft-mcp audit . and report the new score.
Target: Score ≥ 70 (grade B) before any feature work begins.
Score thresholds: 0-59 (D) · 60-69 (C) · 70-79 (B) · 80-89 (A) · 90+ (A+)
```

---

## Mobile / React Native Setup

Run when adding a React Native app or starting a mobile-first project:

```
Read CLAUDE.md and docs/PRD.md.

Set up the React Native app inside a monorepo using npm workspaces:
  apps/mobile/          (React Native app)
  packages/domain/      (shared domain — zero native deps)
  packages/services/    (shared use cases)

Inside apps/mobile/src/, follow the same hexagonal layers as the server:
  src/domain/           (entities, value objects — zero external deps, no React imports)
  src/ports/            (abstract contracts: StoragePort, CameraPort, NetworkPort)
  src/services/         (use cases — depends on ports only)
  src/adapters/         (concrete: AsyncStorageAdapter, CameraAdapter, FetchAdapter)
  src/screens/          (thin — validation + delegation only, like the API layer)

Layer rules:
- Screens call services. Services call port interfaces. Adapters implement ports.
- No business logic in screens. No direct SDK calls in screens.
- Gesture handlers are thin: capture gesture data, delegate to service.
- All camera, AR, or sensor processing lives in src/adapters/.

Android XR / Google Play notes (tags: MOBILE, ANDROID_XR):
- Declare XR permissions in AndroidManifest.xml — do not request at runtime only.
- All XR session lifecycle (create, pause, resume, destroy) managed in a dedicated XrSessionAdapter.
- Test on physical device before any Play Store submission — emulator does not cover XR APIs.
- Play Store review: confirm age rating, content policy compliance, and target API level before submit.

Quality gates specific to mobile:
- Zero business logic in screens — audit will flag any screen importing from src/domain/ directly.
- All heavy processing (image, video, AR frame) offloaded to adapters, not run on the JS thread.
- No inline styles with hardcoded colors/sizes — use a design token file.

After scaffolding: run npx forgecraft-mcp audit .
Commit: chore(scaffold): initialize React Native project structure
```

---

## npm Package Publishing

Run when preparing to publish or update a package on the npm registry:

```
Read CLAUDE.md and CHANGELOG.md.

Pre-publish checklist:
1. Types included — confirm package.json has "types" or "exports" pointing to .d.ts files.
2. package.json exports correct — check "main", "module", "exports" fields cover all entry points.
3. CHANGELOG.md updated — add an entry for this version: date, changes, breaking notes.
4. Peer dependencies declared — frameworks (React, etc.) must be peerDependencies, not dependencies.
5. No dev-only files in the published bundle — check .npmignore or "files" field in package.json.

Version bump protocol:
- PATCH (1.0.x): bug fixes, no API changes
- MINOR (1.x.0): new features, backward compatible
- MAJOR (x.0.0): breaking changes — update migration guide before publishing

Commands in order:
  npm version patch|minor|major   # bumps version, creates git tag
  npm run build                   # compile to dist/
  npm publish --dry-run           # inspect what will be published — review before proceeding
  npm publish                     # publish for real

After publishing:
  git push && git push --tags     # push commit + version tag to remote

Commit messages for the sequence:
  chore(release): bump version to [X.Y.Z]
  docs(changelog): add [X.Y.Z] release notes
```

---

## Monorepo Setup

Run when initializing or restructuring a project with multiple packages:

```
Read CLAUDE.md.

npm workspaces structure:
  /                         (root — one forgecraft.yaml, one package.json with workspaces)
  packages/
    core/                   (shared domain logic, zero framework deps)
    api/                    (Express/Fastify server)
    cli/                    (CLI tool)
    mobile/                 (React Native app — optional)
  apps/
    web/                    (frontend — optional)

Root package.json:
  {
    "workspaces": ["packages/*", "apps/*"]
  }

Shared tsconfig pattern:
  tsconfig.base.json at root — defines strict settings, paths, target.
  Each package has tsconfig.json that extends: "../../tsconfig.base.json"
  Package-specific overrides only (outDir, rootDir).

Package interdependency wiring:
  In packages/api/package.json:
    "dependencies": { "@myorg/core": "*" }
  Install with: npm install (at root — workspaces resolves the link automatically)
  No need for npm link or symlinks — workspaces handles it.

Running commands across all packages:
  npm run build --workspaces             # build all
  npm run test --workspaces              # test all
  npm run lint --workspaces --if-present # lint where configured

Running forgecraft audit across all packages:
  npx forgecraft-mcp audit .             # run from root — covers all workspace packages

ForgeCraft in monorepos:
  One forgecraft.yaml at the root. All packages inherit the root standards.
  To override standards for a specific package, add forgecraft.yaml inside that package.
  Package-level forgecraft.yaml merges with root — it does not replace it.
  Tags (MOBILE, API, CLI) apply per-package: set them in the package-level forgecraft.yaml.

After setup: run npx forgecraft-mcp audit . from root.
Commit: chore(monorepo): initialize npm workspaces structure
```

---

### `file_length` — File Too Large

> Trigger: A source file exceeds 300 lines (default). The file has more than one reason to change.

```
Read CLAUDE.md and .claude/standards/architecture.md.

Run: npx forgecraft-mcp audit . and identify all file_length violations.

For each file (start with the largest):
1. Read the entire file.
2. Apply the "and test": describe what the file does in one sentence.
   If you need "and", it has two responsibilities — split it.
3. Identify the split boundary. Typical patterns:
   - Route handler file: extract business logic → service class
   - Service file: extract data access → repository class
   - Large types file: group by domain concept → separate type modules
   - Utility file: group by concern (string utils, date utils, etc.)
4. Create the new file(s). Move code. Update all imports.
5. Run tests. Fix any failures caused by the move (no logic changes).
6. Commit: refactor(scope): decompose [filename] by responsibility

Do NOT add functionality. Do NOT change business logic.
Do NOT merge multiple file splits into one commit.

After all splits: run npx forgecraft-mcp audit . and confirm 0 file_length failures.
```

### `hardcoded_url` — URLs or Hosts in Source

> Trigger: A URL, hostname, or IP address is hardcoded in source code (not a test, not a comment).

```
Read CLAUDE.md.

Run: npx forgecraft-mcp audit . and identify all hardcoded_url violations.

For each violation:
1. Identify the URL and its purpose (API endpoint? service URL? webhook?)
2. Choose a descriptive env var name: SERVICE_NAME_URL, AUTH_SERVICE_BASE_URL, etc.
3. Add to .env.example: SERVICE_NAME_URL=https://example.com/api
4. Add to .env (local): SERVICE_NAME_URL=<actual value>
5. Replace in code: process.env.SERVICE_NAME_URL (TypeScript) or os.environ["SERVICE_NAME_URL"] (Python)
6. Add startup validation: if not process.env.SERVICE_NAME_URL, throw on startup

Never use process.env.X ?? 'http://hardcoded-fallback.com' as a default.
Use process.env.X ?? '' and validate at startup if required.

Commit: fix(config): extract hardcoded URLs to environment variables
After: run npx forgecraft-mcp audit . and confirm 0 hardcoded_url failures.
```

### `hardcoded_credential` — Secrets in Source

> Trigger: API keys, passwords, tokens, or secrets found in source code. **Block everything else until resolved.**

```
Read CLAUDE.md.

CRITICAL: Do not commit until all secrets are removed.

Run: npx forgecraft-mcp audit . and identify all hardcoded_credential violations.

For each violation:
1. Rotate the credential immediately if it was ever committed to git history.
   (Assume it is compromised. The git history is public even if the repo is private.)
2. Add to .env.example: CREDENTIAL_NAME=<description of what this is>
3. Add to .gitignore: .env
4. Replace in code: process.env.CREDENTIAL_NAME
5. If the secret is in git history: run git filter-repo or BFG Repo Cleaner to purge it.

Commit: fix(security): remove hardcoded credentials from source
After: run npx forgecraft-mcp audit . and confirm 0 hardcoded_credential failures.
THEN: force-push the cleaned history if secrets were in past commits.
```

### `mock_in_source` — Mock Data in Production Code

> Trigger: `mock_data`, `fake_data`, `dummy_data`, or `stub_response` found in non-test source files.

```
Read CLAUDE.md and .claude/standards/architecture.md.

Run: npx forgecraft-mcp audit . and identify all mock_in_source violations.

For each violation:
1. Is this test infrastructure accidentally placed in src/? Move it to tests/.
2. Is this a development stub (returning fake data until the real API is ready)?
   Replace with: throw new NotImplementedError("RealServiceName.methodName: not yet implemented")
   Then wire the real implementation via dependency injection.
3. Is this an in-memory fake for local development?
   Move to src/adapters/in-memory/ and select via: process.env.USE_IN_MEMORY_ADAPTER=true

Never use 'if (isDev) return fakeData'. Use DI to swap adapters.

Commit: fix(adapters): remove mock data from production source
```

### `missing_prd` / `missing_techspec` — No Spec Docs

> Trigger: docs/PRD.md or docs/TechSpec.md does not exist.

```
Read CLAUDE.md, README.md, and any existing docs/.

The spec docs are missing. Create them by reverse-engineering the existing code.
Do NOT invent requirements. Document only what is demonstrably present.

docs/PRD.md — write:
- Problem statement (from README or code comments)
- Target users (infer from the domain)
- Use cases (one per major feature/endpoint/command)
- Non-goals (what this project explicitly does not do)

docs/TechSpec.md — write:
- Stack (detect from package.json / pyproject.toml / go.mod)
- Architecture diagram (ASCII, describe layers)
- Key design decisions (look for ADRs in docs/adrs/, or infer from code)
- External dependencies and what they're used for
- Environment variables (from .env.example)
- Deployment (from Dockerfile, railway.toml, or CI config)

Commit: docs(spec): add reverse-engineered PRD and TechSpec
```

### `stale_status` — Status.md Not Updated

> Trigger: Status.md has not been updated in more than 7 days.

```
Read CLAUDE.md and Status.md.

Update Status.md to reflect current state:
- What is in progress right now?
- What was completed since the last update?
- What are the next 3 tasks?
- Any blockers?

Format: ## Session [N] — [Date]
Keep history. Do not delete old entries, just add the new one at the top.

Commit: chore(status): update session status
```

### `layer_violation` — Direct DB Call in Route Handler

> Trigger: ORM/DB calls (prisma., knex(, mongoose., db.query) found in route/controller/handler files.

```
Read CLAUDE.md and .claude/standards/architecture.md.

Run: npx forgecraft-mcp audit . and identify all layer_violation failures.

The route handler is calling the database directly. This skips the service and repository layers.

For each violation:
1. Identify the business logic in the route handler.
2. Create a service method that encapsulates it.
3. Create a repository method for the data access.
4. Have the route handler call the service. The service calls the repository.
5. The route handler does ONLY: parse request → call service → format response.

Dependency chain: Router → Service → Repository → DB
Never skip layers. Never go Router → DB directly.

Commit: refactor(architecture): enforce layer boundaries in [module] routes
```

### `missing_hooks` — Pre-Commit Hooks Not Installed

> Trigger: Quality gate hooks are missing or not executable.

```
Run: npx forgecraft-mcp add-hook pre-commit .

Verify hooks are installed: ls -la .claude/hooks/ and cat .git/hooks/pre-commit

If hooks exist but are not running, check:
1. Are they executable?
   # Unix/macOS
   chmod +x .git/hooks/pre-commit
   # Windows (PowerShell)
   icacls .git\hooks\pre-commit /grant Everyone:RX
2. Do they have LF line endings? (Windows issue — CRLF breaks bash scripts)
3. Is the hooks directory path correct in .git/hooks/pre-commit?

After installing: make a small change and attempt to commit to verify hooks fire.
Commit: chore(hooks): install pre-commit quality gate hooks
```

### `cnt_bloat` — CLAUDE.md or core.md Too Large

> Trigger: CNT files (CLAUDE.md, .claude/core.md) exceed their line limits (CLAUDE.md: 5 lines, core.md: 50 lines).
> Note: This applies to project-level CLAUDE.md files generated by ForgeCraft (target: 3-5 lines pointing to .claude/index.md). It does NOT apply to workspace-level files like argos_automation/CLAUDE.md which serve as AI session context.

```
Read CLAUDE.md and .claude/core.md.

The CNT (Context Navigation Tree) is bloated. The CLAUDE.md should be 3-5 lines: 
project identity + pointer to .claude/index.md. Nothing else.

Run: npx forgecraft-mcp refresh . --apply

The refresh command redistributes content from oversized CNT files to the appropriate
.claude/standards/ domain files.

If content is still wrong after refresh, manually:
1. Move architecture rules → .claude/standards/architecture.md
2. Move testing rules → .claude/standards/testing.md
3. Move CI/CD rules → .claude/standards/cicd.md
4. CLAUDE.md keeps only: project name + tags + "Load .claude/index.md for standards"

Commit: refactor(cnt): redistribute CNT content to domain standards files
```

---

## Pre-Release Hardening

Run when the audit score is ≥ 80 and you're preparing to ship:

```
Read CLAUDE.md and .claude/standards/testing.md.

Run: npx forgecraft-mcp audit .

Pre-release checklist (do not skip steps):

Note: Skip steps that don't apply to your project type:
- CLI tools: skip load testing (step 5)
- npm libraries: skip OWASP review (step 4), skip load testing (step 5)
- Mobile apps: replace load testing with device performance profiling

1. MUTATION TESTING
   Run the mutation tool configured in forgecraft.yaml tools.mutation.
   Target MSI ≥ 80%. Any surviving mutant in a critical path (auth, payments, data integrity)
   is a test gap — write the missing test, then re-run.
   Commit: test(mutation): achieve MSI ≥ 80% threshold

2. DEPENDENCY AUDIT
   npm audit (or pip-audit for Python). Fix all HIGH and CRITICAL CVEs.
   Commit: fix(deps): resolve CVEs from dependency audit

3. ENV VAR COMPLETENESS
   Compare .env.example to .env. Every var in .env.example must be documented.
   Every required var must be validated at startup.
   Commit: fix(config): validate required environment variables at startup

4. OWASP TOP 10 REVIEW
   For each of: injection, broken auth, sensitive data exposure, XXE, broken access control,
   security misconfiguration, XSS, insecure deserialization, known vulnerabilities, logging gaps —
   confirm the countermeasure is in place or document why it does not apply.
   Commit: docs(security): OWASP Top 10 review for [version]

5. PERFORMANCE BASELINE
   Run load test (k6, locust, artillery) at 2× expected peak.
   Document p50, p95, p99 response times in Status.md.
   Commit: test(load): baseline at 2x peak — results in Status.md

After all steps: run npx forgecraft-mcp audit . Target: Score ≥ 90 (grade A).
```

---

## Post-Deployment

Run after a successful production deployment:

```
Read CLAUDE.md and Status.md.

Post-deployment checklist:

1. SYNTHETIC PROBES
   Confirm synthetic monitoring is live and hitting all critical paths.
   (Datadog synthetics, Checkly, or similar)

2. ERROR RATE BASELINE
   Open your observability dashboard. Record the error rate at T+30min.
   Document in Status.md: "Deployed [version] — error rate [X]% at T+30min"

3. INCIDENT RUNBOOK
   Verify the incident runbook (docs/runbook.md) is up to date.
   At minimum it should cover: how to rollback, how to page on-call, known failure modes.

4. STATUS.MD UPDATE
   Update Status.md with: version deployed, date, key changes, next planned version.
   Commit: chore(status): post-deployment update for [version]
```

---

## Drift Detection

Run when the project has grown significantly (new major feature, new team member, new integration):

```
Run: npx forgecraft-mcp refresh .

Review the diff output. For each detected change:
- New tags detected → run: npx forgecraft-mcp refresh . --apply
  This adds new domain blocks (e.g., if ANALYTICS tag was added, data pipeline rules appear)
- Standards drift (content in CLAUDE.md that conflicts with templates) → apply the refresh
- New hooks available → run: npx forgecraft-mcp add-hook <name> .

After applying: run npx forgecraft-mcp audit . and confirm no regression.
Commit: chore(forgecraft): apply refresh — [list what changed]
```

---

## Full Cycle (New Feature)

The complete developer loop with ForgeCraft active:

```
# 1. Before starting work
Read CLAUDE.md, Status.md, docs/use-cases.md

# 2. Check current state
npx forgecraft-mcp audit .
If any failures: fix them before adding new code (broken window rule)

# 3. Write the spec first
In docs/use-cases.md, add the use case:
  UC-NNN: [Actor] [action] so that [outcome]
  Precondition: [state]
  Main flow: [steps]
  Exceptions: [error cases]

# 4. TDD — test before implementation
Write a failing test that matches the use case acceptance criteria.
Commit: test(scope): [RED] [behavior description]

# 5. Implement minimum to pass
Commit: feat(scope): [behavior description]

# 5b. Mutation check on changed modules (do not skip)
Run the mutation tool on the files you just wrote.
A mutation score gap > 15 points means tests execute code without asserting behavior.
Fix before moving to step 6.
Commit: test(scope): [RED->GREEN->mutant-killed] [behavior]

# 6. Refactor with quality gate
Run: npx forgecraft-mcp audit .
Fix any new violations introduced.
Commit: refactor(scope): [what changed and why]

# 7. Update status
Update Status.md with what was completed.
Commit: chore(status): update session status
```

---

## Cheat Sheet

```
npx forgecraft-mcp setup .          # New project or first-time setup
npx forgecraft-mcp refresh .        # Preview drift detection
npx forgecraft-mcp refresh . --apply # Apply drift changes
npx forgecraft-mcp audit .          # Score 0-100, see all failures
npx forgecraft-mcp convert .        # Migration plan for legacy code (phased)
npx forgecraft-mcp review .         # Structured code review checklist

npm run ship [patch|minor|major]    # Automated release: test → bump → tag → push → PR
npm run protect                     # Apply GitHub branch protection (requires gh auth login)
npm run protect -- --solo           # Same but 0 required reviewers (solo project)
npm run protect -- --dry-run        # Preview without applying
```

### Git workflow at a glance

```
git checkout -b feat/my-feature     # Never commit directly to main
# ... do the work with TDD ...
git push origin feat/my-feature     # Hooks fire on every commit
gh pr create                        # Or: npm run ship patch
# CI runs: lint, typecheck, tests, mutation gate, audit, PR validation
# Merge → tag push → npm publish (automatic)
```

For the full command reference: [README](README.md#cli-commands)
For the quality gate library: [Gates Registry](https://genspec.dev/quality-gates/)
For the white paper: [Generative Specification](https://genspec.dev)
