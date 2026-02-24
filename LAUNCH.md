# ForgeCraft Launch Guide

## 1. Publish to npm

```bash
# Login (opens browser)
npm login

# Verify
npm whoami

# Publish (auto-runs clean + build via prepublishOnly)
npm publish
```

Verify at: https://www.npmjs.com/package/forgecraft-mcp

---

## 2. Publish to MCP Registry

**After** the npm package is live:

```powershell
# Install mcp-publisher CLI (Windows)
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
tar xf mcp-publisher.tar.gz mcp-publisher.exe
Remove-Item mcp-publisher.tar.gz
# Move mcp-publisher.exe somewhere in your PATH

# Login via GitHub
.\mcp-publisher.exe login github
# Opens browser → authorize → enter code → done

# Publish (run from project root where server.json lives)
.\mcp-publisher.exe publish
```

Verify at: https://registry.modelcontextprotocol.io/ (search for `io.github.jghiringhelli/forgecraft`)

---

## 3. Reddit Post

**Subreddit:** r/ClaudeAI (primary), r/cursor (Cursor users), r/ChatGPTPro, r/LocalLLaMA

**Title:** I built an MCP server that gives AI coding assistants real engineering standards — works with Claude, Cursor, Copilot, Windsurf, Cline & Aider

**Body:**

AI coding assistants work better with clear engineering standards. But most start with a generic instruction file — no architecture patterns, no testing targets, no domain-specific rules, no quality gates.

I built **ForgeCraft** to fix that. It's an MCP server (14 tools) that analyzes your project, auto-detects your stack, and generates production-grade instruction files from 112 curated template blocks:

- SOLID principles with concrete, enforceable rules
- Testing pyramid with coverage targets (80%+ enforced)
- Architecture patterns (hexagonal, clean code, DDD)
- CI/CD, deployment, and 12-Factor guidance
- Domain-specific standards (fintech, healthcare, gaming, etc.)
- Quality-gate hooks that enforce standards pre-commit

**Supports 6 AI assistants:** Claude (CLAUDE.md), Cursor (.cursor/rules/), GitHub Copilot (.github/copilot-instructions.md), Windsurf (.windsurfrules), Cline (.clinerules), Aider (CONVENTIONS.md). Generate for one or all at once.

**Install in one line:**
```
claude mcp add forgecraft -- npx -y forgecraft-mcp
```
Then just tell Claude *"set up this project for production"*.

It has 18 domain tags you can combine (API + WEB-REACT + FINTECH = merged standards with no conflicts), 3 content tiers so you're not overwhelmed on day one, and an audit tool that scores your project 0-100 against the standards.

Everything is composable YAML templates, not hardcoded — so teams can add their own standards or override defaults.

**GitHub:** https://github.com/jghiringhelli/forgecraft-mcp
**npm:** `forgecraft-mcp`

Open source (MIT). Would love feedback — what engineering standards do you wish your AI assistant enforced?

---

## 4. Hacker News (Show HN)

**Title:** Show HN: ForgeCraft – MCP server that generates engineering standards for AI coding assistants

**Comment (post as first reply):**

AI coding assistants work better with explicit engineering standards, but setting those up is tedious and most people skip it.

ForgeCraft is an MCP server with 14 tools. You install it in one line, tell Claude "set up this project", and it:

1. Scans your codebase and detects your stack
2. Auto-classifies into domain tags (API, React, fintech, healthcare, etc.)
3. Generates instruction files from 112 curated template blocks
4. Adds quality-gate hooks

Supports 6 AI assistants: Claude (CLAUDE.md), Cursor (.cursor/rules/), GitHub Copilot, Windsurf, Cline, and Aider. Generate for one or all at once.

The templates cover SOLID, hexagonal architecture, testing pyramids, CI/CD, 12-Factor, and domain-specific patterns. Everything is YAML — no code to write if you want to add your own standards.

18 composable tags, 3 content tiers (core → recommended → optional), and an audit tool that scores compliance 0-100.

Install: `claude mcp add forgecraft -- npx -y forgecraft-mcp`

GitHub: https://github.com/jghiringhelli/forgecraft-mcp

Tech: TypeScript, MCP SDK, 128 tests. MIT licensed.

**Tips:** Post on a weekday morning US Eastern time (9-11am). Keep it factual.

---

## 5. Twitter/X Thread

**Tweet 1:**
AI coding assistants work better with real engineering standards. But setting those up? Tedious.

I built ForgeCraft — an MCP server that generates production-grade instruction files from 112 curated template blocks matched to your stack.

Works with Claude, Cursor, Copilot, Windsurf, Cline & Aider.

One line:
```
claude mcp add forgecraft -- npx -y forgecraft-mcp
```
🧵

**Tweet 2:**
The problem with generic instruction files:
• No architecture patterns
• No testing pyramid or coverage targets
• No domain-specific rules
• No quality-gate hooks

ForgeCraft generates all of that in 30 seconds — for 6 different AI assistants.

**Tweet 3:**
How it works:
- 18 domain tags (API, React, fintech, healthcare, gaming...)
- 112 curated template blocks
- 3 content tiers (don't overwhelm on day one)
- Auto-detects your stack from code
- Outputs to CLAUDE.md, .cursor/rules/, copilot-instructions.md, and more

Tags compose — pick [API] + [FINTECH] and blocks merge without conflicts.

**Tweet 4:**
14 tools your AI assistant picks automatically:
- setup_project (start here)
- audit_project (score 0-100)
- refresh_project (scope changed?)
- generate_instructions (multi-target)
- add_hook, add_module, review_project...

All open source. Templates are YAML, not code — easy to contribute.

GitHub: https://github.com/jghiringhelli/forgecraft-mcp

**Tags:** @AnthropicAI @ClaudeAI @cursor_ai @GitHub #MCP #AI #DevTools

---

## 6. MCP Catalogs & Directories

### VS Code MCP Gallery (github.com/mcp)
VS Code's `@mcp` search in the Extensions view pulls from the GitHub MCP server registry at github.com/mcp, which is a frontend for registry.modelcontextprotocol.io. **No separate submission needed** — being on the registry IS being in the gallery. Users find it by searching `@mcp forgecraft` in VS Code. The default page is sorted by install count; ranking improves with more installs.

**Key:** The `title` field in server.json is what github.com/mcp displays. Ensure server.json has `"title": "ForgeCraft"` and a good description.

### PR to modelcontextprotocol/servers (Community Servers)
The most-referenced MCP server directory. Submit a PR to add to the Community Servers section.

**Entry (add alphabetically under "F"):**
```markdown
• [ForgeCraft](https://github.com/jghiringhelli/forgecraft-mcp) - MCP server that generates production-grade engineering standards (SOLID, testing, architecture, CI/CD) for AI coding assistants — supports Claude, Cursor, Copilot, Windsurf, Cline, and Aider.
```

**PR title:** `feat: add ForgeCraft MCP server to community list`

### All Distribution Channels

| Channel | Action | Link | Priority |
|---------|--------|------|----------|
| **modelcontextprotocol/servers** | PR to Community Servers README | https://github.com/modelcontextprotocol/servers | 🔴 Critical |
| **GitHub Repo Topics** | Add mcp, mcp-server, model-context-protocol, github-copilot, developer-tools, scaffolding | Repo Settings → Topics | 🔴 Critical |
| **Smithery** | Submit server | https://smithery.ai/ | 🟠 High |
| **MCP Discord** | Post in #showcase | https://glama.ai/mcp/discord | 🟠 High |
| **awesome-mcp-servers (wong2)** | Open PR | https://github.com/wong2/awesome-mcp-servers | 🟠 High |
| **awesome-mcp-servers (punkpeye)** | Open PR | https://github.com/punkpeye/awesome-mcp-servers | 🟠 High |
| **mcp.so** | Submit/PR | https://mcp.so/ (github.com/chatmcp/mcp-directory) | 🟡 Medium |
| **opentools.com** | Direct submission | https://opentools.com/ | 🟡 Medium |
| **mcpservers.com** | Direct submission | https://mcpservers.com/ | 🟡 Medium |
| **mkinf.io** | Direct submission | https://mkinf.io/ | 🟡 Medium |
| **Dev.to** | Write article | https://dev.to/ | 🟡 Medium |
| **Product Hunt** | Launch post | https://producthunt.com/ | 🟢 Lower |
| **LinkedIn** | Personal post | Reaches engineering managers | 🟢 Lower |

### Priority order (highest ROI first):
1. ~~npm publish~~ ✅
2. ~~MCP Registry~~ ✅
3. Re-publish with updated server.json (title + description)
4. GitHub repo topics (5 min, immediate SEO)
5. PR to modelcontextprotocol/servers
6. r/ClaudeAI
7. Hacker News (Show HN)
8. MCP Discord #showcase
9. Smithery
10. awesome-mcp-servers PRs (wong2 + punkpeye)
11. Twitter/X thread
12. Remaining aggregator submissions
13. Dev.to article
14. Product Hunt / LinkedIn

See `docs/distribution-plan.md` for the full plan with step-by-step instructions.
