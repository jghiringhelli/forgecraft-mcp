# ForgeCraft vs. GS Theory — Tooling Cross-Check

**Version:** 1.0 — March 2026  
**Status:** Active Gap Analysis  
**Purpose:** Systematically compare what ForgeCraft currently enforces against what the GS theory requires, per §6 Artifact Grammar, §4.3 Six Properties, and §§6.2–6.7 Cascade Procedures of the white paper. Identify gaps. Produce a prioritized development backlog.

**Method:** For each required element, rate ForgeCraft's current enforcement:
- ✅ **Full** — ForgeCraft generates, enforces, or validates this element
- 🔶 **Partial** — ForgeCraft gestures at this element but does not fully enforce it
- ❌ **Absent** — ForgeCraft does not address this element at all

---

## 1. Artifact Grammar Cross-Check (§6, Table)

The paper's taxonomy lists 13 artifact types with their linguistic analogs. ForgeCraft must be able to generate or scaffold each.

| GS Artifact | Linguistic Analog | ForgeCraft Coverage | Notes |
|---|---|---|---|
| Architectural constitution (`CLAUDE.md` / agent-equivalent) | Grammar rules | ✅ Full | `setup_project`, `refresh_project`, `generate_instructions`. Core capability. Compression protocol at 250–300 line threshold is documented in templates. |
| Architecture Decision Records (ADRs) | Etymology + rule changelog | 🔶 Partial | `scaffold_project` creates `docs/adr/` directory. No ADR generation tool. No on-session trigger ("write the ADR for this decision"). No supersession workflow. |
| C4 diagrams / structural diagrams | Syntax tree | 🔶 Partial | `scaffold_project` creates `docs/diagrams/`. No Mermaid generation. No validation that diagrams exist before implementation begins. |
| Sequence diagrams, state machines, user flows | Sentence patterns with temporal order | ❌ Absent | Not scaffolded separately from diagrams/. No generation, no validation. |
| Use cases | Production rules for behavior | 🔶 Partial | `use-case-triple-derivation` block in UNIVERSAL/recommended explains the pattern. No use case generation tool. No `docs/use-cases.md` created by default. |
| Schema definitions (database, API, event) | Type system / lexicon | 🔶 Partial | API tag enforces schema-first for API contracts. No schema generation tool. No validation that schema exists before implementation. |
| Living documentation (derived) | Compiled output | 🔶 Partial | `living-documentation` block in UNIVERSAL/recommended covers the doctrine. No tooling to scaffold OpenAPI/TypeDoc/Storybook derivation pipelines. |
| Intentional naming conventions | Word choice | ✅ Full | Naming section in every constitutional template. `artifact-grammar` block has naming-as-grammar with layer-scoped vocabulary table. Layer violation check in `audit_project`. |
| Package and module hierarchy | Phrase structure rules | 🔶 Partial | `scaffold_project` creates folder structure. Structure is static per tag — no dynamic derivation from functional spec. |
| Conventional atomic commits | Typed corpus with morphology | ✅ Full | Commit hooks in every UNIVERSAL setup. `pre-commit-conventional.sh` enforces format. Commit protocol in every CLAUDE.md. |
| Test suite (TDD / adversarial) | Semantic validation + adversarial probe | 🔶 Partial | Test taxonomy blocks per tag are comprehensive. Adversarial posture is documented. No TDD gate that *requires* tests to be written before implementation begins (only coverage enforcement). |
| Commit hooks and quality gates | Parser rejection rules | ✅ Full | `add_hook` tool. 7-hook chain. Templates include hook configuration per tag. |
| MCP tools and environment tooling | Runtime environment | ✅ Full | `configure_mcp` tool. MCP server budget (≤3) documented in templates. |

**Artifact grammar score: 5 full / 6 partial / 2 absent**

---

## 2. Six Properties Cross-Check (§4.3)

ForgeCraft's `audit_project` already scores these. This section assesses whether ForgeCraft's enforcement mechanisms match the property definitions precisely.

### 2.1 Self-Describing

**Theory definition:** A stateless reader given the artifact set alone can determine what the system is, what rules govern it, and what it must do — without requiring any human to explain it.

**ForgeCraft enforcement:**
- ✅ `setup_project` generates a constitutional document that names the project, its stack, its domain, and its architectural rules
- ✅ `audit_project` checks for constitutional completeness
- 🔶 The constitution is not validated for *completeness against what the system actually does* — ForgeCraft can generate a complete-looking CLAUDE.md for a project whose functional specification has never been written

**Gap:** No tool asks "does a functional specification exist that describes the user-facing behavior?" before any implementation session begins. The constitution alone is not sufficient for Self-describing; a tech spec covering behavioral scope is also required. ForgeCraft does not scaffold or require the tech spec.

**Required addition:** `setup_project` should check or prompt for the existence of a tech spec / functional specification. `audit_project` should score Self-describing as partial if the constitution exists but no behavioral specification does.

---

### 2.2 Bounded

**Theory definition:** Outputs are constrained to a well-defined scope; agents cannot generate implementations that cross layer boundaries, violate naming contracts, or introduce scope outside what the specification defines.

**ForgeCraft enforcement:**
- ✅ CLAUDE.md templates include layer rules as explicit forbidden patterns
- ✅ `audit_project` includes an anti-pattern scan for layer violations
- 🔶 Layer violation detection is grep-based and TypeScript-centric (Session 11 expanded it, but it's still heuristic)
- ❌ No enforcement of *scope bounds* — what is and is not in scope for the current session

**Gap:** The Bounded property has two dimensions: architectural boundary (layer rules) and scope boundary (what this session should and should not build). ForgeCraft enforces the first. No ForgeCraft tool addresses the second. The bound roadmap with session-scoped prompts is the practitioner manual's mechanism for scope bounding, but ForgeCraft has no `generate_session_prompt` or prompt-binding tool.

**Required addition:** A `generate_session_prompt` tool that takes a roadmap item description and the current artifact set and produces a bound prompt (specification references, precondition, scope, acceptance criteria, commit message format). This is the missing link between the spec cascade and individual session execution.

---

### 2.3 Verifiable

**Theory definition:** Every output can be automatically verified for correctness. Tests exist for every behavioral contract. Coverage is enforced on every commit.

**ForgeCraft enforcement:**
- ✅ Test taxonomy blocks are comprehensive and per-tag
- ✅ Coverage gate hook (`pre-commit-coverage.sh`)
- ✅ TDD posture documented in all constitutions
- 🔶 Mutation testing is documented in `gs-test-techniques` but not scaffolded or setup by `add_hook`
- 🔶 The adversarial posture ("write tests to fail, not to pass") is documented but not prompted at session start

**Gap:** The `add_hook` tool has no mutation testing hook. Mutation testing is the adversarial audit of the test suite — the paper identifies it as "the adversarial audit of the audit" for AI-generated test suites. Given that ForgeCraft users will have AI-generated test suites, this is a high-priority missing hook.

**Required addition:** `add_hook` for Stryker (TS), mutmut (Python), cargo-mutants (Rust) — runnable on-demand (pre-release gate, not pre-commit). One-command mutation run with threshold assertion.

---

### 2.4 Defended

**Theory definition:** The architecture makes incorrect states structurally unreachable. Pre-commit hooks reject non-conforming input. Constraints are enforced by the process, not by human vigilance.

**ForgeCraft enforcement:**
- ✅ Pre-commit hook chain is the strongest current capability
- ✅ `add_hook` tool adds per-hook enforcement
- ✅ Coverage gate enforces the Verifiable property mechanically
- ❌ No derivability gate — no ForgeCraft tool checks that the initialization cascade is *complete* before implementation begins

**Gap:** The paper's derivability criterion (§4.3, §6.2) states that the cascade must be complete before implementation. ForgeCraft generates the artifacts but does not validate completeness as a blocking gate. A practitioner using ForgeCraft can proceed to implementation with a partial cascade — missing ADRs, missing diagrams, missing use cases — and ForgeCraft does not stop them.

**Required addition:** A `check_cascade` tool (or `setup_project` completion check) that verifies: constitution exists and is under 300 lines, at least one ADR exists, at least one diagram exists, at least one use case or behavior specification exists, a roadmap or Status.md with "next steps" exists. Blocked: any item missing. This is the derivability gate as a pushbutton.

---

### 2.5 Auditable

**Theory definition:** The complete history of decisions, the evolution of the grammar, and the rationale behind every non-obvious choice are recoverable from the artifact set alone, without requiring any participant who was present to explain anything.

**ForgeCraft enforcement:**
- ✅ ADR scaffold and format provided in `adr-protocol` block
- ✅ Status.md template generated by `scaffold_project`
- ✅ Commit discipline enforced by hooks
- 🔶 ADR *creation* is documented but not triggered. No tool detects "you just made a non-obvious architectural decision — write an ADR"
- ❌ No audit of commit history quality (are the commits conventional? do they accumulate into a readable corpus?)

**Gap:** The Auditable property requires both that the artifacts exist and that they are consulted at session start. ForgeCraft has a closing ritual (update Status.md) but no opening ritual that verifies the practitioner has read ADRs and Status.md before beginning implementation. The session opening/closing protocol is in the practitioner manual but is not enforced or prompted by any ForgeCraft tool.

**Required addition:** A `start_session` / `end_session` tool pair that enforces the ritual: start checks that Status.md was updated within a reasonable window and that the practitioner has confirmed which ADRs are relevant to the current task; end verifies Status.md was updated, documentation cascade is complete, and no stale spec artifacts remain.

---

### 2.6 Composable

**Theory definition:** Every module depends on abstractions. Services depend on interfaces, not implementations. Any component can be replaced without affecting the components that depend on it.

**ForgeCraft enforcement:**
- ✅ SOLID principles with Dependency Inversion in every UNIVERSAL constitution
- ✅ Repository pattern and port/adapter architecture documented in templates
- ✅ Anti-pattern scan in `audit_project` catches some violations
- 🔶 Anti-pattern scan is heuristic and stack-limited

**Gap:** Composability audit is the weakest of the six. The current `audit_project` scores it qualitatively. No static analysis of import graphs to verify that dependencies flow inward only. No automated check that services depend on interface types, not concrete classes.

**Required addition:** Import graph analysis (using `depcruise` for TS, `pydeps` for Python) as part of `audit_project`. Flag any import that crosses layer boundaries in the wrong direction. This turns the Composable audit from opinion to measurement.

---

## 3. Cascade Procedure Cross-Check (§§6.2–6.7)

### 3.1 Initialization Cascade (§6.2) — Five Steps

| Step | GS Requirement | ForgeCraft Support | Gap |
|---|---|---|---|
| 1. Functional specification | Must exist before architecture | ❌ Not scaffolded or verified | No tool prompts for or creates a functional spec |
| 2. Architecture + C4 diagrams | Must precede CLAUDE.md | 🔶 `scaffold_project` creates dirs; no generation | Diagrams directory exists; no content generated or verified |
| 3. Architectural constitution | The grammar | ✅ `setup_project` | Core capability |
| 4. ADR initialization | Before implementation | 🔶 Directory scaffold only | No ADR generation; no pre-implementation gate |
| 5. Use cases + bound prompts | Before any session | 🔶 Doc + dir only | No use case generation; no bound prompt generation |

**Cascade completeness enforced: 1 of 5 steps fully covered.** The constitution generation is comprehensive. Everything before and after it is unscaffolded or directory-only.

### 3.2 Incremental Cascade (§6.4) — CIA + Propagation

ForgeCraft has no tooling here. Change Impact Assessment, minimum cascade depth determination, and upward-then-downward propagation are practitioner manual procedures. No `analyze_change_impact` tool exists.

This is a medium-priority gap. The procedure is well-defined; the tooling automation is achievable: given a changed file or specification element, identify all upstream artifacts that reference it and all downstream artifacts that must be updated.

### 3.3 Loop Gate Checking (§6.5)

No ForgeCraft tool verifies loop gate conditions:
- Initialization loop gate (derivability): no `check_cascade` tool
- Incremental loop gate (session loop invariant): no `check_session_close` tool
- Pre-release loop gate (release candidate criteria): documented in test architecture templates but not enforced
- Hotfix loop gate (post-stabilization cascade): no protocol

### 3.4 Test Architecture as First-Class Artifact (§6.6)

- ✅ Test taxonomy blocks are comprehensive and per-tag
- ✅ Adversarial techniques are documented (`gs-test-techniques` in UNIVERSAL)
- 🔶 Expose-store-to-window and vertical chain test are documented but not scaffolded
- ❌ No automated generation of a test architecture document (a `generate_test_arch` tool that reads the stack and produces a `docs/test-architecture.md` matching the pyramid, thresholds, and pipeline placement)

### 3.5 Use Cases, Diagrams, and Living Documentation (§6.7)

- 🔶 Directories scaffolded
- ❌ No use case generation from functional specification
- ❌ No diagram generation (even Mermaid stubs)
- 🔶 Living documentation doctrine is in templates; no pipeline scaffolding (OpenAPI, TypeDoc, Storybook derivation setup)

---

## 4. Practitioner Manual — New Content Not Yet in ForgeCraft

The practitioner manual (March 2026) introduced three concepts not yet present in ForgeCraft templates:

| New Concept | Where in Manual | ForgeCraft Status | Priority |
|---|---|---|---|
| Corrections Log format and trigger rule | §2 | ❌ Absent from templates | **High** — CLAUDE.md should include the Corrections Log section by default in all templates |
| Techniques Subsection as activation registry | §2 | ❌ Absent from templates | **High** — CLAUDE.md should have a Techniques section stub; `setup_project` should prompt for domain-specific techniques |
| GS Beyond Code — asset pipelines, infrastructure, business layer | Part X | ❌ Absent | **Medium** — Relevant to GAME, INFRA tags |
| Portfolio management / waiting states | §20 | ❌ Absent | **Low** — Practitioner-level protocol, less suited to automated tooling |

---

## 5. Prioritized Backlog

Ranked by theory-to-tooling impact:

| Priority | Item | Theory Gap Closed | Effort |
|---|---|---|---|
| **P1** | Add Corrections Log + Techniques Subsection to UNIVERSAL CLAUDE.md template | Paper §8.5, Manual §2 | Low — template edit |
| **P1** | `check_cascade` tool — derivability gate checking all five initialization steps | §4.3 Defended, §6.2 | Medium |
| **P1** | `generate_session_prompt` tool — bound prompt from roadmap item + artifact context | §6.3 Bounded, Manual §5 | Medium |
| **P2** | ADR generation tool — triggered by decision event, minimum format, pre-registered alternatives | §8.4, Manual §9 | Medium |
| **P2** | Mutation testing hook (`add_hook stryker / mutmut`) | §6.6 Verifiable | Low — hook addition |
| **P2** | `start_session` / `end_session` ritual enforcement | §8.7 Auditable, Manual §17 | Medium |
| **P3** | Import graph analysis in `audit_project` (`depcruise`, `pydeps`) — Composable property | §4.3 Composable | Medium |
| **P3** | Test architecture document generation (`generate_test_arch`) from stack + tags | §6.6 | Medium |
| **P3** | Functional specification scaffold (`generate_functional_spec`) as step 1 of init cascade | §6.2 | High |
| **P4** | Mermaid diagram generation stubs from architecture context | §6.7 | High |
| **P4** | Use case generation from functional spec | §6.7 | High |
| **P4** | Change impact analysis tool (`analyze_change_impact`) for incremental cascade | §6.4 | High |

---

## 6. Summary Scorecard

| Dimension | Coverage | Assessment |
|---|---|---|
| Artifact grammar (13 types) | 5 full / 6 partial / 2 absent | Constitution, commits, hooks, naming fully covered. Diagrams, use cases, living docs, ADR generation absent. |
| Six properties (6) | 2.5 fully enforced | Naming and Commits are genuinely enforced. Verifiable and Defended are partially enforced. Auditable and Composable are declared but not measured. |
| Cascade procedures (4 loops) | Initialization partially covered; incremental, pre-release, hotfix not covered | The init cascade generates the constitution — step 3 of 5. Steps 1, 2, 4, 5 are directory scaffolding only. |
| Practitioner manual alignment | 4 new concepts not yet in templates | Corrections Log and Techniques sections are highest priority. |

**Overall:** ForgeCraft is a strong P1 tool — it removes the most expensive bootstrap cost (generating a production-grade CLAUDE.md from scratch). The gap is everything around the constitution: the artifacts that precede it (functional spec, diagrams), the artifacts that derive from it (use cases, session prompts), and the gates that enforce its completeness (cascade check, session rituals). The P1 backlog items (Corrections Log, Techniques Subsection, `check_cascade`, `generate_session_prompt`) close the highest-leverage gaps at the lowest implementation cost.
