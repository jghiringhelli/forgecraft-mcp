# Status.md

## Last Updated: 2026-02-24
## Session Summary
MCP discoverability research & distribution plan. Confirmed ForgeCraft IS on the Official MCP Registry
(v0.1.0 since Feb 18, v0.2.0 since Feb 19). Discovered that VS Code's `@mcp` gallery at github.com/mcp
is a registry frontend — no separate submission needed. Updated server.json with `title` field and
improved description (these are what github.com/mcp displays). Created comprehensive distribution plan
covering 12+ MCP catalogs and directories. Updated LAUNCH.md with all channels.

### What Changed
1. **6 New Tags**: HIPAA (PII masking, encryption, audit logging), SOC2 (access control,
   change management, incident response), DATA-LINEAGE (field coverage, lineage decorators),
   OBSERVABILITY-XRAY (X-Ray Lambda instrumentation), MEDALLION-ARCHITECTURE (Bronze/Silver/Gold),
   ZERO-TRUST (deny-by-default IAM, explicit allow rules).
2. **12 New YAML Templates**: instructions.yaml + mcp-servers.yaml for each of the 6 new tags.
3. **Type System**: ALL_TAGS expanded to 24 entries, loader mappings + TAG_DESCRIPTIONS updated.
4. **Tests**: 128 passing, 10 suites. Updated discovery test to verify all 24 tags return servers.
5. **README**: Tag table updated with 6 new rows.

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
- Working on: Distribution — getting ForgeCraft listed across MCP catalogs
- Blocked by: Nothing
- Decisions pending: None
- Next steps:
  1. Re-publish to registry with updated server.json (title + description) — bump to v0.2.1
  2. Add GitHub repo topics: mcp, mcp-server, model-context-protocol, github-copilot, developer-tools
  3. Submit PR to modelcontextprotocol/servers community list (highest-value action)
  4. Submit PRs to awesome-mcp-servers (wong2 + punkpeye)
  5. Submit to Smithery.ai
  6. Post to r/ClaudeAI, MCP Discord, Hacker News
  7. Submit to remaining aggregators (mcp.so, opentools.com, mcpservers.com, etc.)
  8. Add NPM_TOKEN secret to GitHub repo for CI/CD publishing
  9. See docs/distribution-plan.md for full plan

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
