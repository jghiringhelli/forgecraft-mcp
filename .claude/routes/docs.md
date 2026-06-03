<!-- CNT branch: routes/docs | load when navigating documents or before implementing -->

## Navigation Mode

ForgeCraft follows Clean Architecture + TDD. **The contracts are trustworthy.**

- **Read interfaces first.** Types, schemas, and use cases tell you what a module promises.
  Read those before reading the implementation body.
- **Use cases are the spec.** Before touching any business logic, read the relevant UC in
  `docs/use-cases.md`. The code is derived from the use case.
- **ADRs explain the why.** Before making structural decisions, check `docs/adrs/active/`.
  The answer may already exist.
- **Skip implementation reads when contracts are green.** If tests pass and types compile,
  treat a module as a black box — no need to read its internals.
- **Raise an ADR rather than deviating silently.** If the correct action contradicts the
  architecture, write the ADR first — do not silently break the contract.

## Document Map — Where Docs Live

| What you need | Where to find it |
| --- | --- |
| What ForgeCraft does | `docs/PRD.md` |
| How it's architected | `docs/TechSpec.md` |
| Layer and boundary rules | `docs/architecture/layers.md` |
| Module ownership | `docs/architecture/modules.md` |
| Data model / schema / ERD | `docs/architecture/data-model.md` |
| External integrations | `docs/architecture/integrations.md` |
| Behavioral contracts | `docs/use-cases.md` |
| Why a decision was made | `docs/adrs/active/` |
| Current project state | `docs/status.md` |
| Non-functional requirements | `docs/nfr-contracts.md` |
| MCP + CLI schema reference | `docs/schema.md` |

## Reading Order (before implementing)

1. `docs/status.md` — what's done, what's in progress
2. Relevant use case in `docs/use-cases.md`
3. Relevant spec in `docs/specs/` or `docs/PRD.md`
4. Relevant ADR in `docs/adrs/active/` if the area has prior decisions
5. `.claude/core.md` — verify approach doesn't violate invariants
