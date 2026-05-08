# ADR-0002 — TypeScript + Node.js + @modelcontextprotocol/sdk

**Date:** 2026-03-07
**Status:** accepted

## Context

ForgeCraft is a tool-server exposed to AI assistants via the Model Context Protocol.
The primary distribution channel is `npx forgecraft-mcp`, which means the binary
must start in <200ms, require no native compilation, and work on all developer
machines (Win/Mac/Linux) without global installs.

Alternatives evaluated:
- **Python**: Slower cold start, `pip install` friction in VS Code MCP config
- **Rust**: Best performance, but limits community contributions
- **Go**: Good binary size, but lower familiarity in JS-centric dev tooling community
- **TypeScript/Node**: Dominant in VS Code extension + MCP ecosystem. Official SDK
  available. Hot module ecosystem for YAML parsing (js-yaml). npx distribution is
  first-class. Contributor bar is lowest.

## Decision

**TypeScript 5 + Node.js 18+ + @modelcontextprotocol/sdk**

Specific choices:
- `@modelcontextprotocol/sdk` — official MCP SDK, maintained by Anthropic
- `js-yaml` — YAML parsing for templates
- `vitest` — test runner (fast, native ESM, watch mode)
- `tsup` — build tool (ESM + CJS output, declaration files)
- `zod` — input validation for all MCP tool schemas

## Consequences

Positive:
- Template contributors need only YAML skills, not TypeScript
- CLI users can `npx` without installing Node globally (Node bundled in many dev envs)
- Full type safety on all internal interfaces
- Official MCP SDK gives us HTTP transport, stdio transport, tool registration for free

Negative / Trade-offs:
- Node startup adds ~50ms vs native binaries (acceptable for CLI use)
- Bundle size is larger than Go/Rust (mitigated by npx caching)
