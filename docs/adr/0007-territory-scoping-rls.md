# ADR-0007: Territory/owner scoping enforced twice: query scoping + Postgres RLS

**Status:** accepted · **Date:** 2026-08-18

## Decision

ESMs see only their territory; contractors only their own requirements/supplied candidates. Enforced in the API by request-scoped Prisma query scoping *and* underneath by Postgres row-level security keyed on `current_setting('app.territory_ids')` set per transaction — defence in depth (OWASP ASVS V4). Employer identity lives in a separate table so masking is a join privilege, not a column filter.

## Consequences

_To expand as the workstream lands._
