# Contributing to ForgeCraft

ForgeCraft grows through the quality gate library. Every gate you contribute makes the tool better for every AI-assisted project that runs on it.

---

## Quality Gate Proposals — the fastest way to contribute

A quality gate is a hook, instruction block, verification check, or domain rule that prevents a real failure mode in AI-assisted development.

**To propose a gate:** open an issue using the [Quality Gate Proposal](.github/ISSUE_TEMPLATE/quality-gate-proposal.md) template.

### What makes a good proposal

- **Grounded in a real failure.** The best gates come from pain — something that broke, filled a disk, shipped a bug, or caused a production incident. Describe what happened.
- **General enough to apply across projects.** A gate that only makes sense for one codebase is a PR comment, not a library gate.
- **Specific enough to be checkable.** Vague rules ("write clean code") don't become gates. Specific patterns ("check `docker ps -a` before `docker run`") do.
- **Tagged correctly.** UNIVERSAL gates apply everywhere. Domain gates apply to specific stacks.

### Pro access for accepted gates

We give Pro access to contributors whose gates are accepted and merged into the library.

| Contribution | Reward |
|---|---|
| Gate accepted during **founding period** (first 6 months) | **3 months Pro** |
| Gate accepted after founding period | **1 month Pro** |
| **3 or more** gates accepted (any time) | **Lifetime Pro** |

You will be added to [CONTRIBUTORS.md](CONTRIBUTORS.md) when your gate is merged. Pro access is granted when the ForgeCraft server launches — all founding-period contributors are backfilled from CONTRIBUTORS.md.

> **Why front-load generosity?** The first 20 gates are the hardest. They define the quality bar for everything after. Founding contributors take the highest risk and set the standard. That deserves disproportionate recognition.

### Review process

1. Submit the issue using the proposal template
2. Maintainer reviews for scope, specificity, and real-world grounding
3. If accepted in principle: open a PR with the gate implementation
4. PR is reviewed against the existing library for conflicts and quality
5. Merged → you're added to CONTRIBUTORS.md

---

## Code contributions

### Setup

```bash
git clone https://github.com/jghiringhelli/forgecraft-mcp
cd forgecraft-mcp
npm install
npm run build
npm test
```

### Branch naming

```
feat/short-description
fix/short-description
test/short-description
docs/short-description
```

### Commit convention

```
feat(scope): description
fix(scope): description
test(scope): description
docs(scope): description
chore(scope): description
```

### Before submitting a PR

```bash
npm run build   # must pass
npm test        # must pass, coverage gate enforced
```

The pre-commit hook enforces: no hardcoded hosts, no mock data in production code, build passes, coverage gate passes.

### Adding a new tag

1. Add the tag constant to `src/shared/types.ts` → `ALL_TAGS`
2. Create `templates/<tag-lowercase>/instructions.yaml` with at least one block
3. Add a test in `tests/` verifying the tag composes correctly
4. Update the tag table in `README.md`

### Adding a new instruction block to an existing tag

1. Edit `templates/<tag>/instructions.yaml`
2. Add the block with a unique `id`, appropriate `tier`, and `title`
3. Run `npm test` — template rendering tests will catch YAML errors

---

## Theoretical foundation

ForgeCraft is the reference implementation of the **Generative Specification** model. If you want to understand the formal basis for the 7-property scoring model, the S_realized formula, and the release phase framework, the white paper is the place to start.

> [Generative Specification White Paper](https://github.com/jghiringhelli/argos) ← link to white paper when published

The white paper is the academic layer. ForgeCraft is the toolchain layer. Gates proposed for ForgeCraft that generalize into theoretical insights may be incorporated into future white paper revisions.
