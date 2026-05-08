# ADR-0004 — Orthogonal Tag Composition Model

**Date:** 2026-03-08
**Status:** accepted

## Context

Projects like "a React app with a REST API and analytics" need instruction files
and hooks from multiple domain areas (WEB-REACT + API + ANALYTICS). The question
is how to compose them without conflicts.

Approaches considered:
1. **Inheritance / override**: Tags extend a base, later tags override earlier ones.
   Problem: unpredictable outcomes, order-dependent, hard to debug.
2. **Selective merge**: Tags declare which blocks they conflict with.
   Problem: cross-tag coupling, every new tag must know about others.
3. **Orthogonal composition**: Tags are independent. Content is additive.
   CLAUDE.md sections, hooks, and folder entries from each tag are merged by
   concatenation (no override, no conflict). Tag authors must not assume their tag runs alone.

## Decision

**Tags are orthogonal. Composition is additive.**

Rules:
- Each tag owns its own block IDs in instructions.yaml (globally unique)
- UNIVERSAL blocks prefix: no prefix (universal vocabulary)
- All other tag blocks prefix with tag name: `api-rate-limiting`, `library-versioning`, etc.
- Folder structure entries from multiple tags are union-merged (no duplicates)
- Hook files from multiple tags accumulate — pre-commit chain runs all of them
- NFR sections from multiple tags are concatenated in the output document

Blocks with the same ID CANNOT coexist — loader.ts throws if two tags declare the same block ID.
This makes conflicts detectable at startup, not at generation time.

## Consequences

Positive:
- Any combination of tags produces a coherent, non-contradictory output
- Tag authors need no knowledge of other tags
- Adding a new tag to an existing project is safe (append, not replace)

Negative / Trade-offs:
- Very long CLAUDE.md for projects with many tags (acceptable — context window grows)
- Requires globally unique block IDs (enforced by validator)
- No concept of "overriding" a universal block with a more specific version
