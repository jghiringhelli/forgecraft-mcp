<!-- ForgeCraft sentinel: protocols | 2026-03-18 | npx forgecraft-mcp refresh . --apply to update -->

## Dependency Registry — AI-Maintained Security Contract

The project's approved dependency set is a **living GS artifact maintained by the AI
assistant**. It is not a template rule — template authors cannot predict which library
will gain a CVE next quarter. The AI can run an audit at the moment a dependency is
about to be added. This block prescribes that it must.

### The registry artifact

File: **`docs/approved-packages.md`** — emit in P1 alongside schema, tsconfig, package.json.
Update it every time a dependency is added or upgraded. If it exists only in prose or a
README reference, it does not exist.

```markdown
# Approved Packages

| Package | Version range | Purpose | Alternatives rejected | Rationale | Audit status |
|---|---|---|---|---|---|
| example-pkg | ^2.4 | HTTP client | axios (larger bundle), node-fetch (no TS types) | Wide adoption, zero known CVEs | 0 HIGH/CRITICAL |
```

The AI populates every row. The registry is the authoritative record of WHY each
dependency was chosen and that it was clean at the time of addition.

### Process rules — stack-agnostic

1. **Before adding any package**: run the project's audit command (see table below)
   with `--dry-run` or equivalent to check the candidate for known CVEs.
   - If HIGH or CRITICAL found: choose an alternative and document the rejection.
   - If no CVE-free alternative exists: document the accepted risk and create an ADR
     naming the approver. Zero-tolerance is the default; exceptions require a record.
2. **After adding a package**: add a row to `docs/approved-packages.md` with audit status.
3. **Commit gate**: the pre-commit hook runs the audit command. HIGH or CRITICAL blocks
   the commit. If audit is not in the pre-commit hook, the gate does not exist.
4. **Version pins**: approved version ranges are locked in the lockfile (package-lock.json,
   uv.lock, Cargo.lock). The lockfile is committed. Ranges without a lockfile are not pins.

### Audit commands by ecosystem

| Ecosystem | Audit command | Threshold |
|---|---|---|
| npm / Node.js | `npm audit --audit-level=high` | HIGH or CRITICAL |
| pnpm | `pnpm audit --audit-level=high` | HIGH or CRITICAL |
| yarn | `yarn npm audit --severity high` | HIGH or CRITICAL |
| Python / pip | `pip-audit --fail-on-severity high` | HIGH or CRITICAL |
| Python / uv | `uv audit` | HIGH or CRITICAL |
| Rust | `cargo audit` | HIGH or CRITICAL |
| Go | `govulncheck ./...` | Any directly imported |
| Java / Maven | `mvn dependency-check:check -DfailBuildOnCVSS=7` | CVSS ≥ 7 |
| Ruby | `bundle audit` | HIGH or CRITICAL |

The correct command for **this project's ecosystem** must appear in the pre-commit hook
emitted in P1. Discovering CVEs at code review is too late.

## Clarification Protocol
Before writing code for any new feature or significant change:
- If the request implies architectural trade-offs that are not explicit, **ask one targeted
  question** before proceeding. Do not silently choose an architecture.
- If the domain model is ambiguous (cardinality, ownership, event ordering, shared state),
  state your assumption and ask for confirmation before implementing.
- If the request has two or more meaningfully different interpretations, present the options
  briefly and ask — do not guess and hide the choice.
- Do NOT ask about mechanical details (naming conventions, file placement, test structure) —
  apply the conventions already in this document without asking.
- Maximum one clarification round. If told "use your judgment," proceed with the most
  conservative interpretation and record the assumption in a code comment or new ADR.

## Feature Completion Protocol
After implementing any feature (new or changed):

### 1. Verify (local, pre-commit)
Run: `npx forgecraft-mcp verify .`
(Or `npm test` + manual HTTP check if forgecraft is not installed.)
A feature is not done until verify passes. Do not proceed to docs if it fails.

### 2. Commit (code only)
Commit after `verify` passes. This triggers CI and the staging deploy pipeline.
`feat(scope): <description>` — describes the feature, not the docs update.

### 3. Deploy to Staging + Smoke Gate
After the CI pipeline deploys to staging, run the smoke suite:
```
npx playwright test --config playwright.smoke.config.ts --grep @smoke
```
If smoke fails: **revert the deploy**. Do not proceed to production and do not cascade docs
for a feature that is broken in the deployed environment.

### 4. Doc Sync Cascade
Update the following in order — skip any that do not exist in this project:
1. **spec.md** — update the relevant feature section (APIs, behavior, contract changes)
2. **docs/adrs/** — add an ADR if a new architectural decision was made
3. **docs/diagrams/c4-*.md** — update container or component diagrams if a new module
   or external dependency was added
4. **Mermaid diagrams** (inline in TechSpec.md or standalone .mermaid files) — update
   sequence/flow diagrams for the changed surface
5. **docs/TechSpec.md** — update module list, API reference, or technology choice sections
6. **docs/use-cases.md** — update or add use cases if new actor interactions were introduced
7. **Status.md** — always update: what changed, current state, next steps

## MCP-Powered Tooling
### CodeSeeker — Graph-Powered Code Intelligence
CodeSeeker builds a knowledge graph of the codebase with hybrid search
(vector + text + path, fused with RRF). Use it for:
- **Semantic search**: "find code that handles errors like this" — not just grep.
- **Graph traversal**: imports, calls, extends — follow dependency chains.
- **Coding standards**: auto-detected validation, error handling, and state patterns.
- **Contextual reads**: `get_file_context` returns a file with its related code.
Indexing is automatic on first search (~30s–5min depending on codebase size).
Most valuable on mid-to-large projects (10K+ files) with established patterns.
Install: `npx codeseeker install --vscode` or see https://github.com/jghiringhelli/codeseeker

## Engineering Preferences
These calibrate the AI assistant's judgment on subjective trade-offs.
- **DRY is important** — flag repetition aggressively.
- **Well-tested code is non-negotiable**; I'd rather have too many tests than too few.
- **"Engineered enough"** — not under-engineered (fragile, hacky) and not over-engineered
  (premature abstraction, unnecessary complexity).
- **Handle more edge cases**, not fewer; thoughtfulness > speed.
- **Bias toward explicit over clever** — readability wins over brevity.
- When in doubt, ask rather than assume.

## Code Generation — Verify Before Returning

When emitting implementation code across one or more files, the response is not complete
until the following are true. Show the evidence in your response — do not claim without running.

### Verification steps (in order)
1. **Compile check**: Run `tsc --noEmit` (TypeScript), `mypy` (Python), or equivalent.
   Zero errors required. Do not return with type errors outstanding.
2. **Test suite**: Run the full test suite (`jest --runInBand`, `pytest`, etc.).
   Zero failures required. Fix every failure before returning.
3. **Interface consistency**: When fixing a compile error in file A, check ALL callers of
   the changed interface. Fixing one side without seeing the other causes oscillation:
   the model fixes `service.ts` (3-param signature) but `routes.ts` still calls it with
   an object — same error reappears inverted next pass.

### Required evidence in the final response
```
tsc --noEmit: 0 errors
Jest: 109 passed, 0 failed, 11 suites
```

### Common test setup pitfalls (TypeScript / Prisma)
- **`prisma db push`, not `prisma migrate deploy`** in test environments.
  `migrate deploy` silently no-ops when no `prisma/migrations/` folder exists,
  leaving all tables absent. `db push --accept-data-loss` syncs `schema.prisma` directly.
- **`deleteMany` in FK order, not `DROP SCHEMA`**.
  `$executeRawUnsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')` throws
  error 42601 — pg rejects multi-statement queries in prepared statements.
  Use ordered `deleteMany()` calls in `beforeEach` instead.
- **JWT_SECRET minimum length**: HS256 requires ≥ 32 characters.
  Test secrets like `"test-secret"` (11 chars) cause startup errors.
  Use `"test-secret-that-is-at-least-32-chars"` in test env.

## Known Pitfalls
Recurring type errors and runtime traps specific to this project's stack.
Resolve exactly as documented — no `any` casts, ignore directives, or unlisted workarounds.
### [Add project-specific pitfalls here]
<!-- Entry format:
### Library — trap description
What goes wrong and why, then:
```
// ❌ wrong
```
```
// ✅ correct
```
-->

## Corrections Log
When I correct your output, record the correction pattern here so you don't repeat it.
### Learned Corrections
- [AI assistant appends corrections here with date and description]
