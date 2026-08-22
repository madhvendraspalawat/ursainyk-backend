# Architecture Decision Records

One file per decision, numbered, never edited after acceptance — supersede with a new ADR.

- [ADR-0001](./0001-two-repos-openapi-contract.md) — Two repositories joined by an OpenAPI contract
- [ADR-0002](./0002-modular-monolith.md) — Modular monolith in NestJS, not microservices
- [ADR-0003](./0003-prisma7-backend-owns-schema.md) — Prisma 7 with the backend as the single schema owner
- [ADR-0004](./0004-in-house-auth.md) — In-house authentication in Nest
- [ADR-0005](./0005-money-and-ledger.md) — Money is integer paise; billing derives from an append-only ledger
- [ADR-0006](./0006-audit-including-masked-reads.md) — Append-only audit log including reads of masked employer identity
- [ADR-0007](./0007-territory-scoping-rls.md) — Territory/owner scoping enforced twice: query scoping + Postgres RLS
- [ADR-0008](./0008-vision-llm-parser.md) — Résumé parser: vision-LLM API behind an interface at launch
- [ADR-0009](./0009-mobile-two-variants.md) — One Expo codebase, two app variants (candidate / centre)
- [ADR-0010](./0010-transactional-outbox.md) — Transactional outbox for notifications and domain events
- [ADR-0011](./0011-product-name-ursainyk.md) — Product name is Ursainyk
- [ADR-0012](./0012-audit-chain-and-decision-capture.md) — Hash-chained audit, two-tier visibility, decision capture for AI training
