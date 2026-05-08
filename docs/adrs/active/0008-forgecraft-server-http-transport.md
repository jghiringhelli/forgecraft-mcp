# ADR 0008 — forgecraft-server: HTTP Transport for Paid Tier

**Status**: Accepted
**Date**: 2026-03-18
**Decision**: Add HTTP MCP transport as a separate server repo; stdio stays free and open

## Context

forgecraft-mcp is published as an npm package with stdio transport. This is free, open-source, and works with any MCP client. To support paid tiers (usage gating, contribution credits, Pro features), we need an HTTP transport with authentication.

## Decision

- `forgecraft-server` is a separate repo (not a monorepo addition) — keeps the free tool clean
- HTTP transport: Hono + @hono/node-server + MCP HTTP transport adapter
- Auth: Clerk JWT (when ready) — not blocking initial deployment
- Billing: Stripe (when ready) — not blocking initial deployment
- Deploy: Railway (git-push deploy, auto-detected Nixpacks)
- Health endpoint: /health returns version + uptime + dependency status
- Gate contribution endpoint: works without auth (rate-limited by IP on Free)

## Tiers

- **Free**: stdio only + contribute-gate (anonymous mode, 5/month IP rate limit)
- **Pro Individual**: HTTP transport + contribute-gate (attributed, earns credits) + private gates
- **Teams**: HTTP transport + org-level gates + usage dashboard

## Contribution Modes

- `anonymous`: gate definition only, no attribution, no Pro credit
- `attributed`: full attribution with GitHub handle, earns 1 month Pro per approved gate (founding: 3 months)
- Contribution is ALWAYS optional. Never mandatory. The "that guy" persona is a valid free user.

## Consequences

- forgecraft-mcp remains 100% functional without forgecraft-server
- forgecraft-server is a progressive enhancement, not a dependency
- Gate contributions work offline (writes to .forgecraft/pending-contributions.json) if no server configured
