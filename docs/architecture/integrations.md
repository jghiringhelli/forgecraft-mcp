# Architecture: External Integrations

> CNT node — read when: adding a new external dependency, changing the MCP transport, or modifying remote registry access.

## Integration Map

| Integration | Direction | When | Protocol |
|---|---|---|---|
| MCP SDK (`@modelcontextprotocol/sdk`) | Inbound | Every MCP call | stdio JSON-RPC |
| File system | Inbound + Outbound | Every operation | Node.js `fs` |
| Quality Gates Registry (`github.com/jghiringhelli/quality-gates`) | Inbound | Scaffold time (optional) | HTTPS fetch |
| Remote MCP Registry | Inbound | `configure_mcp` with `include_remote: true` | HTTPS fetch |
| npm registry | Outbound | `npm audit` in pre-commit hook | HTTPS |
| Git | Outbound | Pre-commit hooks, branch check | Local process |

## MCP Transport

ForgeCraft uses the **stdio transport** (not HTTP). The MCP server reads JSON-RPC from `stdin` and writes to `stdout`. This means:
- No port binding; no firewall rules needed
- The client (AI assistant) spawns ForgeCraft as a child process
- Each invocation is stateless — no connection state between tool calls

The HTTP transport (`src/http-server.ts`) exists for development/testing purposes only. It is not the production transport.

## Quality Gates Registry

The registry at `github.com/jghiringhelli/quality-gates` is the canonical source of curated, generalizable gates. ForgeCraft pulls gate definitions at scaffold time when `include_remote: true` is set in `forgecraft.yaml`.

Gate definitions follow the schema in `docs/architecture/data-model.md`. ForgeCraft never pushes to the registry automatically — contribution is manual (PR).

## Remote MCP Registry

An optional remote registry of MCP server recommendations can be fetched at `configure_mcp` time:
```yaml
include_remote: true
remote_registry_url: https://your-org.com/mcp-registry.json
```

Local (built-in) servers always take priority over remote entries. Remote-only servers are merged in with `source: "remote"`. Network failures degrade gracefully — local recommendations always returned.

## File System Contract

ForgeCraft writes ONLY within the `project_dir` passed to each tool. It never writes to:
- `$HOME` or user config directories
- System paths (`/usr/`, `/etc/`)
- The ForgeCraft package directory itself

The only exception: pre-commit hook installation writes to `project_dir/.git/hooks/pre-commit`, which is inside the project's git directory.

## npm audit (Pre-Commit Hook)

The `pre-commit-audit.sh` hook runs `npm audit --audit-level=high --omit=dev`. It:
- Only triggers when `package.json`, `package-lock.json`, or `src/` files are staged
- Excludes devDependency CVEs (`--omit=dev`) — these are not exploitable in CI/prod
- Blocks commits on HIGH or CRITICAL CVEs in production dependencies

## No Runtime Network

At runtime (when the MCP server is serving tool calls), ForgeCraft makes no network requests. All template data is bundled in the `templates/` directory. The only network-touching operations are:
- `npm audit` (in the pre-commit hook, not the MCP server)
- Remote registry fetch (optional, user-initiated, at scaffold time only)
