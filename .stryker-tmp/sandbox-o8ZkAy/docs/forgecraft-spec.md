# ForgeCraft — Claude Code Project Forge MCP Server

## Vision

An MCP server that gives Claude Code the ability to scaffold, configure, and maintain
production-grade project infrastructure. One install command. CC gets new tools. The
community contributes tags, hooks, patterns, and best practices via PRs.

```bash
# Install — one command, done
claude mcp add forgecraft -- npx -y forgecraft-mcp
```

After restart, CC has new tools. User says "set up this project for production" and CC
calls the forge tools to classify, generate, and configure everything.

---

## Why MCP Server > Static Templates

| | Static Files | Curl Repo | **MCP Server** |
|---|---|---|---|
| Install | Manual copy | One-time curl | `claude mcp add` |
| Updates | Manual | Manual re-curl | `npm update` |
| Interactivity | None — CC reads a wall of text | None | CC calls tools, gets structured responses |
| Context efficiency | Loads everything | Loads everything | Returns ONLY what's needed per tool call |
| Project introspection | None | None | Can analyze package.json, tsconfig, etc. |
| Community | Fork and drift | PRs but manual merge | NPM package + GitHub PRs |
| Customization | Edit files | Edit files | User overrides via .forgecraft.json |

---

## Architecture

### Core Concept: Tags + Templates + Tools

```
┌──────────────────────────────────────────────────────┐
│                    MCP Server                         │
│                                                       │
│  Tools (exposed to CC):                              │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────┐ │
│  │  classify    │ │  scaffold   │ │  add-module    │ │
│  │  project     │ │  project    │ │                │ │
│  └─────────────┘ └─────────────┘ └────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────┐ │
│  │  generate    │ │  add-hook   │ │  configure-mcp │ │
│  │  claude-md   │ │             │ │                │ │
│  └─────────────┘ └─────────────┘ └────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────┐ │
│  │  audit       │ │  convert    │ │  list-tags     │ │
│  │  project     │ │  existing   │ │  list-hooks    │ │
│  └─────────────┘ └─────────────┘ └────────────────┘ │
│                                                       │
│  Template Registry:                                   │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Built-in tags: UNIVERSAL, WEB-REACT, API, ...  │ │
│  │  Community tags: loaded from plugins             │ │
│  │  User overrides: .forgecraft.json in project     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### MCP Tools — What CC Can Call

#### 1. `classify_project`
Analyzes the current project directory and suggests tags.

**Input:**
```json
{
  "description": "LinkedIn for entrepreneurs with crypto pool integration",
  "scan_existing": true
}
```

**Behavior:**
- If `scan_existing: true`, reads package.json, tsconfig, pyproject.toml, existing folder
  structure, framework imports to auto-detect
- Combines auto-detection with user description
- Returns suggested tags with confidence and reasoning

**Output:**
```json
{
  "suggested_tags": ["UNIVERSAL", "WEB-REACT", "API", "SOCIAL", "ANALYTICS"],
  "detected_from_code": {
    "WEB-REACT": { "confidence": 0.95, "evidence": ["next.config.js found", "react in dependencies"] },
    "API": { "confidence": 0.90, "evidence": ["src/api/ directory", "express in dependencies"] }
  },
  "detected_from_description": {
    "SOCIAL": { "confidence": 0.85, "evidence": ["'LinkedIn' mentioned", "entrepreneur networking"] }
  },
  "available_tags": ["UNIVERSAL", "WEB-REACT", "WEB-STATIC", "API", "DATA-PIPELINE", "ML",
    "HEALTHCARE", "FINTECH", "WEB3", "REALTIME", "STATE-MACHINE", "GAME", "SOCIAL",
    "CLI", "LIBRARY", "INFRA", "MOBILE", "ANALYTICS"],
  "requires_confirmation": true
}
```

CC presents this to the user, user confirms/adjusts, then CC proceeds.

#### 2. `scaffold_project`
Generates all infrastructure for confirmed tags.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API", "SOCIAL", "ANALYTICS"],
  "language": "typescript",
  "project_name": "invellum",
  "options": {
    "include_mcp_config": true,
    "include_ci_cd": "github-actions",
    "include_docker": true
  }
}
```

**Behavior:**
- Generates CLAUDE.md by assembling blocks for active tags
- Generates Status.md skeleton
- Generates PRD and Tech Spec skeletons
- Creates folder structure (composing structures for each active tag)
- Creates hook scripts and makes them executable
- Creates shared modules (config, exceptions, logging)
- Creates composition root
- Creates .env.example
- Creates .claude/settings.json with recommended MCP servers
- Does NOT overwrite existing files unless explicitly told to

**Output:**
```json
{
  "files_created": [
    "CLAUDE.md",
    "Status.md",
    "docs/PRD.md",
    "docs/TechSpec.md",
    ".claude/hooks/pre-commit-branch-check.sh",
    "... (full list)"
  ],
  "mcp_servers_configured": ["context7", "github", "playwright"],
  "next_steps": [
    "Review and customize CLAUDE.md",
    "Fill in docs/PRD.md",
    "Copy .env.example to .env and configure",
    "Restart CC to activate MCP servers"
  ],
  "restart_required": true
}
```

#### 3. `generate_claude_md`
Generates or regenerates just the CLAUDE.md for given tags.
Useful when adding a new tag to an existing project.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API", "SOCIAL", "ANALYTICS"],
  "merge_with_existing": true
}
```

**Output:** Generated CLAUDE.md content as string, or written to file.

#### 4. `add_module`
Scaffolds a new feature module following the project's established patterns.

**Input:**
```json
{
  "module_name": "connections",
  "tags": ["SOCIAL"],
  "language": "typescript"
}
```

**Behavior:**
- Creates module directory with: models, interface, service, concrete implementation,
  routes, tests
- Follows the tag-specific patterns (SOCIAL module gets graph queries, etc.)
- Adds module to composition root (or reminds user to wire it)

**Output:** List of created files with descriptions.

#### 5. `add_hook`
Adds a specific hook to the project.

**Input:**
```json
{
  "hook": "i18n-enforcement",
  "tag": "WEB-REACT"
}
```

**Output:** Hook script created, made executable, registered.

#### 6. `configure_mcp`
Generates .claude/settings.json based on active tags.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API"],
  "custom_servers": {
    "codeseeker": {
      "command": "node",
      "args": ["/path/to/codeseeker/index.js"]
    }
  }
}
```

**Output:** .claude/settings.json written with recommended + custom servers.

#### 7. `audit_project`
Scans existing project against the template standards and reports violations.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API", "SOCIAL"]
}
```

**Behavior:**
- Checks if CLAUDE.md exists and has required sections
- Checks if Status.md exists and is recent
- Checks if hooks are installed and executable
- Checks folder structure against tag patterns
- Checks for anti-patterns (hardcoded values, mocks in source, etc.)
- Checks NFR compliance (logging present, config validated, etc.)

**Output:**
```json
{
  "score": 72,
  "passing": ["hooks_installed", "claude_md_exists", "folder_structure"],
  "failing": [
    { "check": "status_md_current", "message": "Status.md not updated in 5 days" },
    { "check": "no_hardcoded_urls", "message": "Found 3 hardcoded URLs in src/modules/auth/service.ts" },
    { "check": "i18n_coverage", "message": "12 JSX files have untranslated strings" }
  ],
  "recommendations": [
    "Run `add_hook i18n-enforcement` to catch untranslated strings",
    "Move URLs in auth/service.ts to config module"
  ]
}
```

#### 8. `convert_existing`
Analyzes an existing codebase and generates a phased migration plan.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API"],
  "scan_depth": "full"
}
```

**Output:** Migration plan with phases, effort estimates, risk levels.

#### 9. `list_tags` / `list_hooks`
Discovery tools for CC to understand what's available.

**Output:** List of all available tags/hooks with descriptions.

#### 10. `get_nfr_template`
Returns NFR sections for specific tags — used when generating Tech Spec.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "ANALYTICS"]
}
```

**Output:** NFR content for those tags, ready to insert into Tech Spec.

#### 11. `review_project`
Generates a structured code review checklist composed from review templates for the project's active tags.

**Input:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API"],
  "scope": "comprehensive"
}
```

**Behavior:**
- Loads review.yaml templates for all active tags
- Composes checklist items across 4 dimensions: Architecture, Code Quality, Tests, Performance
- `scope: "comprehensive"` returns all severity levels; `scope: "focused"` returns critical-only
- Each checklist item has a severity: critical, important, or nice-to-have
- Includes per-issue output format guidance: problem → options → recommendation → confirmation

**Output:**
```json
{
  "tags": ["UNIVERSAL", "WEB-REACT", "API"],
  "scope": "comprehensive",
  "dimensions": 4,
  "total_checks": 35,
  "checklist": "## Architecture Review\n### General...\n- 🔴 [CRITICAL] Component boundaries..."
}
```

---

## Template Registry — Community Extensibility

### Built-in Tags (Ship with Package)

```
templates/
├── universal/
│   ├── claude-md.yaml        # CLAUDE.md blocks
│   ├── nfr.yaml              # NFR definitions
│   ├── hooks/                # Hook scripts
│   │   ├── branch-protection.sh
│   │   ├── dangerous-commands.sh
│   │   ├── auto-format.sh
│   │   ├── secrets-scanner.sh
│   │   ├── compile-check.sh
│   │   ├── test-coverage.sh
│   │   ├── anti-pattern-detector.sh
│   │   └── code-review.sh
│   ├── structure.yaml        # Base folder structure
│   └── review.yaml           # Code review checklists (4 dimensions)
├── web-react/
│   ├── claude-md.yaml
│   ├── nfr.yaml
│   ├── hooks/
│   │   ├── i18n-enforcement.sh
│   │   └── a11y-lint.sh
│   ├── structure.yaml
│   ├── review.yaml
│   └── modules/              # Module templates
│       └── feature.yaml      # Generic React feature module scaffold
├── api/
│   ├── review.yaml
│   └── ...
├── library/
│   ├── review.yaml
│   └── ...
├── (... all other tags)
```

### Template YAML Format

```yaml
# Example: web-react/claude-md.yaml
tag: WEB-REACT
section: claude-md
blocks:
  - id: react-component-architecture
    title: "React Component Architecture"
    content: |
      ### Component Architecture
      - Atomic Design: atoms → molecules → organisms → templates → pages.
      - Components are pure UI. No API calls, no business logic.
      ...

  - id: react-i18n
    title: "Internationalization (i18n)"
    content: |
      ### Internationalization — From Day One
      - EVERY user-facing string goes through the i18n system.
      ...

  - id: react-state-management
    title: "State Management"
    content: |
      ### State Management
      - Local state (useState) for UI-only state.
      ...
```

```yaml
# Example: universal/review.yaml
tag: UNIVERSAL
section: review
blocks:
  - id: architecture-review
    dimension: architecture
    title: "Architecture Review"
    description: |
      Evaluate the system's structural integrity, coupling, and scalability.
    checklist:
      - id: component-boundaries
        description: "Component boundaries are well-defined with clear public APIs."
        severity: critical
      - id: dependency-graph
        description: "Dependency graph is acyclic. No circular imports."
        severity: critical
```

### Community Contribution Flow

```
1. Fork the repo
2. Create a new tag folder or modify existing:
   templates/my-new-tag/
   ├── claude-md.yaml
   ├── nfr.yaml
   ├── hooks/
   ├── structure.yaml
   └── modules/
3. Write tests for the new tag (templates render correctly, hooks execute)
4. Submit PR
5. PR reviewed by maintainers
6. Merged → published to npm → everyone gets it on `npm update`
```

### User Overrides — .forgecraft.json

Users can customize without forking:

```json
{
  "overrides": {
    "universal": {
      "claude-md": {
        "max_file_length": 400,
        "max_function_params": 6,
        "coverage_minimum": 85
      }
    },
    "web-react": {
      "i18n_library": "next-intl",
      "state_management": "zustand",
      "css_approach": "tailwind"
    }
  },
  "custom_hooks": [
    {
      "name": "phi-scanner",
      "trigger": "pre-commit",
      "script": ".forgecraft/hooks/phi-scanner.sh"
    }
  ],
  "custom_mcp_servers": {
    "codeseeker": {
      "command": "node",
      "args": ["/path/to/codeseeker/index.js"]
    }
  },
  "disabled_hooks": ["a11y-lint"],
  "additional_tags": ["HEALTHCARE"]
}
```

---

## Technical Implementation

### Package Structure

```
forgecraft-mcp/
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── tools/                   # Tool implementations
│   │   ├── classify.ts
│   │   ├── scaffold.ts
│   │   ├── generate-claude-md.ts
│   │   ├── add-module.ts
│   │   ├── add-hook.ts
│   │   ├── configure-mcp.ts
│   │   ├── audit.ts
│   │   ├── convert.ts
│   │   └── list.ts
│   ├── registry/                # Template registry
│   │   ├── loader.ts            # Loads built-in + user templates
│   │   ├── composer.ts          # Assembles templates by tag combination
│   │   └── renderer.ts         # Renders templates with project-specific values
│   ├── analyzers/               # Project analysis
│   │   ├── package-json.ts      # Detect frameworks from dependencies
│   │   ├── folder-structure.ts  # Analyze existing structure
│   │   ├── anti-pattern.ts      # Detect code anti-patterns
│   │   └── completeness.ts      # Check what's missing
│   └── types.ts                 # Shared types
├── templates/                   # Built-in templates (shipped with package)
│   ├── universal/
│   ├── web-react/
│   ├── api/
│   ├── web3/
│   ├── fintech/
│   ├── state-machine/
│   ├── realtime/
│   ├── game/
│   ├── social/
│   ├── analytics/
│   ├── healthcare/
│   ├── data-pipeline/
│   ├── ml/
│   ├── cli/
│   ├── library/
│   ├── infra/
│   └── mobile/
├── tests/
│   ├── tools/                   # Tool unit tests
│   ├── registry/                # Template composition tests
│   ├── analyzers/               # Analyzer tests
│   └── integration/             # Full scaffold → audit roundtrip tests
├── package.json
├── tsconfig.json
├── CLAUDE.md                    # Dogfood — this project uses its own template
└── README.md
```

### MCP Server Registration

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({
  name: "forgecraft",
  version: "1.0.0",
});

// Register tools
server.tool("classify_project", classifyProjectSchema, classifyProjectHandler);
server.tool("scaffold_project", scaffoldProjectSchema, scaffoldProjectHandler);
server.tool("generate_claude_md", generateClaudeMdSchema, generateClaudeMdHandler);
server.tool("add_module", addModuleSchema, addModuleHandler);
server.tool("add_hook", addHookSchema, addHookHandler);
server.tool("configure_mcp", configureMcpSchema, configureMcpHandler);
server.tool("audit_project", auditProjectSchema, auditProjectHandler);
server.tool("convert_existing", convertExistingSchema, convertExistingHandler);
server.tool("list_tags", listTagsSchema, listTagsHandler);
server.tool("list_hooks", listHooksSchema, listHooksHandler);
server.tool("get_nfr_template", getNfrTemplateSchema, getNfrTemplateHandler);
```

### Key Design Decisions

1. **Templates as YAML, not code.** Non-developers can contribute patterns, hooks,
   and best practices without writing TypeScript. The YAML gets rendered by the server.

2. **Composable by design.** Tags are orthogonal. `[WEB-REACT]` + `[WEB3]` composes
   cleanly — the server merges folder structures, CLAUDE.md blocks, hooks, and NFRs
   without conflicts.

3. **Override without forking.** `.forgecraft.json` lets users customize thresholds,
   tool choices, and add custom hooks without touching the source.

4. **Audit loop.** `audit_project` lets CC continuously check compliance, not just
   at setup time. Run it weekly, in CI, or at session start.

5. **Dogfooding.** The MCP server itself is built using its own template system.
   CLAUDE.md, hooks, and all — proving the patterns work.

---

## Distribution Strategy

### NPM Package
```bash
# Users install with:
claude mcp add forgecraft -- npx -y forgecraft-mcp

# Or globally:
npm install -g forgecraft-mcp
claude mcp add forgecraft -- forgecraft-mcp
```

### GitHub Repository
```
github.com/jghiringhelli/forgecraft-mcp
├── README.md              # What it is, one-command install, examples
├── CONTRIBUTING.md         # How to add tags, hooks, patterns
├── templates/              # The templates (YAML) — most contributions go here
├── src/                    # MCP server code
├── docs/
│   ├── tags.md            # All available tags with descriptions
│   ├── hooks.md           # All available hooks
│   ├── nfr.md             # All NFR templates
│   └── examples/          # Example generated projects
│       ├── social-platform/
│       ├── defi-strategy/
│       └── browser-game/
└── examples/               # .forgecraft.json examples for different project types
```

### Community Growth Plan

**Phase 1: Ship the core (you + CC build it)**
- Universal tag + 5 most common tags (WEB-REACT, API, WEB3, GAME, SOCIAL)
- Core tools: classify, scaffold, audit
- README with clear install instructions
- Blog post announcement

**Phase 2: Community templates**
- Open for PRs — focus on templates/ directory (low barrier to contribute)
- Tag maintainers: people who own specific tags and review PRs
- Template testing framework: automated validation that templates render correctly

**Phase 3: Plugin system**
- Third-party tag packages: `@forgecraft-community/tag-flutter`, `@forgecraft-community/tag-rust-backend`
- Custom hook marketplace
- Integration with other MCP servers (Context7, Playwright)

**Phase 4: Intelligence layer**
- `audit_project` learns from corrections across the community
- Suggested tags based on project patterns (trained on anonymous metadata)
- Hook effectiveness metrics (which hooks catch the most issues)

---

## Blog Post Strategy

### Where to Publish (in order of impact)

1. **Dev.to** — highest developer reach, markdown-native, SEO friendly
2. **Personal blog / Medium** — for your professional brand
3. **Hacker News** — submit as "Show HN: ForgeCraft — MCP server that makes CC produce production code"
4. **Reddit** — r/ClaudeAI, r/programming, r/webdev
5. **LinkedIn** — professional network, especially relevant given your career goals
6. **Twitter/X** — tag Anthropic, Claude Code community

### Blog Post Structure

**Title options:**
- "I built an MCP server that forces Claude Code to write production code from day one"
- "Stop prototyping with Claude Code — ship production code at prototype speed"
- "ForgeCraft: the missing infrastructure layer for Claude Code projects"

**Structure:**
1. The problem: CC writes quick-and-dirty code by default. Hardcoded values,
   monolith files, no interfaces, mock data in source, silent data sampling.
   Everyone hits this. Show the anti-pattern examples.

2. What we tried: CLAUDE.md rules, hooks, status files. Walk through the evolution
   from the LinkedIn post through to the meta-template. Show the progression.

3. Why an MCP server: static templates waste context window, can't introspect the
   project, can't be community-maintained. MCP is the native extension mechanism.

4. Demo: show a 2-minute video or GIF sequence:
   - `claude mcp add forgecraft -- npx -y forgecraft-mcp`
   - "Set up this project for production"
   - CC calls classify → user confirms → CC calls scaffold
   - Show the generated CLAUDE.md, hooks, folder structure
   - Show CC writing code that follows the rules (interfaces, DI, no hardcoding)
   - Show `audit_project` catching a violation

5. The tag system: explain how tags compose. Show Invellum vs Delta Zero vs X-Wing
   getting different infrastructure from the same tool.

6. Community invitation: "Here's how to contribute a tag for your stack."

7. Link to repo, install command, star button.

### Timing
- Build the MVP (Phase 1) first — working tool beats announced vaporware
- Blog post when: install works, scaffold works, audit works, 3+ tags functional
- Iterate based on community feedback before Phase 2

---

## MVP Scope — What to Build First

### Must Have (Week 1-2)
- [ ] MCP server scaffolding (TypeScript, @modelcontextprotocol/sdk)
- [ ] `list_tags` tool — returns available tags
- [ ] `classify_project` tool — analyzes project + description, suggests tags
- [ ] `scaffold_project` tool — generates files for tag combination
- [ ] UNIVERSAL templates complete (CLAUDE.md, hooks, structure, NFRs)
- [ ] WEB-REACT templates complete
- [ ] API templates complete
- [ ] ANALYTICS templates complete
- [ ] `audit_project` tool — basic compliance checking
- [ ] README with install instructions
- [ ] Dogfood: build this project using its own output

### Should Have (Week 3-4)
- [ ] WEB3 templates
- [ ] STATE-MACHINE templates
- [ ] GAME templates
- [ ] SOCIAL templates
- [ ] FINTECH templates
- [ ] `add_module` tool
- [ ] `add_hook` tool
- [ ] `configure_mcp` tool
- [ ] `.forgecraft.json` override system
- [ ] `convert_existing` tool
- [ ] Blog post draft

### Nice to Have (Month 2+)
- [ ] HEALTHCARE, DATA-PIPELINE, ML, REALTIME templates
- [ ] Plugin system for third-party tags
- [ ] Template testing framework
- [ ] CI integration (audit in GitHub Actions)
- [ ] Community contribution guide
- [ ] Video demo

---

## Name Options

| Name | npm available? | Domain? | Vibe |
|------|---------------|---------|------|
| ForgeCraft | Check | forgecraft.dev | Building/crafting, toolkit |
| scaffoldai | Check | - | Descriptive but generic |
| archwright | Check | - | Architecture + craftsperson |
| cc-forge | Check | - | Claude Code specific |
| shipwright | Taken | - | - |
| ironclad | Taken | - | - |

**Recommendation: `ForgeCraft`** — short, memorable, implies building/forging, not taken
(verify before committing). "Forge" = creating something strong from raw materials.
"Craft" = craftsmanship, quality engineering.
