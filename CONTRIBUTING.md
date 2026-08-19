# Contributing

1. Branch from `main` (`feat/<module>-<thing>`, `fix/…`); keep PRs small and reviewable.
2. `pnpm install` → `pnpm typecheck && pnpm lint && pnpm build && pnpm test` locally before pushing.
3. Conventional commits (`feat(billing): …`, `fix(identity): …`).
4. Any architectural decision → new ADR in `docs/adr/` (never edit an accepted ADR; supersede it).
5. Engineering standards are below — they apply to humans and AI agents alike (keep any local `CLAUDE.md`/`AGENTS.md` pointing here; those files are gitignored).
6. Secrets never enter the repo. `.env.example` documents variables; real values live in SSM/Secrets Manager.
7. Local infra: `docker compose up -d` (Postgres 16, Redis 7, MinIO, Mailpit).

## Engineering standards (non-negotiable)

- **Money = integer paise (`BigInt`)**, largest-remainder splits, ledger append-only (ADR-0005).
- **Engines are pure**: no I/O in `packages/engine-*`; every published figure has a pinned test.
- **zod at every boundary** (`@ergaxis/contracts`); never trust client payloads.
- **Authorization, territory scoping and employer masking are server-side.** UI gating is UX only. RLS underneath (ADR-0007).
- **Audit everything money- or masking-related, including reads** (ADR-0006).
- **No PII in logs, tests, seeds or fixtures.** Synthetic data only. Redact in the logger.
- **Idempotency keys** on all mobile-originated writes (offline queue replays).
- **API changes additive-first**; breaking changes need an ADR note and a contract major bump.
- Prisma 7: `prisma-client` generator, `moduleFormat = "cjs"`, `@prisma/adapter-pg`; env is not auto-loaded — `prisma.config.ts` imports dotenv.
- Toolchain: Node 22, pnpm 11 (settings in `pnpm-workspace.yaml`), TypeScript 5.9 (Nest CLI cannot drive TS 7 yet).

## Layout
- `apps/api` — Nest app; one module per bounded context in `src/modules/*` (each has a README).
- `apps/worker` — queue processors (separate deployable).
- `packages/db` — the ONLY Prisma schema for the RDS · `packages/engine-*` — pure functions · `packages/contracts` — zod schemas (source of OpenAPI).
- `openapi/openapi.json` — the contract consumed by `ergaxis-frontend`. Regenerate with `pnpm openapi:export`.
