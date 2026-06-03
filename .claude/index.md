# Context Index
_Read this file first. Load core.md always. Navigate to relevant branch for the task._

## Always Load
- `.claude/core.md` — invariants, architectural rules, non-negotiables
- `.claude/state.md` — current project state (written by close_cycle, live)

## Navigate by Task Type

**Implementing a feature or fix**
→ `.claude/standards/spec.md` (use cases, ADR protocol, TDD gate)
→ `.claude/standards/testing.md` (test pyramid, adversarial posture)

**Working on quality gates or GS properties**
→ `.claude/standards/quality-gates.md`
→ `.claude/standards/spec.md`

**Working on API, MCP tools, or schemas**
→ `.claude/standards/api.md`
→ `.claude/standards/architecture.md`
→ `docs/architecture/modules.md` (module ownership registry)

**Working on layers, boundaries, or module structure**
→ `docs/architecture/layers.md` (boundary rules + invariants)
→ `docs/architecture/modules.md`

**Working on data model, forgecraft.yaml schema, or templates**
→ `docs/architecture/data-model.md` (schema definitions + ERD)

**Working on external integrations, MCP transport, or network**
→ `docs/architecture/integrations.md`

**Working on CI/CD, hooks, or deployment**
→ `.claude/standards/cicd.md`
→ `.claude/standards/protocols.md`

**Working on ecosystem, dependencies, or security**
→ `.claude/standards/ecosystem.md`

**Reviewing communication or formatting**
→ `.claude/standards/communication-protocol.md`

## Doc Obligation Table
_Before writing code, read. After writing, produce._

| You are about to... | Read first | Produce after |
|---|---|---|
| Add a feature | `docs/PRD.md` + relevant use case in `docs/use-cases.md` | Spec decision record in `docs/specs/` |
| Change architecture or layer structure | `docs/architecture/layers.md` + `docs/adrs/` index | ADR in `docs/adrs/active/` |
| Change a module boundary or ownership | `docs/architecture/modules.md` | Update `docs/architecture/modules.md` + ADR if non-obvious |
| Change forgecraft.yaml schema or template YAML | `docs/architecture/data-model.md` | Update schema section + ERD if entities changed |
| Change an external integration | `docs/architecture/integrations.md` | Update integration entry + ADR if protocol changes |
| Fix a bug | Linked use case + failing test | Regression note in use case acceptance criteria |
| Implement a use case | Use case in `docs/use-cases.md` + linked spec | Link source file to use case via `@gs-links` frontmatter |
| Add or change a hook | `docs/architecture/integrations.md` (hook contract) | Update hook docs in `.claude/standards/cicd.md` |

## @gs-links Convention
Source files that implement a spec or ADR decision carry this comment at the top:
```
// @gs-links: docs/use-cases/uc-NNN.md, docs/adrs/active/NNNN-slug.md
```
The doc-cascade hook verifies that when a `@gs-links` source file changes, its linked docs were also touched in the same commit or a `docs/change-manifest.md` is staged.

## Navigation Rule
Load only the branches relevant to the current task. Loading everything defeats the purpose.
State is always current — `.claude/state.md` is overwritten on every `close_cycle` run.
