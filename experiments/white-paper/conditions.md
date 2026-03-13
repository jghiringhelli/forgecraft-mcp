# Experimental Conditions

Three conditions, same benchmark (RealWorld Conduit API in TypeScript), same model (claude-sonnet-4-5).

---

## Condition 1: Naive

**Design intent:** Baseline. No structure, no guidance. Represents *vibe coding*: the actual  
pattern in most organizations where AI tools are pushed to junior developers (and non-engineers)  
without structured methodology, while senior engineers are still catching up on AI adoption.

**What the model received:**
- The RealWorld API spec (`REALWORLD_API_SPEC.md`)
- A 3-line README: "Build a REST API for Conduit. Use Node.js and TypeScript."

**Prompt style:** Feature-by-feature (6 prompts), each 2–4 lines. No architecture, no error  
format, no test requirements, no layer rules, no stack specification.

**Example prompt:**
```
Set up the project and implement user authentication.
Users should be able to register, log in, get their profile, and update it.
Make sure authentication works with JWT tokens.
```

**Files:** `experiments/naive/README.md`, `experiments/naive/prompts/`

**Status:** Complete. Session `236a3efd-94ba-45af-b399-bca79f4b1e2e`, March 13 2026.
Result: 5/12 GS audit score. **0% real coverage** — all test suites fail TS2339 compilation
errors (Article/Comment/Tag/Favorite models absent from schema due to annotation failure).
See [conclusions.md §5](./conclusions.md) for the annotation failure analysis.

---

## Condition 2: Control (Expert Prompting)

**Design intent:** Best-practice prompting as a skilled senior engineer would write.  
No GS artifacts — only inline text guidance in the README and prompts.  
This is the comparison point for GS: is GS better than *good* human prompting?

**What the model received:**
- The RealWorld API spec
- A detailed README: tech stack (Node/TS/Express/Prisma/Jest/Zod), layered architecture  
  diagram with hard boundary rules, error format (`{"errors": {"body": [...]}}` / HTTP 422),  
  naming conventions, test naming style, coverage target (80%)
- 7 prompts, each 20–40 lines with architectural requirements per feature

**Example prompt excerpt:**
```
Route files must NOT call prisma. directly — use a UserRepository class.
Validate all inputs with Zod; return {"errors": {"body": ["..."]}} on failure.
Hash passwords with bcryptjs (12 rounds — use a named constant, not a magic number).
```

**Files:** `experiments/control/README.md`, `experiments/control/prompts/`

**Results:** 8/12 GS audit score. 34.12% real coverage (52/186 tests pass).

---

## Condition 3: Treatment (Generative Specification)

**Design intent:** Full GS artifact cascade. The model receives the same problem plus a  
complete structured specification: CLAUDE.md, ADRs, C4 diagrams, NFRs, pre-defined schema,  
test architecture, and a verification protocol. Prompts are brief (the artifacts carry context).

**What the model received:**
- The RealWorld API spec
- 17 context files: CLAUDE.md (GS instructions), Status.md, Prisma schema (pre-defined),  
  4 ADRs (stack, auth, layers, errors), C4 context + container + domain-model diagrams,  
  sequence diagrams, use-cases doc, test-architecture doc, NFR doc, TechSpec doc
- 6 prompts, each 6–10 lines — brief because artifacts carry the specification

**Example prompt:**
```
Implement user authentication:
- POST /api/users (register)
- POST /api/users/login (login)
- GET /api/user (get current user, auth required)
- PUT /api/user (update user, auth required)

Before committing: run the Verification Protocol (see CLAUDE.md).
```

**Files:** `experiments/treatment/` (full GS artifact cascade), `experiments/treatment/prompts/`

**Results:** 9/12 GS audit score. 27.63% real coverage (33/33 tests pass — but fewer tests).

---

## Condition Comparison Matrix

| Dimension | Naive | Control | Treatment |
|---|---|---|---|
| Context artifacts | API spec + 3-line README | API spec + detailed README | API spec + 17 GS documents |
| Prompt length (avg) | ~4 lines | ~30 lines | ~8 lines |
| Prompt count | 6 | 7 | 6 |
| Architecture guidance | None | Inline text in README and prompts | GS artifacts (CLAUDE.md, ADRs) |
| Error format specified | No | Yes (inline) | Yes (ADR-004) |
| Pre-defined schema | No | No | Yes (Prisma schema in context) |
| Test requirements | No | Per-feature in prompts | Per-feature + test-architecture doc |
| Commit hooks | No mention | No mention | Specified in CLAUDE.md |
| ADRs | None | None | 4 pre-written |
| GS audit score | PENDING | 8/12 | 9/12 |
