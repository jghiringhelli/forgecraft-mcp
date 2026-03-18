# ADR 0007 — Quality Gates Source of Truth and Community Sync Pipeline

**Status**: Accepted  
**Date**: 2026-03-18  
**Decision**: Quality gates live in forgecraft-mcp templates/; community contributions graduate from quarantine via PR  

---

## Context

ForgeCraft-MCP embeds quality gate definitions directly in `templates/*/verification.yaml`,
`templates/*/hooks.yaml`, and `templates/*/instructions.yaml`. This works at current scale
but creates a sourcing problem as the registry grows:

1. Where is the authoritative definition of a quality gate?
2. How do community-contributed gates get reviewed and graduated without destabilizing
   the main registry?
3. How do projects that depend on forgecraft-mcp get gate updates without manual
   template management?
4. How is the `genspec.dev` portal kept in sync with what ships in the tool?

## Decision

**The canonical source of truth is `forgecraft-mcp/templates/`.** Gates are not published
to a separate package. The portal reads from `dist/taxonomy.json`, which is generated
at build time by `npm run export:taxonomy`.

### Community contribution pipeline

```
GitHub issue (quality-gate-proposal template)
  ↓ AI review + maintainer review
  ↓ Issue labeled "approved"
templates/quarantine/<tag>/NNNN-gate-id.yaml  ← quarantine PR
  ↓ CI: tests pass, evidence field non-empty, method-agnostic check
  ↓ 2 maintainer approvals
templates/<tag>/verification.yaml  ← graduation PR
```

### Quarantine rules

A gate in `templates/quarantine/` is:
- Loaded by the registry (same as production) but rendered with a `[QUARANTINE]` badge
- Not included in the default tier composition until graduated
- Opt-in only: users who set `include_quarantine: true` in forgecraft.yaml get it

Graduation requires:
1. Evidence field non-empty (real incident or near-miss)
2. Check description is process-agnostic (no specific tool names in the check field)
3. All CI tests pass with the new gate definition loaded
4. 2 maintainer approvals on the graduation PR
5. Contributor credited in CONTRIBUTORS.md

### Portal sync

`dist/taxonomy.json` is generated at build time and committed to the `dist/` branch
(separate from `main`). The portal at `genspec.dev` fetches from the `dist` branch
directly. No separate publishing step. Portal is always in sync with the latest shipped
release.

### Project-specific gates (not synced automatically)

Gates in `.forgecraft/project-gates.yaml` with `generalizable: true` are queued for
manual contribution via `forgecraft contribute-gate`. They are never auto-synced.
The human review step is non-negotiable: auto-approved community gates would erode
quality quickly.

## Alternatives considered

**`@genspec/quality-gates` npm package**: Cleaner versioning, but adds a publishing
step and a dependency chain. ForgeCraft's value is in composition (gates + structure +
hooks + instructions together), not in gates in isolation. A separate package would
fragment the composition.

**Embedded with version tracking**: Add `source_version` field to each gate. Easier
but doesn't solve the review/quarantine problem.

**GitHub Actions auto-PR**: When an issue is labeled "approved", a bot creates the
quarantine PR. Reduces maintainer friction. Deferred — implement after the manual
pipeline is validated with 10+ gates.

## Consequences

- `templates/quarantine/` directory exists and is loaded by the registry (but not
  composed into default output)
- `npm run export:taxonomy` must include quarantine gates with a flag
- Portal must visually distinguish quarantine gates (badge, different opacity)
- CONTRIBUTORS.md is maintained manually until a bot can do it
- The portal URL (`genspec.dev`) points to the portal repo's GitHub Pages, which reads
  `taxonomy.json` from the dist artifact or a CDN copy of it
