# ADR-0006: Append-only audit log including reads of masked employer identity

**Status:** accepted · **Date:** 2026-08-18

## Decision

An `AuditLog` table, trigger-protected against UPDATE/DELETE, records every state change on candidates, placements, billing, payouts and role assignments — and every *read* of a masked employer field. Employer-identity masking is the disintermediation control of the business model; logging reads is what makes bypass detectable. Anomaly views (verification spikes, mask-read patterns) are Admin features from R1, not Phase 2.

## Consequences

_To expand as the workstream lands._
