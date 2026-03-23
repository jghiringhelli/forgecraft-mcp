# Use Cases

## UC-001: Onboard a New or Existing Project

**Actor**: Developer setting up a project for the first time
**Precondition**: Project directory exists; may or may not have existing source files
**Steps**:
1. Developer calls `setup_project` with `project_dir` pointing to the root
2. ForgeCraft analyses the project (language, framework, existing files)
3. ForgeCraft asks calibration questions (MVP stage, scope completeness, consumers)
4. ForgeCraft generates scaffold: CLAUDE.md sentinel, `.claude/standards/` domain files, `docs/` stubs, pre-commit hooks, `forgecraft.yaml`

**Success**: Project has a populated `forgecraft.yaml`, CLAUDE.md, and `docs/` structure; developer can immediately run `check_cascade`

---

## UC-002: Verify GS Cascade Readiness

**Actor**: Developer or AI assistant before starting an implementation session
**Precondition**: Project has been onboarded (`forgecraft.yaml` and `docs/` exist)
**Steps**:
1. Developer calls `check_cascade` with `project_dir`
2. ForgeCraft checks all 5 GS initialization steps: functional spec, architecture diagrams, CLAUDE.md constitution, ADRs, behavioral contracts
3. ForgeCraft returns per-step PASS / FAIL / STUB / WARN with actionable remediation

**Success**: All required steps pass; developer can proceed to `generate_session_prompt` or implementation

---

## UC-003: Generate a Bound Session Prompt for a Roadmap Item

**Actor**: Developer or AI assistant before each implementation session
**Precondition**: `check_cascade` passes; `docs/roadmap.md` exists with at least one incomplete item
**Steps**:
1. Developer calls `generate_session_prompt` with `project_dir` and `item_description`
2. ForgeCraft reads Status.md, roadmap.md, PRD.md, use-cases.md
3. ForgeCraft produces a session-scoped prompt with task, acceptance criteria, ADR context, spec sections, scope boundary

**Success**: AI assistant receives a fully bound prompt and implements the roadmap item without scope drift

---

## UC-004: Audit Project Standards Compliance

**Actor**: Developer or CI pipeline
**Precondition**: Project has been onboarded; source files exist
**Steps**:
1. Developer calls `audit` with `project_dir`
2. ForgeCraft scans source for anti-patterns, missing JSDoc, hardcoded values, layer violations, file length violations
3. ForgeCraft returns a compliance score with per-violation details and file/line references

**Success**: Actionable violations surfaced; developer can address them before the next cycle

---

## UC-005: Close a Development Cycle

**Actor**: Developer after completing a set of roadmap items
**Precondition**: All targeted roadmap items are implemented and tests pass
**Steps**:
1. Developer calls `close_cycle` with `project_dir`
2. ForgeCraft re-runs `check_cascade` to confirm spec integrity
3. ForgeCraft evaluates all active quality gates against current project state
4. ForgeCraft identifies gates promotable to the community registry

**Success**: Developer receives a go/no-go signal per gate and a list of gates ready to contribute back
