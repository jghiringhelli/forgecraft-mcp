# ADR-0003 — Templates as YAML Data Files

**Date:** 2026-03-07
**Status:** accepted

## Context

ForgeCraft's value is community-maintained best practices. Contributors need to add
templates — new tags, instruction blocks, hooks, review checklists — without writing
TypeScript. Two approaches were considered:

1. **Templates as TypeScript modules**: Strong typing, IDE support, but high barrier
   to community contributions. Contributors must understand the module API.
2. **Templates as YAML files**: Readable by non-developers, diffable in PRs,
   no compilation step, embeds naturally in the package.

## Decision

**Templates are YAML data files. They are never imported as code.**

Structural rule (enforced by the pre-commit anti-pattern hook):
- `templates/**/*.yaml` — pure data, no logic
- `src/registry/loader.ts` — ONLY component that reads YAML
- `src/registry/renderer.ts` — applies variable substitution
- No template file may contain executable code or imports

Community contribution path:
1. Author creates/modifies `templates/<tag>/<section>.yaml`
2. Adds test in `tests/registry/` asserting the YAML loads and renders correctly
3. Submits PR — maintainer reviews YAML content, not TypeScript

## Consequences

Positive:
- Designer or project manager with no TypeScript knowledge can add a new tag
- PR diffs are readable by anyone
- Template errors fail at load time with clear messages (not at handler invocation)

Negative / Trade-offs:
- No TypeScript type safety in template files (mitigated by Zod validation at load time)
- Template authors cannot add conditional logic (by design — keeps templates as pure data)
- Complex block composition must be done in renderer.ts, not in templates
