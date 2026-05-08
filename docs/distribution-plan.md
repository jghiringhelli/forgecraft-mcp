# ForgeCraft Distribution Plan

## Current Status

| Channel | Status | Notes |
|---------|--------|-------|
| npm | ✅ Published | Auto-published via GH Actions on `v*.*.*` tags |
| MCP Registry | ✅ Published | registry.modelcontextprotocol.io — auto-synced to VS Code `@mcp` gallery |
| GitHub Actions | ✅ Active | `ci.yml` on push/PR + `publish.yml` on tag push (npm only) |
| server.json | ✅ Current | `title`, description, `runtimeHint` set |
| VS Code MCP Gallery | 🔄 Auto-synced | github.com/mcp pulls from registry — searchable as `@mcp forgecraft` |

> **Note on other package managers:** We do not publish to Chocolatey, Winget, Scoop, or any other package manager. Distribution is npm + MCP Registry only. If you receive automated rejection emails from Chocolatey, those are from a past manual submission — remove or deprecate the package at community.chocolatey.org.

## How VS Code MCP Discovery Works

VS Code's Extensions view `@mcp` search queries the **GitHub MCP server registry** (github.com/mcp), which is a frontend to `registry.modelcontextprotocol.io`. Since ForgeCraft is published on the registry, it IS discoverable via `@mcp forgecraft` in VS Code. The default gallery page only shows popular servers sorted by install count.

**Key insight:** No separate submission is needed for VS Code — being on the registry IS being on the gallery. The problem is organic discovery/popularity.

## How to Publish a New Version

```bash
# 1. Bump version
npm version patch   # or minor / major

# 2. Push tag — GH Actions handles the rest
git push origin main --follow-tags
```

GH Actions `publish.yml` runs: typecheck → tests → mutation gate → build → `npm publish`.
MCP Registry: republish manually after npm is live if server.json changed:

```powershell
.\mcp-publisher.exe publish
```

## Action Items

### Completed
- ~~npm publish~~ ✅
- ~~MCP Registry~~ ✅
- ~~Re-publish with updated server.json~~ ✅
- ~~GitHub repo topics~~ ✅ 14 topics added
- ~~PR to modelcontextprotocol/servers~~ ⬛ Deprecated — MCP Registry is now canonical
- ~~r/ClaudeAI~~ ✅ Posted
- ~~Hacker News (Show HN)~~ ✅ CodeSeeker posted
- ~~MCP Discord #showcase~~ ✅ CodeSeeker + ForgeCraft posted
- ~~mcpservers.org~~ ✅ CodeSeeker + ForgeCraft submitted
- ~~awesome-mcp-servers (punkpeye)~~ ✅ PR #2366 submitted

### Remaining (medium priority)

| Directory | URL | Action |
|-----------|-----|--------|
| mcp.so | https://mcp.so/ | Submit or PR to github.com/chatmcp/mcp-directory |
| opentools.com | https://opentools.com/ | Direct submission |
| mcpservers.com | https://mcpservers.com/ | Direct submission |
| mkinf.io | https://mkinf.io/ | Direct submission |
| Dev.to | https://dev.to/ | Write article |
| Product Hunt | https://producthunt.com/ | Launch post |
| LinkedIn | — | Personal post |
| Twitter/X thread | — | Use content from LAUNCH.md |

### GitHub Releases (deferred)

GH Actions will eventually publish GitHub Releases alongside npm to improve discoverability and enable a direct download story. Not yet implemented — tracked for future iteration.

### Smithery

Smithery requires a hosted HTTP MCP transport endpoint. Deferred until the MCP HTTP transport has a stable deployment. Do not add `mcpUrl` to smithery.yaml until that service is live.


