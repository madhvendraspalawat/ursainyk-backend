# ADR-0003: Prisma 7 with the backend as the single schema owner

**Status:** accepted · **Date:** 2026-08-18

## Decision

`packages/db` holds the only Prisma schema for the RDS (Mumbai) instance. The landing page (`nabhahitalandingpage`) currently has its own Prisma `Lead` model against the same database — two schemas on one DB collide at the first migration. Decision: the `Lead` model migrates into `packages/db`; the site writes via the API (master doc §3/§10 intent). Prisma 7 specifics: `prisma-client` generator, CJS module format (Nest), `@prisma/adapter-pg`, `prisma.config.ts`.

## Consequences

_To expand as the workstream lands._
