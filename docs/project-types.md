# ForgeCraft Project Types

ForgeCraft supports four project lifecycle patterns. `setup_project` auto-detects greenfield vs brownfield.

## Greenfield

**Starting state:** spec document only (or idea in your head)
**What ForgeCraft does:** derives the full cascade from spec → architecture → roadmap → agile loops → hardening
**Pilot:** Storycraft (docs/specs/STORYCRAFT_SPEC_v2.md → full application)

## Brownfield

**Starting state:** working codebase, no or minimal docs
**What ForgeCraft does:** scans existing code, generates reverse-PRD stub, asks brownfield calibration questions, creates missing cascade docs without touching existing code, sets brownfield: true in forgecraft.yaml
**Pilot:** gs-workshop-linkboard, gs-workshop-taskflow

## Takeover

**Starting state:** broken or unmaintained codebase
**What ForgeCraft does:** same as brownfield — the cascade documents become the target architecture. Roadmap items are refactoring tasks.
**Key difference from brownfield:** tests don't pass at start; roadmap starts with "stabilise existing tests"

## Migration

**Starting state:** existing codebase you want to rewrite cleanly
**What ForgeCraft does:** generate a spec FROM the existing code (reverse-PRD + manual review), then treat as greenfield in a new folder/repo
**Steps:** run setup_project on old repo → review reverse-PRD → refine spec → create new repo → run setup_project on new repo with refined spec
