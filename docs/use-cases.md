# Use Cases

Formal use case registry for ForgeCraft MCP. Each entry follows the GS behavioral contract format.
Machine-checkable acceptance criteria correspond to L2 harness probes in `.forgecraft/harness/`.

---

## UC-001: Setup/Onboard Project

**Actor**: Developer onboarding a new or existing project
**Precondition**: Project directory exists; may or may not have existing source files
**Trigger**: `setup_project` with `project_dir`; optionally `spec_path` or `spec_text` for phase 1, and `mvp`, `scope_complete`, `has_consumers` for phase 2
**Main Flow**:
  1. Phase 1 — Developer calls `setup_project` with `project_dir`; ForgeCraft analyses project structure, infers language/framework, reports calibration questions
  2. Phase 2 — Developer calls `setup_project` again with calibration answers (`mvp`, `scope_complete`, `has_consumers`)
  3. ForgeCraft generates scaffold: CLAUDE.md sentinel, `.claude/standards/` domain files, `docs/` stubs, pre-commit hooks, `forgecraft.yaml`
  4. ForgeCraft returns confirmation with list of created files and recommended next action
**Postcondition**: Project has a populated `forgecraft.yaml`, CLAUDE.md sentinel, `docs/` structure, and pre-commit hooks; `check_cascade` can be run immediately
**Error Cases**:
  - `project_dir` does not exist: System returns error listing the missing path
  - Phase 2 called without prior phase 1: System proceeds with defaults and warns that calibration was skipped
**Acceptance Criteria** (machine-checkable):
  - [ ] `forgecraft.yaml` exists at project root after phase 2
  - [ ] `CLAUDE.md` exists at project root after phase 2
  - [ ] `docs/` directory exists after phase 2
  - [ ] Pre-commit hook script exists at `.git/hooks/pre-commit` or `.forgecraft/hooks/`
  - [ ] `check_cascade` returns at least one PASS step after setup completes

---

## UC-002: Verify GS Cascade

**Actor**: Developer or AI assistant before starting an implementation session
**Precondition**: Project has been onboarded (`forgecraft.yaml` and `docs/` exist)
**Trigger**: `check_cascade` with `project_dir`
**Main Flow**:
  1. ForgeCraft reads `forgecraft.yaml` cascade decisions and applies any overrides
  2. ForgeCraft checks all 5 GS initialization steps: functional spec, architecture diagrams, CLAUDE.md constitution, ADRs, behavioral contracts
  3. ForgeCraft returns per-step PASS / FAIL / STUB / WARN / SKIP with actionable remediation
  4. Steps marked SKIP via `set_cascade_requirement` are shown as optional
**Postcondition**: Caller knows which steps pass, which fail, and what to do for each failure
**Error Cases**:
  - `forgecraft.yaml` missing: System returns cascade as unconfigured; all steps shown as FAIL
  - `docs/` directory missing: functional_spec and behavioral_contracts steps fail with guidance
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains `functional_spec` step result
  - [ ] Output contains `constitution` step result
  - [ ] Output contains `adrs` step result
  - [ ] A fully scaffolded project returns at least 3/5 steps passing
  - [ ] SKIP steps are labeled as optional in the output

---

## UC-003: Generate Bound Session Prompt

**Actor**: Developer or AI assistant before each implementation session
**Precondition**: `check_cascade` passes required steps; `docs/roadmap.md` exists with at least one incomplete item
**Trigger**: `generate_session_prompt` with `project_dir` and `item_description`; optionally `acceptance_criteria`, `scope_note`, `session_type`
**Main Flow**:
  1. ForgeCraft confirms cascade is ready (reads forgecraft.yaml + docs/)
  2. ForgeCraft reads Status.md, roadmap.md, PRD.md, use-cases.md to build context
  3. ForgeCraft produces a session-scoped prompt with: task statement, acceptance criteria, ADR context, spec section references, scope boundary, and test command
  4. ForgeCraft returns the bound prompt as a text block ready to paste into an AI session
**Postcondition**: Caller receives a fully bound prompt scoped to the roadmap item; AI session stays within spec boundaries
**Error Cases**:
  - Cascade not ready: System returns blocking message listing failing required steps
  - `item_description` missing: System returns error requesting the parameter
  - `docs/roadmap.md` missing: System proceeds without roadmap context and warns
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains the `item_description` text
  - [ ] Output contains a scope boundary statement
  - [ ] Output contains acceptance criteria (provided or generated)
  - [ ] Output contains the detected test command
  - [ ] Cascade gate is enforced — blocked when required steps fail

---

## UC-004: Audit Compliance

**Actor**: Developer or CI pipeline
**Precondition**: Project has been onboarded; source files exist
**Trigger**: `audit` with `project_dir` and `tags`; optionally `include_anti_patterns`
**Main Flow**:
  1. ForgeCraft runs completeness checks against project tags (CLAUDE.md, Status.md, hooks, docs stubs)
  2. ForgeCraft scans source files for anti-patterns: hardcoded URLs, hardcoded credentials, mock data in source
  3. ForgeCraft audits CNT structural health when CNT is present
  4. ForgeCraft returns a compliance score (0–100), categorized passing/failing checks, and recommendations
**Postcondition**: Caller has an actionable compliance report with per-violation details; score drives promotion decisions
**Error Cases**:
  - `tags` not supplied and not in forgecraft.yaml: System returns error requesting tags
  - Source directory not readable: Anti-pattern scan is skipped; completeness checks proceed
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains a numeric score (0–100)
  - [ ] Output contains at least one "Passing" or "Failing" section
  - [ ] Anti-pattern violations reference the file and pattern name
  - [ ] Recommendations section appears when violations exist

---

## UC-005: Close Development Cycle

**Actor**: Developer after completing a set of roadmap items
**Precondition**: All targeted roadmap items are implemented and tests pass
**Trigger**: `close_cycle` with `project_dir`
**Main Flow**:
  1. ForgeCraft re-runs `check_cascade` to confirm spec integrity
  2. ForgeCraft evaluates all active quality gates against current project state
  3. ForgeCraft identifies gates with `generalizable: true` that can be contributed back
  4. ForgeCraft returns go/no-go per gate and a list of gates ready to contribute
**Postcondition**: Developer has a signed-off cycle report; generalizable gates are queued for contribution
**Error Cases**:
  - Cascade fails required step: Cycle is blocked; system lists which steps must pass first
  - No quality gates found: System returns minimal report with cascade results only
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains cascade re-check result
  - [ ] Output contains gate evaluation summary
  - [ ] Generalizable gates are listed with their contribution status
  - [ ] Cycle is blocked when a required cascade step fails

---

## UC-006: Check Layer Status

**Actor**: Developer or AI assistant tracking automation depth
**Precondition**: `docs/use-cases.md` exists (does not require `forgecraft.yaml`)
**Trigger**: `layer_status` with `project_dir`
**Main Flow**:
  1. ForgeCraft parses `docs/use-cases.md` and extracts UC-NNN records
  2. ForgeCraft checks L1 completion (UC documented, tests found) for each UC
  3. ForgeCraft checks L2 completion (`.forgecraft/harness/uc-NNN.yaml` exists) for each UC
  4. ForgeCraft evaluates L3 (CI, env schema, deployment config) and L4 (health probes, drift detection) project-wide
  5. ForgeCraft returns a layer report with per-UC status tables and a summary with next action
**Postcondition**: Caller knows which UCs have L2 probes, which are missing, and what to do next
**Error Cases**:
  - `docs/use-cases.md` missing: System returns "no use cases found" and guidance on creating the file
  - Harness file unreadable: L2 shows probe present but probe types show empty
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains L1, L2, L3, and L4 sections
  - [ ] Each UC row shows ✅ or ❌ for probe presence
  - [ ] L2 coverage percentage is shown
  - [ ] "Next action" line identifies the highest-priority gap
  - [ ] Tool works when `forgecraft.yaml` is absent

---

## UC-007: Contribute Quality Gate

**Actor**: Developer sharing a reusable gate with the ForgeCraft community
**Precondition**: Project has at least one gate in `.forgecraft/gates/active/` with `generalizable: true`
**Trigger**: `contribute_gate` with `project_dir`; optionally `dry_run`
**Main Flow**:
  1. ForgeCraft reads all active gates and filters for `generalizable: true`
  2. ForgeCraft checks previously submitted gates to avoid duplicates
  3. ForgeCraft formats the gate as a contribution and submits to the registry (or queues when offline)
  4. ForgeCraft returns submitted/skipped/queued counts with gate IDs
**Postcondition**: Generalizable gates are submitted or queued; skipped gates list the reason (already submitted, not generalizable)
**Error Cases**:
  - No generalizable gates found: System returns "nothing to contribute" and hints for marking gates generalizable
  - Registry unreachable: Gates are queued in `.forgecraft/pending-contributions.jsonl`
**Acceptance Criteria** (machine-checkable):
  - [ ] Output lists submitted, skipped, and queued gate counts
  - [ ] Gates without `generalizable: true` are skipped
  - [ ] Dry run mode returns preview without writing any files
  - [ ] Previously submitted gates are not re-submitted

---

## UC-008: Read Gate Violations

**Actor**: Developer or AI assistant investigating quality failures
**Precondition**: `.forgecraft/gate-violations.jsonl` exists and contains at least one entry
**Trigger**: `read_gate_violations` with `project_dir`
**Main Flow**:
  1. ForgeCraft reads `.forgecraft/gate-violations.jsonl` line by line
  2. ForgeCraft parses each JSONL entry and applies active/resolved classification
  3. ForgeCraft returns active violations (unresolved since last commit) and resolved ones separately
  4. ForgeCraft formats each violation with hook name, message, file, and timestamp
**Postcondition**: Caller has a structured list of active gate violations with enough context to fix each one
**Error Cases**:
  - Violations file missing: System returns "no violations recorded" — not an error
  - Malformed JSONL line: Line is skipped; system notes parse errors in output
**Acceptance Criteria** (machine-checkable):
  - [ ] Output separates active and resolved violations
  - [ ] Each active violation shows hook name and message
  - [ ] Missing violations file returns graceful "no violations" message
  - [ ] Violation count matches entries in the file

---

## UC-009: Verify GS Properties

**Actor**: Developer or CI pipeline validating specification properties
**Precondition**: Project has test files; package.json or equivalent build file exists
**Trigger**: `verify` with `project_dir`; optionally `test_command`, `timeout_ms`, `pass_threshold`
**Main Flow**:
  1. ForgeCraft runs the test suite using the detected or specified test command
  2. ForgeCraft scores the seven GS properties (§4.3) against test results and project structure
  3. ForgeCraft returns per-property scores, total score vs. threshold, and pass/fail verdict
  4. ForgeCraft surfaces which properties are below threshold with remediation hints
**Postcondition**: Caller has a GS property score (0–14) and knows which properties need improvement
**Error Cases**:
  - Test command not found: System returns error with guidance on specifying `test_command`
  - Tests time out: System returns timeout result with partial score
  - No tests found: All behavioral properties score 0; structural properties may still pass
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains a total score (0–14)
  - [ ] Output contains per-property results for all 7 GS properties
  - [ ] Pass/fail verdict is explicit against the configured threshold
  - [ ] Timeout case returns a non-throwing result

---

## UC-010: Generate ADR

**Actor**: Developer recording an architectural decision
**Precondition**: `project_dir` exists; `docs/adrs/` directory is writeable
**Trigger**: `generate_adr` with `project_dir` and `adr_title`; optionally `adr_context`, `adr_decision`, `adr_alternatives`, `adr_consequences`
**Main Flow**:
  1. ForgeCraft reads existing ADRs in `docs/adrs/` to determine next sequence number
  2. ForgeCraft formats the ADR using the standard template with provided fields
  3. ForgeCraft writes the ADR file as `docs/adrs/ADR-NNNN-<slug>.md`
  4. ForgeCraft returns the path and a summary of the ADR content
**Postcondition**: A new ADR file exists in `docs/adrs/` with the correct sequence number; cascade `adrs` step will pass
**Error Cases**:
  - `adr_title` missing: System returns error requesting the parameter
  - `docs/adrs/` not writeable: System returns error with the filesystem message
  - Sequence number collision: System auto-increments to the next available number
**Acceptance Criteria** (machine-checkable):
  - [ ] ADR file is created at `docs/adrs/ADR-NNNN-<slug>.md`
  - [ ] File contains the title, date, and status fields
  - [ ] Sequence number is one higher than the last existing ADR
  - [ ] `check_cascade` `adrs` step passes after the file is created
