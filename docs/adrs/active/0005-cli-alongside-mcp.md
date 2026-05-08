# ADR-0005 — CLI Mode Alongside MCP Mode

**Date:** 2026-03-09
**Status:** accepted

## Context

ForgeCraft was initially designed as a pure MCP server — tools called by AI assistants
(Claude Code, Copilot). However, users wanted to run setup_project, audit_project,
and refresh_project from the command line without an AI assistant in the loop.
Two patterns for this:

1. **Separate package**: `forgecraft-cli` alongside `forgecraft-mcp`. Clean separation,
   but doubled distribution, duplicated handler code.
2. **Unified package with dual entrypoints**: Same package with `src/index.ts` (MCP)
   and `src/cli.ts` (CLI). CLI calls the same tool handlers, just with a different I/O adapter.

## Decision

**Single package, dual entrypoints.**

- `src/index.ts` — MCP stdio server (for AI assistants)
- `src/cli.ts` — Commander.js-based CLI (for humans at terminals)
- Both call the same tool handler functions from `src/tools/`
- CLI wraps handlers in a human-readable output formatter
- Tool handlers have no knowledge of whether they're running in MCP or CLI mode

package.json `bin` entry points to `src/cli.ts` bundled output.
MCP `server.json` registration points to `src/index.ts` bundled output.

## Consequences

Positive:
- One install, two modes
- Handler logic tested once, available to both surfaces
- No version skew between CLI and MCP

Negative / Trade-offs:
- CLI and MCP outputs must diverge (CLI = human-readable, MCP = JSON structured)
- Output formatting layer must be maintained in two places (thin, but real)
