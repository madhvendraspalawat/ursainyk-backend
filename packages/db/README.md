# @ursainyk/db
Prisma 7 (`prisma-client` generator, CJS, `@prisma/adapter-pg`). Scripts: `generate`, `migrate:dev`, `migrate:deploy`, `seed`.
Config in `prisma.config.ts` (env is NOT auto-loaded by Prisma 7 — dotenv imported explicitly).
Rules: money = BigInt paise · AuditLog/LedgerEntry append-only (trigger-enforced) · territory RLS as defence in depth (ADR-0007).
