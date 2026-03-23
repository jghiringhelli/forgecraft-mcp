# External Static Analysis Tools

These tools provide objective code quality signals independent of the GS rubric.
Used in AX experiment to mitigate circularity concern (F1 adversarial audit finding).

| Tool | Install | Command | Measures | Threshold |
|------|---------|---------|----------|-----------|
| jscpd | npx jscpd | `npx jscpd src/ --min-tokens 50` | Copy-paste duplication | < 5% lines |
| madge | npx madge | `npx madge --circular --extensions ts src/` | Circular imports | 0 |
| ESLint | npm install -D eslint @typescript-eslint/... | `npx eslint src/ --ext .ts` | Lint errors | 0 errors |
| tsc | included in typescript | `npx tsc --noEmit` | Type errors + interface completeness | 0 errors |
| stryker | npx stryker | `npx stryker run` | Mutation score | MSI ≥ 65% |

## When to run
- jscpd + madge: before each PR merge
- ESLint + tsc: on every commit (pre-commit hook)
- stryker: before release or after adding new test coverage

## Evidence
AX experiment results documented in:
`C:\workspace\generative-specification\experiments\ax\EXTERNAL_ANALYSIS.md`
