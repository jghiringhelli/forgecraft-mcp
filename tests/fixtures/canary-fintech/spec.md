# LedgerCore — Double-Entry Billing Engine

## Problem

SaaS companies hand-roll billing logic and discover reconciliation errors
months later: invoices that don't sum, refunds that double-apply, currency
rounding drift. Money math demands double-entry discipline from day one.

## Users

- **Finance operator**: reviews ledgers, issues credits/refunds, exports for accounting
- **Platform engineer**: integrates billing events from the product via API

## Goals

- Double-entry ledger: every transaction balances debits and credits exactly
- Invoice lifecycle: draft → issued → paid/void; immutable once issued
- Refunds and credits as compensating entries — never mutate history
- Multi-currency with explicit conversion records; banker's rounding throughout
- Full audit trail: who/what/when for every entry, queryable

## Components

- **Ledger service**: append-only journal, balanced-entry invariant enforced at write
- **Invoice service**: lifecycle state machine, line-item math with Decimal precision
- **Currency service**: conversion at recorded rates, no float arithmetic anywhere
- **Audit log**: immutable event stream per account
- **REST API**: authenticated endpoints for the platform + finance UI

## External Systems

- PostgreSQL (NUMERIC columns only — no floats for money)
- Stripe webhook intake for payment events
- Exchange-rate provider (daily snapshot, recorded with each conversion)

## Non-Functional Requirements

- Ledger invariant: SUM(debits) = SUM(credits) per transaction — enforced by DB constraint AND application check
- All monetary values: arbitrary-precision decimal; floats forbidden in money paths
- SOC2-ready audit logs; PII encrypted at rest
- Reconciliation report must reproduce identical totals re-run on historical data
