# nabhahita-backend — working rules

Nabhahita Phase 1 backend: NestJS API (modular monolith) + BullMQ worker + Prisma 7 (Postgres, RDS Mumbai) + pure engine packages. Read `docs/DELIVERABLES.md` and `docs/adr/` before non-trivial work.

## Layout
- `apps/api` — Nest app; one module per bounded context in `src/modules/*` (each has a README).
- `apps/worker` — queue processors (separate deployable).
- `packages/db` — the ONLY Prisma schema for the RDS · `packages/engine-*` — pure functions · `packages/contracts` — zod schemas (source of OpenAPI).
- `openapi/openapi.json` — the contract consumed by `nabhahita-frontend`. Regenerate with `pnpm openapi:export`.

## Non-negotiables
- **Money = integer paise (`BigInt`)**, largest-remainder splits, ledger append-only (ADR-0005).
- **Engines are pure**: no I/O in `packages/engine-*`; every published figure has a pinned test.
- **zod at every boundary** (`@nabhahita/contracts`); never trust client payloads.
- **Authorization, territory scoping and employer masking are server-side.** UI gating is UX only. RLS underneath (ADR-0007).
- **Audit everything money- or masking-related, including reads** (ADR-0006).
- **No PII in logs, tests, seeds or fixtures.** Synthetic data only. Redact in the logger.
- **Idempotency keys** on all mobile-originated writes (offline queue replays).
- **API changes additive-first**; breaking changes need an ADR note and a contract major bump.
- Prisma 7: `prisma-client` generator, `moduleFormat = "cjs"`, `@prisma/adapter-pg`; env is not auto-loaded — `prisma.config.ts` imports dotenv.
- Toolchain: Node 22, pnpm 11 (settings in `pnpm-workspace.yaml`), TypeScript 5.9 (Nest CLI cannot drive TS 7 yet).

## Workflow
Trunk-based; small PRs; CI (typecheck · lint · build · test) must be green; conventional commits; ADR for architectural decisions.
