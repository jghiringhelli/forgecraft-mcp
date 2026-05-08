# ADR-0009: Layer Completion Tracking with Harness Probes

**Date**: 2026-04-16
**Status**: Accepted

## Context
Generative Specification defines six abstraction layers (L1–L6). Without a way to
measure completion at each layer, practitioners cannot estimate automation depth,
identify spec gaps, or know which layer to work on next. The existing cascade check
covers L1 initialization but does not measure ongoing L2 behavioral coverage or
L3/L4 infrastructure state.

## Decision
Introduce a `layer_status` MCP action that reports L1–L4 completion per use case.
L2 completion is defined by the presence of `.forgecraft/harness/uc-NNN.yaml` probe
files — declarative YAML artifacts describing how each use case's postconditions can
be verified through executable probes (MCP calls, Playwright, API calls, DB queries).
A gate (`l2-coverage-gap`) fires when any documented UC lacks a probe.

## Alternatives Considered
- **Dashboard UI**: Rejected. A separate rendering layer adds maintenance burden and
  creates another artifact that can drift from the spec it represents. The AI reads
  `layer_status` output directly and acts on it.
- **Extending cascade check**: Rejected for L2. Cascade is an initialization gate
  (one-time pass); L2 coverage is a continuous metric that grows as probes are added.
  A separate action is cleaner.
- **Storing L2 state in forgecraft.yaml**: Rejected. Probe definitions should be
  artifacts (files with content), not config entries. The filesystem IS the state.

## Consequences
- Practitioners gain a quantified view of automation depth at any point
- `close_cycle` will include layer completion in its report
- `consolidate_status` snapshot includes a layer summary line
- The l2-coverage-gap gate creates structured pressure to add probes as UCs are written
- L5 (BIOISO) deferred to Loom project — not tracked here
