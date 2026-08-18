# ADR-0002: Modular monolith in NestJS, not microservices

**Status:** accepted · **Date:** 2026-08-18

## Decision

One deployable API with one bounded-context module per folder under `apps/api/src/modules` (identity, candidates, parser, scoring, requirements, matching, placements, verification, billing, payouts, notifications, i18n, audit, config, admin) plus a separate worker process for queues. Rationale: ~11 people / 14 weeks cannot carry distributed-systems tax (Fowler, *MonolithFirst*; Shopify's modular monolith). Import boundaries between modules will be lint-enforced; the module seams are where extraction happens later if ever needed.

## Consequences

_To expand as the workstream lands._
