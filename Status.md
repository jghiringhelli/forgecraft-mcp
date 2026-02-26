# Status.md

## Last Updated: 2026-02-23
## Session Summary
Project entering maintenance mode. v0.2.1 published to npm + MCP Registry. Distribution complete
across primary channels (npm, MCP Registry, Reddit, HN, MCP Discord, awesome-mcp-servers PRs).

### What Changed (v0.2.x)
1. **Multi-target AI assistant support**: Claude, Cursor, Copilot, Windsurf, Cline, Aider.
2. **6 New Tags**: HIPAA, SOC2, DATA-LINEAGE, OBSERVABILITY-XRAY, MEDALLION-ARCHITECTURE, ZERO-TRUST.
3. **MCP server discovery**: Data-driven YAML registry per tag.
4. **CI/CD pipeline**: GitHub Actions auto-publishes to npm + MCP Registry on version tags.
5. **128 tests passing**, 10 suites.

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
| MCP server entry point | ✅ Complete | 14 tools registered |
| Shared modules (config/errors/logger/types) | ✅ Complete | ContentTier, ForgeCraftConfig expanded |
| Template registry (loader/composer/renderer) | ✅ Complete | Tier filtering, community dirs |
| YAML templates (63 files, 18 tags) | ✅ Complete | All blocks have tier metadata + mcp-servers |
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
| Tool: setup_project | ✅ Complete | **NEW** — unified setup flow |
| Tool: refresh_project | ✅ Complete | **NEW** — drift detection |
| Analyzers | ✅ Complete | package-json, folder, anti-pattern, completeness |
| Hook scripts (8 universal + 2 react) | ✅ Complete | |
| Unit tests | ✅ Complete | 128 passing |
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
- Working on: **Maintenance mode** — no active feature work
- Blocked by: Nothing
- Decisions pending: None
- Next steps (optional, low priority):
  1. Submit to remaining aggregators (mcp.so, opentools.com, mcpservers.com, mkinf.io)
  2. Twitter/X thread (copy from LAUNCH.md)
  3. Dev.to article
  4. Community-contributed tags/templates via PRs

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
| 2026-02-20 | MCP server discovery service | Data-driven YAML registry + optional remote fetch. Replaces hardcoded TAG_SERVERS | Active |
