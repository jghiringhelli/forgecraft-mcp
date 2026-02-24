# CLAUDE.md

## Project Identity
- **Repo**: github.com/jghiringhelli/forgecraft-mcp
- **Primary Language**: TypeScript 5.x
- **Framework**: MCP SDK (@modelcontextprotocol/sdk)
- **Runtime**: Node.js 18+
- **Domain**: Developer Tooling — MCP server for project scaffolding and quality enforcement
- **Sensitive Data**: NO
- **Project Tags**: `[UNIVERSAL]` `[API]` `[CLI]` `[LIBRARY]`
- **Package**: `forgecraft-mcp` (npm)

## Code Standards
- Maximum function/method length: 50 lines. If longer, decompose.
- Maximum file length: 300 lines. If longer, split by responsibility.
- Maximum function parameters: 5. If more, use a parameter object.
- Every public function/method must have JSDoc with typed params and returns.
- Delete orphaned code. Do not comment it out. Git has history.
- Before creating a new utility, search the entire codebase for existing ones.
- Reuse existing patterns — check shared/ before writing new.
- No abbreviations in names except universally understood ones (id, url, http, db, api).
- All names must be intention-revealing.

## Production Code Standards — NON-NEGOTIABLE

These apply to ALL code including prototypes.

### SOLID Principles
- **Single Responsibility**: One module = one reason to change. Use "and" to describe it? Split it.
- **Open/Closed**: Extend via interfaces and composition. Never modify working code for new behavior.
- **Liskov Substitution**: Any interface implementation must be fully swappable. No instanceof checks.
- **Interface Segregation**: Small focused interfaces. No god-interfaces.
- **Dependency Inversion**: Depend on abstractions. Concrete classes are injected, never instantiated
  inside business logic.

### Zero Hardcoded Values
- ALL configuration through environment variables or config files. No exceptions.
- ALL external URLs, ports, credentials, thresholds, feature flags must be configurable.
- ALL magic numbers must be named constants with documentation.
- Config is validated at startup — fail fast if required values are missing.

### Zero Mocks in Application Code
- No mock objects, fake data, or stub responses in source code. Ever.
- Mocks belong ONLY in test files.
- No TODO/FIXME stubs returning hardcoded values. Use NotImplementedError with a description.

### Interfaces First
Before writing any implementation:
1. Define the interface/protocol/abstract class
2. Define the data contracts (input/output DTOs)
3. Write the consuming code against the interface
4. Write tests against the interface
5. THEN implement the concrete class

### Dependency Injection
- Every service receives dependencies through its constructor.
- A composition root (src/index.ts) wires everything.
- No service locator pattern. No global singletons. No module-level instances.

### Error Handling
- Custom exception hierarchy per module. No bare Error throws.
- Errors carry context: IDs, timestamps, operation names.
- Fail fast, fail loud. No silent swallowing of exceptions.

### Modular from Day One
- Feature-based modules over layer-based. Each feature owns its models, service, types.
- Module dependency graph must be acyclic.
- Every module has a clear public API via index.ts exports.

## Layered Architecture

```
┌─────────────────────────────┐
│  MCP Tool Handlers          │  ← Thin. Schema validation + delegation only.
├─────────────────────────────┤
│  Registry / Analyzers       │  ← Business logic. Template composition, project analysis.
├─────────────────────────────┤
│  Templates (YAML data)      │  ← Pure data. No code. Tag-indexed content.
├─────────────────────────────┤
│  Shared / Infrastructure    │  ← Config, errors, logging, types.
└─────────────────────────────┘
```

- Tool handlers do not access templates directly — they go through the registry.
- Registry never imports from tools.
- Templates are data files (YAML), not code.

## API Standards (MCP Tool Contract)

### Contract First
- Define Zod schemas for every tool input before implementing the handler.
- Tool inputs/outputs documented in schema descriptions.
- Schema is the source of truth. Implementation must match.

### Design Rules
- Every tool returns structured JSON, not free text.
- Every tool response includes actionable next steps.
- Tools that modify files list all created/modified files in output.
- Tools that need confirmation return `requires_confirmation: true`.

## CLI / Library Standards

### Package Distribution
- `bin` entry in package.json for CLI invocation via npx.
- `files` field in package.json scoped to dist/ + templates/ only.
- Entry point has `#!/usr/bin/env node` shebang.
- All runtime dependencies listed in `dependencies`, not `devDependencies`.

### Backward Compatibility
- Semantic versioning (MAJOR.MINOR.PATCH).
- Template YAML format changes are breaking (MAJOR bump).
- New tags/hooks are additive (MINOR bump).
- Bug fixes and content improvements (PATCH bump).

## Testing Pyramid

```
         /  E2E  \          ← 5-10%. Full scaffold→audit roundtrips.
        / Integration \      ← 20-30%. Registry composition, file generation.
       /    Unit Tests   \   ← 60-75%. Tool handlers, analyzers, renderer.
```

### Coverage Targets
- Overall minimum: 80% line coverage (blocks commit)
- New/changed code: 90% minimum (measured on diff)
- Critical paths: 95%+ (template composition, file generation)

### Test Rules
- Every test name is a specification: `test_rejects_unknown_tag` not `test_validation`
- No empty catch blocks. No `assert(true)`. No tests that can't fail.
- Test files colocated: `tests/tools/classify.test.ts` mirrors `src/tools/classify.ts`.
- Flaky tests are bugs — fix or quarantine, never ignore.

## Data Guardrails ⚠️
- NEVER sample, truncate, or subset template content unless explicitly instructed.
- NEVER make simplifying assumptions about tag compositions.
- When composing templates for multiple tags, include ALL content for ALL active tags.

## Commit Protocol
- Conventional commits: feat|fix|refactor|docs|test|chore(scope): description
- Commits must pass: compilation, lint, tests, coverage gate.
- Keep commits atomic — one logical change per commit.
- Commit BEFORE any risky refactor. Tag stable states.
- Update Status.md at the end of every session.

## Corrections Log
When I correct your output, record the correction pattern here so you don't repeat it.
### Learned Corrections
- [2026-02-23] Commit after each feature completes — never bundle multiple features into one commit. When tests pass and the feature is verified, commit immediately before starting the next feature. The post-edit-commit-reminder hook warns at 15+ uncommitted files.
