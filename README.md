# ergaxis-backend

**Ergaxis** — Nabhahita's Phase 1 employment platform ("Career Distribution"): API, workers and engines. *Naming:* the product/brand is **Ergaxis** (decided 2026-08-19); Nabhahita is the client company — repos and packages are scoped `ergaxis-*` / `@ergaxis/*` (renamed 2026-08-19; GitHub redirects the old `nabhahita-*` names).
Companion repo: [`ergaxis-frontend`](https://github.com/madhvendraspalawat/ergaxis-frontend) (mobile app + web portals), joined by `openapi/openapi.json`.

## Stack
NestJS 11 (modular monolith) · BullMQ 6 + Redis · Prisma 7 + PostgreSQL 16 (AWS RDS ap-south-1) · S3 · Docker/ECS Fargate · GitHub Actions.

## Quick start
```sh
corepack enable            # pnpm 11
pnpm install
cp .env.example .env
docker compose up -d       # postgres, redis, minio, mailpit
pnpm dev                   # API on :3000
```
`pnpm build · lint · typecheck · test · openapi:export · db:generate · db:migrate`

## Layout
```
apps/api        NestJS API — src/modules/<bounded-context>/
apps/worker     BullMQ processors
packages/db     Prisma 7 schema/migrations/seed (single owner of the RDS schema)
packages/engine-scoring · engine-billing   pure engines
packages/contracts   zod schemas → OpenAPI
openapi/        contract artefact
docs/           deliverables, plan, ADRs
```
Status: **barebones skeleton** — structure, CI and standards only. Modules are empty until their workstream starts.
