<p align="center">
  <h1 align="center">ForgeCraft</h1>
  <p align="center">
    <strong>Production engineering standards for any AI coding assistant.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/forgecraft-mcp"><img src="https://img.shields.io/npm/v/forgecraft-mcp.svg" alt="npm version"></a>
    <a href="https://github.com/jghiringhelli/forgecraft-mcp/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/forgecraft-mcp.svg" alt="license"></a>
    <a href="https://www.npmjs.com/package/forgecraft-mcp"><img src="https://img.shields.io/npm/dm/forgecraft-mcp.svg" alt="downloads"></a>
  </p>
</p>

---

AI coding assistants work better with clear engineering standards. Most start with a generic instruction file — ForgeCraft replaces that with production-grade standards: SOLID principles, testing pyramids, architecture patterns, CI/CD pipelines, domain-specific rules, and quality-gate hooks — all composed from 112 curated template blocks matched to your actual stack.

**Supports:** Claude (CLAUDE.md) · Cursor (.cursor/rules/) · GitHub Copilot (.github/copilot-instructions.md) · Windsurf (.windsurfrules) · Cline (.clinerules) · Aider (CONVENTIONS.md)

```bash
claude mcp add forgecraft -- npx -y forgecraft-mcp
```

Then tell Claude:

> "Set up this project for production"

Done. Your AI assistant now has tailored instruction files with SOLID principles, testing standards, architecture patterns, CI/CD guidance, and quality-gate hooks — all matched to your stack.

## `claude init` vs ForgeCraft

| | `claude init` | ForgeCraft |
|---|---|---|
| **Instruction file** | Generic, one-size-fits-all | 112 curated blocks matched to your stack |
| **AI assistants** | Claude only | Claude, Cursor, Copilot, Windsurf, Cline, Aider |
| **Architecture** | None | SOLID, hexagonal, clean code, DDD |
| **Testing** | Basic mention | Testing pyramid with coverage targets (80%+) |
| **Domain rules** | None | 18 domains (fintech, healthcare, gaming…) |
| **Commit standards** | None | Conventional commits, atomic changes |
| **Quality gates** | None | Pre-commit hooks that enforce standards |
| **CI/CD** | None | Pipeline stages, environments, deploy guidance |
| **Session continuity** | None | `Status.md` + `forgecraft.yaml` persist context |
| **Drift detection** | None | `refresh_project` detects scope changes |
| **Compliance scoring** | None | `audit_project` scores 0-100 |

## How It Works

```
You: "Set up this project for production"

Claude calls setup_project → scans your code → detects [API] + [WEB-REACT]
                           → creates forgecraft.yaml
                           → generates instruction files for your AI assistant(s)
                           → adds quality-gate hooks
                           → done
```

ForgeCraft is an [MCP server](https://modelcontextprotocol.io/) — it gives Claude 14 specialized tools. Claude picks the right ones automatically. You just describe what you want in plain English.

> **Already ran `claude init`?** ForgeCraft's `generate_instructions` can merge with your existing CLAUDE.md (`merge_with_existing: true`), keeping your custom sections while adding production standards.

## Install

**One line. Takes 10 seconds.**

```bash
claude mcp add forgecraft -- npx -y forgecraft-mcp
```

Restart Claude Code. That's it.

<details>
<summary>Alternative: manual config</summary>

Add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "forgecraft": {
      "command": "npx",
      "args": ["-y", "forgecraft-mcp"]
    }
  }
}
```
</details>

## What You Get

After `setup_project`, your project has:

```
your-project/
├── forgecraft.yaml        ← Your config (tags, tier, customizations)
├── CLAUDE.md              ← Engineering standards (Claude)
├── .cursor/rules/         ← Engineering standards (Cursor)
├── .github/copilot-instructions.md  ← Engineering standards (Copilot)
├── Status.md              ← Session continuity tracker
├── .claude/hooks/         ← Pre-commit quality gates
├── docs/
│   ├── PRD.md             ← Requirements skeleton
│   └── TechSpec.md        ← Architecture + NFR sections
└── src/shared/            ← Config, errors, logger starters
```

### The Instruction Files

This is the core value. Assembled from curated blocks covering:

- **SOLID principles** — concrete rules, not platitudes
- **Hexagonal architecture** — ports, adapters, DTOs, layer boundaries
- **Testing pyramid** — unit/integration/E2E targets, test doubles taxonomy
- **Clean code** — CQS, guard clauses, immutability, pure functions
- **CI/CD & deployment** — pipeline stages, environments, preview deploys
- **Domain patterns** — DDD, CQRS, event sourcing (when your project needs it)
- **12-Factor ops** — config, statelessness, disposability, logging

Every block is sourced from established engineering literature (Martin, Evans, Wiggins) and adapted for AI-assisted development.

## 24 Tags — Pick What Fits

Tags are domain classifiers. ForgeCraft auto-detects them from your code, or you choose manually. Combine freely — blocks merge without conflicts.

| Tag | What it adds |
|-----|-------------|
| `UNIVERSAL` | SOLID, testing, commits, error handling *(always on)* |
| `API` | REST/GraphQL contracts, auth, rate limiting, versioning |
| `WEB-REACT` | Component arch, state management, a11y, perf budgets |
| `WEB-STATIC` | Build optimization, SEO, CDN, static deploy |
| `CLI` | Arg parsing, output formatting, exit codes |
| `LIBRARY` | API design, semver, backwards compatibility |
| `INFRA` | Terraform/CDK, Kubernetes, secrets management |
| `DATA-PIPELINE` | ETL, idempotency, checkpointing, schema evolution |
| `ML` | Experiment tracking, model versioning, reproducibility |
| `FINTECH` | Double-entry accounting, decimal precision, compliance |
| `HEALTHCARE` | HIPAA, PHI handling, audit logs, encryption |
| `MOBILE` | React Native/Flutter, offline-first, native APIs |
| `REALTIME` | WebSockets, presence, conflict resolution |
| `GAME` | Game loop, ECS, physics, rendering pipeline |
| `SOCIAL` | Feeds, connections, messaging, moderation |
| `ANALYTICS` | Event tracking, dashboards, data warehousing |
| `STATE-MACHINE` | Transitions, guards, event-driven workflows |
| `WEB3` | Smart contracts, gas optimization, wallet security |
| `HIPAA` | PII masking, encryption checks, audit logging |
| `SOC2` | Access control, change management, incident response |
| `DATA-LINEAGE` | 100% field coverage, lineage tracking decorators |
| `OBSERVABILITY-XRAY` | Auto X-Ray instrumentation for Lambdas |
| `MEDALLION-ARCHITECTURE` | Bronze=immutable, Silver=validated, Gold=aggregated |
| `ZERO-TRUST` | Deny-by-default IAM, explicit allow rules |

## Content Tiers

Not every project needs DDD on day one.

| Tier | Includes | Best for |
|------|----------|----------|
| **core** | Code standards, testing, commit protocol | New/small projects |
| **recommended** | + architecture, CI/CD, clean code, deploy | Most projects *(default)* |
| **optional** | + DDD, CQRS, event sourcing, design patterns | Mature teams, complex domains |

Set in `forgecraft.yaml`:
```yaml
projectName: my-api
tags: [UNIVERSAL, API]
tier: recommended
```

## All 14 Tools

| Tool | Purpose |
|------|---------|
| `setup_project` | **Start here.** Analyze → classify → configure → generate. |
| `refresh_project` | Re-scan after changes. Detects new tags, updates config. |
| `classify_project` | Analyze code to suggest tags |
| `scaffold_project` | Generate full project structure |
| `generate_instructions` | Create instruction files for any AI assistant |
| `audit_project` | Score compliance (0-100). Run in CI. |
| `review_project` | Structured review checklist |
| `convert_existing` | Phased migration plan for legacy code |
| `add_hook` | Add quality-gate hooks |
| `add_module` | Scaffold a feature module |
| `configure_mcp` | Discover & configure recommended MCP servers |
| `get_nfr_template` | NFR sections for tech specs |
| `list_tags` | Show all available tags |
| `list_hooks` | Show hooks, filterable by tag |

## Configuration

### Fine-tune what your AI assistant sees

```yaml
# forgecraft.yaml
projectName: my-api
tags: [UNIVERSAL, API, FINTECH]
tier: recommended
outputTargets: [claude, cursor, copilot]  # Generate for multiple assistants

exclude:
  - cqrs-event-patterns    # Don't need this yet

variables:
  coverage_minimum: 90      # Override defaults
  max_file_length: 400
```

### Community template packs

```yaml
templateDirs:
  - ./my-company-standards
  - node_modules/@my-org/forgecraft-flutter/templates
```

## Keeping Standards Fresh

### Audit (run anytime, or in CI)

```
Score: 72/100  Grade: C

✅ Instruction files exist
✅ Hooks installed (3/3)
✅ Test script configured
🔴 hardcoded_url: src/auth/service.ts
🔴 status_md_current: not updated in 12 days
🟡 lock_file: not committed
```

### Refresh (project scope changed?)

Tell Claude *"refresh this project"* — it re-scans, suggests new tags, shows before/after impact, and updates everything on approval.

## Contributing

Templates are YAML, not code. You can add patterns without writing TypeScript.

```
templates/your-tag/
├── instructions.yaml   # Instruction file blocks (with tier metadata)
├── structure.yaml      # Folder structure
├── nfr.yaml            # Non-functional requirements
├── hooks.yaml          # Quality gate scripts
├── review.yaml         # Code review checklists
└── mcp-servers.yaml    # Recommended MCP servers for this tag
```

PRs welcome. See [`templates/universal/`](templates/universal/) for the format.

### MCP Server Discovery

`configure_mcp` dynamically discovers recommended MCP servers matching your project tags. Servers are curated in `mcp-servers.yaml` per tag — community-contributable via PRs.

Built-in recommendations include Context7 (docs), Playwright (testing), Chrome DevTools (debugging), Stripe (fintech), Docker/K8s (infra), and more across all 24 tags.

Optionally fetch from a remote registry at setup time:
```yaml
# In forgecraft.yaml or via tool parameter
include_remote: true
remote_registry_url: https://your-org.com/mcp-registry.json
```

## Development

```bash
git clone https://github.com/jghiringhelli/forgecraft-mcp.git
cd forgecraft-mcp
npm install
npm run build
npm test   # 128 tests, 10 suites
```

## License

MIT
