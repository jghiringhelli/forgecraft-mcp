# ADR-0006 — Merge-Not-Overwrite for Instruction File Generation

**Date:** 2026-03-09
**Status:** accepted

## Context

When `setup_project` or `refresh_project` regenerates CLAUDE.md, it overwrites the
file. Projects accumulate custom sections: Corrections Log, project-specific identity,
handwritten architecture notes. If regeneration erases these, users stop using
ForgeCraft (or stop accepting updates).

Two strategies:
1. **Full replacement**: Regenerated content always wins. Simple, predictable, but
   destroys customizations.
2. **Section-aware merge**: ForgeCraft-managed sections are replaced; custom sections
   (not in the template) are preserved in their original position.

## Decision

**Section-aware merge via `writeInstructionFileWithMerge`.**

Rules:
- A section is "ForgeCraft-managed" if its heading matches a generated block ID
- A section is "custom" if it has no corresponding template block
- On regeneration: managed sections are regenerated; custom sections are appended at the end
- Custom sections are preserved in original order, below the generated content
- The ForgeCraft management comment includes a timestamp so users can see when it was last run

Implementation: `src/shared/filesystem.ts` — `writeInstructionFileWithMerge()`

Custom sections that survive regeneration:
- `## Corrections Log`
- `## Project Identity` (after variable substitution)
- Any section not matching a template block ID

## Consequences

Positive:
- Users can safely run refresh_project without losing their customizations
- The ForgeCraft/custom boundary is explicit (comment in file)
- Corrections survive model updates — users don't lose learned behaviors

Negative / Trade-offs:
- Merge logic must correctly identify section boundaries (H2 boundary detection)
- If user renames a template section heading, it becomes "custom" and duplicates on next run
- Complexity in the merge algorithm (acceptance-tested)
