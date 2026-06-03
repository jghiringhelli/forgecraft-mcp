# Architecture: Layer Diagram & Boundary Rules

> CNT node — read when: changing or reviewing layer structure, adding a new tool handler, or diagnosing layer violations.

## Layers (top → bottom)

```
Entry Points       index.ts (MCP stdio) · cli.ts (process.argv)
       │
Dispatch           forgecraft-dispatch.ts — routes action → handler
       │
Tool Handlers      src/tools/*.ts — stateless, one handler per action
       │
Registry           src/registry/*.ts — template loading, sentinel rendering, file writing
       │
Template Store     templates/<tag>/*.yaml — YAML blocks, no TypeScript
```

## Boundary Rules

| From | To | Allowed | Rule |
|---|---|---|---|
| Entry Point | Dispatch | ✅ | Entry points only call dispatch; no tool imports |
| Dispatch | Tool Handler | ✅ | One call per action; dispatch does no business logic |
| Tool Handler | Registry | ✅ | Handlers call registry functions; never read templates directly |
| Tool Handler | Tool Handler | ❌ | No cross-handler calls; shared logic goes to `src/shared/` |
| Registry | Template Store | ✅ | Registry reads YAML; never imports tool handlers |
| Template Store | Any code | ❌ | Templates are data; they contain no executable logic |
| Any layer | File system | Via registry only | Direct `fs` calls allowed only in registry + artifact writers |

## Key Invariants

1. **Tool handlers are stateless.** They read from the file system at call time; they do not cache between calls.
2. **Dispatch owns validation.** Common param validation (project_dir exists, required fields present) happens in dispatch before the handler is called.
3. **The sentinel renderer is the single source of truth for CLAUDE.md content.** No handler writes directly to CLAUDE.md.
4. **Template YAML is never executed.** It is loaded, merged, and written as strings. No `eval`, no dynamic requires.

## Layer Violation Detection

The `audit` action scans for direct DB/ORM calls in route handlers. For ForgeCraft itself:
- Tool handlers must not import from other tool handlers (`src/tools/X` importing `src/tools/Y`)
- Registry modules must not import from `src/tools/`
- `src/shared/` is available to all layers for pure utility functions
