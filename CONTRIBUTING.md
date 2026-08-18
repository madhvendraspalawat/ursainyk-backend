# Contributing

1. Branch from `main` (`feat/<module>-<thing>`, `fix/…`); keep PRs small and reviewable.
2. `pnpm install` → `pnpm typecheck && pnpm lint && pnpm build && pnpm test` locally before pushing.
3. Conventional commits (`feat(billing): …`, `fix(identity): …`).
4. Any architectural decision → new ADR in `docs/adr/` (never edit an accepted ADR; supersede it).
5. Engineering standards live in `CLAUDE.md` — they apply to humans and AI agents alike.
6. Secrets never enter the repo. `.env.example` documents variables; real values live in SSM/Secrets Manager.
7. Local infra: `docker compose up -d` (Postgres 16, Redis 7, MinIO, Mailpit).
