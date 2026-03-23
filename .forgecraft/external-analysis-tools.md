# External Static Analysis Gates — Tool Reference

These gates provide objective code quality signals independent of the GS rubric.
Introduced in AX experiment to mitigate circularity concern (F1 adversarial audit finding).

Gates are tech-agnostic. The table below maps each gate to per-language tool implementations.

## Gate → Tool Matrix

| Gate | Constraint | TypeScript/JS | Python | Go | Java | Rust |
|------|-----------|--------------|--------|-----|------|------|
| no-code-duplication | < 5% duplicated lines | jscpd | pylint (--duplicate-code) | dupl | PMD CPD | simian |
| no-circular-dependencies | 0 circular imports | madge | pydeps | go build (native) | JDepend | cargo build (native) |
| interface-contract-completeness | 0 type errors | tsc --noEmit | mypy | go build (native) | javac (native) | cargo build (native) |
| zero-static-analysis-errors | 0 lint errors | eslint | ruff | golangci-lint | checkstyle | clippy |
| mutation-coverage | MSI ≥ 65% | stryker | mutmut | go-mutesting | PIT | cargo-mutants |

## When to run

| Gate | Phase | Hook |
|------|-------|------|
| no-code-duplication | development | pre-commit |
| no-circular-dependencies | development | pre-commit |
| interface-contract-completeness | development | pre-commit |
| zero-static-analysis-errors | development | pre-commit |
| mutation-coverage | pre-release | pre-push / PR |

## Evidence
AX experiment results documented in:
`experiments/ax/EXTERNAL_ANALYSIS.md` (generative-specification repo)
