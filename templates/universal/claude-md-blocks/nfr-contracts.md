## Non-Functional Requirement Contracts

Declare SLA and throughput obligations as measurable assertions.
Aspirations ("should be fast") are not contracts. Each row is machine-checkable.

<!-- Fill in actual values before pre-release. -->

| Operation | P99 Latency | Max Latency | Throughput | Notes |
|---|---|---|---|---|
| [Primary read] | ≤ __ms | ≤ __ms | __ RPS | |
| [Primary write] | ≤ __ms | ≤ __ms | __ RPS | |
| [Background job] | — | ≤ __s | — | Async |

## Availability
- Uptime SLA: __% (e.g., 99.9%)
- Max planned downtime per month: __ minutes

## Correctness Constraints
- [List idempotency, determinism, or monotonicity requirements]

**Verification**: Load tests in `tests/harness/` must assert these bounds.
Gate: `nfr-contracts-required` fires until this file has measurable values.
