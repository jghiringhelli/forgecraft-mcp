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

**Working on CI/CD, hooks, or deployment**
→ `.claude/standards/cicd.md`
→ `.claude/standards/protocols.md`

**Working on ecosystem, dependencies, or security**
→ `.claude/standards/ecosystem.md`

**Reviewing communication or formatting**
→ `.claude/standards/communication-protocol.md`

## Navigation Rule
Load only the branches relevant to the current task. Loading everything defeats the purpose.
State is always current — `.claude/state.md` is overwritten on every `close_cycle` run.
