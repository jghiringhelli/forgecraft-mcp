# Status.md

## Last Updated: 2026-03-02
## Session Summary
v0.5.1: GAME tag expanded with Phaser 3, PixiJS, Three.js/WebGL content. Compact renderer mode added. Header slimmed. 237 tests passing.

### What Changed (v0.5.1)
1. **GAME tag — web game frameworks**: Added 4 instruction blocks (`phaser3-setup`, `pixijs-setup`, `threejs-webgl-setup`, `web-game-performance`), new `structure.yaml`, `nfr.yaml`, `review.yaml`, and 3 additional MCP servers (Playwright, Puppeteer, Filesystem) to `mcp-servers.yaml`.
2. **Compact renderer mode**: `--compact` CLI flag + `compact: true` in `forgecraft.yaml`. Strips explanatory tail clauses (`. This ensures X`, `. Because Y`) from bullet points and deduplicates identical lines across the full document. ~20-40% token reduction for multi-tag projects.
3. **Slim header**: The 12-line ForgeCraft blockquote header (with stale MCP tool names) replaced by a single 1-line HTML comment.
4. **`ForgeCraftConfig.compact`**: New field persisted in `forgecraft.yaml`. Flows automatically through `setup`, `refresh`, and `scaffold` generation paths.
5. **8 new tests** for `compactifyContent` in renderer test suite.

### Previous (v0.5.0)
1. **New `src/cli.ts`**: Full CLI dispatcher — 11 subcommands, argv parser (no deps), tag fallback from `forgecraft.yaml`.
2. **New `src/tools/sentinel.ts`**: Minimal MCP tool replacing the 2-tool suite. Diagnoses project state, recommends CLI commands.
3. **Refactored `src/index.ts`**: Dual-mode entry point — CLI mode if subcommands given, MCP server otherwise. Single sentinel tool registered.
4. **New `tests/cli.test.ts`**: 15 tests covering routing, list, audit fallback, and sentinel handler.
5. **Version bumped to 0.5.0** across `package.json` and `server.json`.
6. **Phase 4 docs**: README fully rewritten CLI-first; stale MCP API references (`setup_project`, `configure_mcp` tool name, `forgecraft action='generate'`) replaced with CLI commands throughout.
7. **Sentinel QoL**: All three sentinel branches now instruct Claude to ask the user before running recommended commands.
8. **Output text fixes**: Stale `action='...'` references in `audit.ts` and `convert.ts` output replaced with CLI commands.

## Project Structure
```
forgecraft-mcp/
├── CLAUDE.md
├── Status.md
├── package.json
├── tsconfig.json
├── .env.example
├── .claude/
│   └── hooks/                    # Git quality gate scripts
├── docs/
│   ├── forgecraft-spec.md          # Product spec / PRD
│   ├── PRD.md
│   └── TechSpec.md
├── src/
│   ├── index.ts                  # MCP server entry point (composition root)
│   ├── shared/
│   │   ├── config/index.ts       # Env validation, fail-fast
│   │   ├── errors/index.ts       # Custom error hierarchy
│   │   ├── logger/index.ts       # Structured logging
│   │   └── types.ts              # Shared types (Tag, ProjectConfig, etc.)
│   ├── tools/                    # MCP tool handlers
│   │   ├── classify.ts
│   │   ├── scaffold.ts
│   │   ├── generate-claude-md.ts
│   │   ├── add-module.ts
│   │   ├── add-hook.ts
│   │   ├── configure-mcp.ts
│   │   ├── audit.ts
│   │   ├── convert.ts
│   │   ├── list.ts
│   │   └── get-nfr.ts
│   ├── registry/                 # Template loading, composition, rendering
│   │   ├── loader.ts
│   │   ├── composer.ts
│   │   └── renderer.ts
│   └── analyzers/                # Project introspection
│       ├── package-json.ts
│       ├── folder-structure.ts
│       ├── anti-pattern.ts
│       └── completeness.ts
├── templates/                    # YAML templates shipped with package
│   ├── universal/
│   ├── api/
│   ├── cli/
│   ├── library/
│   ├── web-react/
│   └── ... (other tags)
└── tests/
    ├── tools/
    ├── registry/
    ├── analyzers/
    └── integration/
```

## Feature Tracker
| Feature | Status | Notes |
|---------|--------|-------|
| MCP server entry point | ✅ Complete | Dual-mode: CLI or MCP server |
| Shared modules (config/errors/logger/types) | ✅ Complete | ContentTier, ForgeCraftConfig expanded |
| Template registry (loader/composer/renderer) | ✅ Complete | Tier filtering, community dirs |
| YAML templates (63 files, 18 tags) | ✅ Complete | All blocks have tier metadata + mcp-servers |
| CLI mode (`src/cli.ts`) | ✅ Complete | **NEW** — 11 subcommands, no extra deps |
| Sentinel MCP tool | ✅ Complete | **NEW** — 1 tool, ~200 tokens, diagnose+recommend |
| Tool: list_tags / list_hooks | ✅ Complete | |
| Tool: classify_project | ✅ Complete | |
| Tool: scaffold_project | ✅ Complete | Config-aware (forgecraft.yaml) |
| Tool: generate_claude_md | ✅ Complete | Config-aware, merge mode |
| Tool: audit_project | ✅ Complete | |
| Tool: add_hook | ✅ Complete | |
| Tool: add_module | ✅ Complete | |
| Tool: configure_mcp | ✅ Complete | Dynamic MCP discovery service |
| Tool: get_nfr_template | ✅ Complete | |
| Tool: convert_existing | ✅ Complete | |
| Tool: review_project | ✅ Complete | 4-dimension review checklists |
| Tool: setup_project | ✅ Complete | Unified setup flow |
| Tool: refresh_project | ✅ Complete | Drift detection |
| Analyzers | ✅ Complete | package-json, folder, anti-pattern, completeness |
| Hook scripts (8 universal + 2 react) | ✅ Complete | |
| Unit tests | ✅ Complete | 229 passing (16 suites) |
| Integration tests | ✅ Complete | smoke + tools |

## Known Bugs
| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Technical Debt
| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| | | | |

## Current Context
- Working on: **v0.5.0 complete** — CLI-first refactor
- Blocked by: Nothing
- Decisions pending: None
- Next steps:
  1. Publish v0.5.0 to npm (`npm publish`)
  2. Update npm/MCP Registry descriptions to highlight CLI usage
  3. Update README.md with CLI command reference

## Architecture Decision Log
| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| 2026-02-14 | TypeScript + npm | Spec targets TS, MCP SDK is TS-native | Active |
| 2026-02-14 | Templates as YAML | Non-devs can contribute patterns without writing TS | Active |
| 2026-02-14 | Vitest for testing | Modern, fast, native TS support, ESM compatible | Active |
| 2026-02-14 | Zod for tool input validation | MCP SDK integration, runtime type safety | Active |
| 2026-02-14 | Tags: UNIVERSAL+API+CLI+LIBRARY | MCP server (API), npm package (LIBRARY), npx invocable (CLI) | Active |
| 2026-02-17 | review.yaml template type | Structured code review checklists per tag, 4 dimensions | Active |
| 2026-02-17 | Engineering preferences in CLAUDE.md | Calibrate CC judgment on subjective trade-offs | Active |
| 2026-02-18 | Canonical pattern blocks | Hexagonal arch, DDD, Clean Code, CQRS, 12-Factor | Active |
| 2026-02-17 | Deployment & CI/CD templates | Per-tag deployment guidance (PaaS, containers, CDN) | Active |
| 2026-02-18 | Tier system (core/recommended/optional) | Prevent overwhelming new projects. Core = auto, recommended = default, optional = opt-in | Active |
| 2026-02-18 | forgecraft.yaml config file | Project-level config for tags, tier, include/exclude, community dirs. YAML for easy merge & community contributions | Active |
| 2026-02-18 | setup_project + refresh_project tools | Unified entry point and drift detection. Replaces manual classify→scaffold flow | Active |
| 2026-02-18 | Community template directories | loadAllTemplatesWithExtras merges external YAML dirs. Enables npm community packs | Active |
| 2026-03-02 | CLI-first + sentinel MCP | Moves all work to CLI subcommands. MCP server reduced to 1 sentinel tool (~200 tokens). Per CLI-MODE-PROPOSAL.md. | Active |
| 2026-02-20 | MCP server discovery service | Data-driven YAML registry + optional remote fetch. Replaces hardcoded TAG_SERVERS | Active |
