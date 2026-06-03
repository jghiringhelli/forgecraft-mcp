# Architecture: Module Registry

> CNT node — read when: adding a new module, understanding ownership of an existing file, or debugging an unexpected dependency.

## Core Modules

| Module | File | Owns | Does NOT own |
|---|---|---|---|
| **MCP Dispatch** | `src/tools/forgecraft-dispatch.ts` | Action routing, param validation | Business logic, file I/O |
| **Sentinel Renderer** | `src/registry/sentinel-renderer.ts` | CLAUDE.md assembly, 5-category enforcement, Navigation Mode, Tool Sequencing | Template loading, file writing |
| **Tag Loader** | `src/registry/loader-tag.ts` | YAML template loading, block merging by tag | Rendering, validation |
| **MCP Discovery** | `src/registry/mcp-discovery.ts` | MCP server recommendations by tag, remote registry fetch | File writing |
| **Setup Orchestrator** | `src/tools/setup-project.ts` | Phase 1 + 2 coordination | Individual file writing (delegates to artifact writers) |
| **Phase 1 Handler** | `src/tools/setup-phase1.ts` | Analysis response, calibration questions | Writing any files |
| **Phase 2 Handler** | `src/tools/setup-phase2.ts` | Phase 2 response text, artifact list | File writing (delegates) |
| **Artifact Writers** | `src/tools/setup-artifact-writers.ts` | Idempotent doc stub writes (manifest, status, PRD, TechSpec) | Template loading |
| **Hook Installer** | `src/shared/hook-installer.ts` | Pre-commit hook installation, stack filtering | Hook content generation |
| **Audit** | `src/tools/audit.ts` | 0-100 compliance scoring, anti-pattern scan | Gate execution |
| **Cascade Checker** | `src/tools/check-cascade-steps.ts` | 5-step GS cascade validation | Remediation |
| **Layer Status** | `src/tools/layer-status.ts` | L1-L4 probe tracking per use case | Probe execution |
| **Session Prompt** | `src/tools/generate-session-prompt.ts` | Bound session prompt generation | Cascade validation (delegates) |
| **Propose Session** | `src/tools/propose-session.ts` | Pre-implementation estimation, task breakdown | Session prompt generation |
| **Close Cycle** | `src/tools/close-cycle.ts` | End-of-cycle gate + cascade re-check | Gate writing |
| **ADR Writer** | `src/tools/change-request.ts` | ADR + EDR generation, MADR format | Sequence numbering (delegates to fs scan) |
| **Decision Generator** | `src/tools/generate-decision.ts` | Decision record content generation | File writing |

## Shared Utilities (`src/shared/`)

| File | Purpose |
|---|---|
| `types.ts` | Tag enum, shared type definitions |
| `types/gates.ts` | Gate schema types |
| `config.ts` | Default paths, threshold constants |
| `cnt-health.ts` | CNT structural health checks |
| `hook-installer.ts` | Hook installation logic |

## Addition Protocol

When adding a new module:
1. If it writes files → add to `setup-artifact-writers.ts` or create a new writer in `src/tools/`
2. If it reads templates → go through `loader-tag.ts`
3. If it renders instruction file content → extend `sentinel-renderer.ts`
4. If it's a new MCP action → add to dispatch in `forgecraft-dispatch.ts` + schema in `forgecraft-schema.ts`
5. If it's shared utility → `src/shared/`; never import from `src/tools/` in shared
