<!-- CNT branch: routes/code | load when navigating source code or adding a module -->

## Folder Map — Where Code Lives

```
src/
  tools/           — MCP action handlers (one file per action)
  registry/        — sentinel renderer, tag loader, MCP discovery
  shared/          — utilities, types, hook installer
  analyzers/       — package.json and project context analyzers
templates/
  universal/       — always-on blocks (hooks, instructions, structure)
  api/ cli/ ...    — tag-specific blocks (24 tag directories)
tests/
  tools/           — handler tests (mirror src/tools/)
  registry/        — renderer and loader tests
  shared/          — utility tests
docs/              — PRD, TechSpec, architecture/, adrs/, use-cases.md
.claude/           — this CNT (index.md, core.md, lifecycle.md, routes/, corrections.md, standards/)
```

## Module Addition Protocol

When adding a new module:
1. Check which layer it belongs to (see `.claude/core.md` → Architecture Invariants)
2. Check `docs/architecture/modules.md` — no existing module should already own this concern
3. New MCP action → `src/tools/` + add to `forgecraft-dispatch.ts` + schema in `forgecraft-schema.ts`
4. New registry function → `src/registry/` (never import from `src/tools/` in registry)
5. Shared utility → `src/shared/` (never import from `src/tools/` or `src/registry/` in shared)
6. Add `@gs-links` comment referencing the use case and/or ADR it implements

## Naming Conventions

| Artifact | Convention | Example |
| --- | --- | --- |
| Files | `kebab-case.ts` | `setup-project.ts` |
| Classes / Types | `PascalCase` | `SentinelFile` |
| Variables / Functions | `camelCase` | `renderSentinelTree` |
| Constants | `SCREAMING_SNAKE_CASE` | `DOMAIN_ORDER` |
| Allowed abbreviations | — | id, url, http, db, api, ctx, mcp |

## Code Standards

- Strict typing — no `any`, use `unknown` + narrowing
- Explicit return types on all exported functions
- Files ≤300 lines, functions ≤50 lines — extract when exceeded
- ESM imports: all local imports use `.js` extensions
- No circular imports (hook-enforced)
