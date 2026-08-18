# ADR-0005: Money is integer paise; billing derives from an append-only ledger

**Status:** accepted · **Date:** 2026-08-18

## Decision

All monetary values are `BigInt` paise. No floats or decimals anywhere in engine or schema. Verification results are immutable facts; invoices and payouts are projections computed by `@nabhahita/engine-billing` (pure functions, pinned tests) and recorded as append-only `LedgerEntry` rows (Helland, *Immutability Changes Everything*; Fowler, *Accounting Patterns*). Splits use largest-remainder so parts always sum. Every money-moving write carries an idempotency key (Stripe pattern).

## Consequences

_To expand as the workstream lands._
