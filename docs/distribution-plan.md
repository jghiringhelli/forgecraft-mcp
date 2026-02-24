# ForgeCraft Distribution Plan

## Current Status (Feb 24, 2026)

| Channel | Status | Notes |
|---------|--------|-------|
| npm | ✅ Published | v0.2.0 at npmjs.com/package/forgecraft-mcp |
| MCP Registry | ✅ Published | v0.1.0 (Feb 18) + v0.2.0 (Feb 19) at registry.modelcontextprotocol.io |
| GitHub Actions CI | ✅ Created | .github/workflows/publish-mcp.yml (auto-publish on v* tags) |
| server.json | ✅ Updated | Added `title`, improved description, added `runtimeHint` |
| VS Code MCP Gallery | 🔄 Auto-synced | github.com/mcp pulls from registry — appears when users search `@mcp forgecraft` |

## How VS Code MCP Discovery Works

VS Code's Extensions view `@mcp` search queries the **GitHub MCP server registry** (github.com/mcp), which is a frontend to `registry.modelcontextprotocol.io`. Since ForgeCraft is published on the registry, it IS discoverable via `@mcp forgecraft` in VS Code. The default gallery page only shows popular servers sorted by install count.

**Key insight:** No separate submission is needed for VS Code — being on the registry IS being on the gallery. The problem is organic discovery/popularity.

## Action Items

### 1. Re-publish to registry with updated server.json (v0.2.1)

The updated server.json now includes `title: "ForgeCraft"` and improved description. These fields are what github.com/mcp displays. Bump version and republish:

```bash
# Update version in package.json and server.json to 0.2.1
npm version patch
# Update server.json version to match
# Publish to npm
npm publish
# Publish to MCP Registry
& "$env:USERPROFILE\.mcp-tools\mcp-publisher.exe" login github
& "$env:USERPROFILE\.mcp-tools\mcp-publisher.exe" publish
```

### 2. Submit PR to modelcontextprotocol/servers

Add ForgeCraft to the **Community Servers** section of the README.

**Entry to add** (alphabetical, under "F"):

```markdown
• [ForgeCraft](https://github.com/jghiringhelli/forgecraft-mcp) - MCP server that generates production-grade engineering standards (SOLID, testing, architecture, CI/CD) for AI coding assistants — supports Claude, Cursor, Copilot, Windsurf, Cline, and Aider.
```

**Steps:**
1. Fork `github.com/modelcontextprotocol/servers`
2. Edit `README.md` — add entry in Community Servers under "F" section
3. Submit PR with title: `feat: add ForgeCraft MCP server to community list`
4. PR body: Brief description + link to npm + registry entry

### 3. Add GitHub Repo Topics

Go to github.com/jghiringhelli/forgecraft-mcp → Settings → Topics:

```
mcp  mcp-server  model-context-protocol  github-copilot
developer-tools  scaffolding  code-quality  engineering-standards
typescript  ai-tools  cursor  windsurf  cline  aider
```

### 4. Submit to Smithery.ai

1. Go to https://smithery.ai/
2. Sign in with GitHub
3. Submit server: `forgecraft-mcp` (npm package)
4. Add description and tags

### 5. Submit to Aggregator Directories

| Directory | URL | Action |
|-----------|-----|--------|
| mcp.so | https://mcp.so/ | Submit or PR to github.com/chatmcp/mcp-directory |
| mcpservers.org | https://mcpservers.org/ | PR to github.com/wong2/awesome-mcp-servers |
| glama.ai | https://glama.ai/mcp/servers | PR to github.com/punkpeye/awesome-mcp-servers |
| opentools.com | https://opentools.com/ | Direct submission |
| mcp-get.com | https://mcp-get.com/ | CLI: `mcp-get install forgecraft-mcp` (auto-discovered from npm) |
| mcpservers.com | https://mcpservers.com/ | Direct submission |
| deepnlp.org | http://www.deepnlp.org/store/ai-agent/mcp-server | Direct submission |
| mkinf.io | https://mkinf.io/ | Direct submission |

### 6. Social & Community (see LAUNCH.md for full content)

| Channel | Priority |
|---------|----------|
| r/ClaudeAI | High — primary user base |
| Hacker News (Show HN) | High — developer audience |
| MCP Discord | High — community showcase |
| Twitter/X | Medium — reach + virality |
| awesome-mcp-servers PRs | Medium — long-term SEO |
| Dev.to article | Medium — content marketing |
| Product Hunt | Lower — requires preparation |
| LinkedIn | Lower — reaches engineering managers |

## Priority Execution Order

1. ~~npm publish~~ ✅
2. ~~MCP Registry~~ ✅
3. **Re-publish** with updated server.json (title + description)
4. **GitHub repo topics** (5 minutes, immediate SEO benefit)
5. **PR to modelcontextprotocol/servers** (highest-value single action)
6. **PRs to awesome-mcp-servers** (wong2 + punkpeye repos)
7. **Smithery.ai** submission
8. **r/ClaudeAI** post
9. **MCP Discord** showcase
10. **Hacker News** Show HN
11. Remaining aggregator submissions
12. Twitter/X thread
13. Dev.to article
