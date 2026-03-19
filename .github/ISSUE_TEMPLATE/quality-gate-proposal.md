---
name: Quality Gate Proposal
about: Propose a new quality gate, hook, or instruction block for the ForgeCraft library
title: "[GATE] "
labels: gate-proposal
assignees: ""
---

<!--
Thank you for contributing to the quality gate library.

Accepted proposals receive Pro access:
- Founding period (first 6 months of the program): 3 months Pro
- After founding period: 1 month Pro per accepted gate
- 3+ accepted gates: Lifetime Pro

You will be added to CONTRIBUTORS.md when your gate is merged.
Pro access will be granted when the ForgeCraft server launches (tracked in CONTRIBUTORS.md).
-->

## Gate name

<!-- Short, intention-revealing name. Examples: "no-raw-sql-in-handlers", "venv-reuse-check", "docker-single-instance" -->

## Tag(s) this applies to

<!-- Which project tags should receive this gate? UNIVERSAL applies to all projects. -->

- [ ] UNIVERSAL
- [ ] API
- [ ] WEB-REACT
- [ ] CLI
- [ ] LIBRARY
- [ ] DATA-PIPELINE
- [ ] ML
- [ ] Other: <!-- specify -->

## What problem does this catch?

<!-- Describe the failure mode this gate prevents. Be specific — what goes wrong without this gate, and how often does it happen in real AI-assisted development? -->

## Proposed check / hook

<!-- Show the actual check. This can be a shell snippet, a regex pattern, a file existence check, or an instruction block. -->

```bash
# Example hook snippet
```

Or an instruction block to add to CLAUDE.md:

```
# Example rule
- Before doing X, always check Y.
- Never Z without confirming W.
```

## Why this belongs in the library

<!-- Why is this general enough to apply across projects with this tag, not just your specific project? -->

## GS property this strengthens

<!-- Which of the 7 GS properties does this improve? -->

- [ ] Self-Describing
- [ ] Bounded
- [ ] Verifiable
- [ ] Defended
- [ ] Auditable
- [ ] Composable
- [ ] Executable

## Evidence from real usage

<!-- Optional but strongly preferred: describe a real situation where the absence of this gate caused a problem. The hygiene gates (VS Code extensions, Docker containers, Python venvs) were all discovered this way. -->
