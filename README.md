# ursainyk-backend

**Ursainyk** — Nabhahita's Phase 1 employment platform ("Career Distribution"): API, workers and engines that connect job candidates, ex-serviceman (ESM) fulfilment centres, and staffing contractors — with recurring per-placement billing from day one.

*Naming:* the product/brand is **Ursainyk** (ADR-0011); Nabhahita is the client company. Repos and packages are scoped `ursainyk-*` / `@ursainyk/*` (GitHub redirects the older `nabhahita-*` / `ergaxis-*` names).
Companion repo: [`ursainyk-frontend`](https://github.com/madhvendraspalawat/ursainyk-frontend) (mobile app + web portals), joined by `openapi/openapi.json`.

## What the platform does

1. **Candidates** sign up on a mobile app with just a phone number (OTP), or are registered by an ESM centre at walk-in. They build a profile (later: résumé photo parsed by a vision LLM).
2. A **Reviewer** approves every profile — nothing enters the pool unreviewed. Approval computes an explainable, CIBIL-like **score (0–900)**.
3. **Contractors** post staffing requirements. ESM centres see them **with the employer's identity masked** — disintermediation control is the business model.
4. **Ops** suggests candidate↔requirement matches; the **ESM centre** accepts and works the pipeline: met → suitable → callback → placed → joined.
5. Every month the centre **verifies** each placed head is still active. Those immutable facts drive **contractor invoices** and **ESM payouts** — computed by a pure billing engine into an append-only ledger, all money in integer paise.
6. Every human decision (review corrections, match accept/dismiss, verification outcomes, score overrides) is also captured — pseudonymized and consent-tagged — as **training data** for the in-house AI that replaces manual steps later.

## The 9 roles

| Role | Surface | Can |
|---|---|---|
| Candidate | mobile app | own profile, own score, own application status |
| ESM Centre | ESM portal | walk-in intake, masked requirement feed, pipeline, monthly verification, own payouts |
| Contractor | web portal | post/close requirements, matched candidates + scores, own invoices |
| Reviewer | admin console | the approval gate (only role that can approve) |
| Ops | admin console | scoring presets/overrides, match suggestions, oversight |
| Finance | admin console | billing runs, invoices, payouts, reconciliation |
| ESM Manager | admin console | centres, centre↔territory assignment, performance |
| Sales/BD | admin console | contractor orgs, employer identity, on-behalf requirements |
| Super Admin | admin console | users/roles, territories, system config & flags, full audit, training-data export/erasure |

The full permission matrix lives **as code** in [`packages/rbac`](packages/rbac/src/index.ts) with pinned tests — changing access is a reviewed PR, not a DB flag.

## Security model (the short version)

- **AuthN** (ADR-0004): candidates = phone OTP; portal users = email+password; admin roles = mandatory TOTP (`ADMIN_MFA_ENFORCE=1` in production). JWT access (15 min) + rotating refresh tokens; refresh reuse revokes the whole token family. Per-IP rate limits on auth routes.
- **AuthZ**: global guard chain (authenticate → authorize) — controllers declare `@Require('resource:action')`, the guard checks the rbac matrix. Deny by default.
- **Scoping** (ADR-0007), enforced twice: Prisma query filters *and* Postgres row-level security keyed on a per-transaction `app.territory_ids` setting (unset = zero rows, fail closed). ⚠️ the production DB user must be **NOSUPERUSER** — superusers bypass RLS.
- **Masking** (ADR-0006/0007): employer identity lives in a separate table; feed DTOs omit even the org uuid; unmasking is an explicit endpoint and every unmask is audit-logged at the highest visibility tier.
- **Audit** (ADR-0006/0012): append-only log, UPDATE/DELETE blocked by trigger, every row **sha256-hash-chained** to the previous (tamper-evident, verifiable via `audit_chain_verify()`). Two visibility tiers: admin roles see human events; worker/masked-read events are Super Admin only.
- **Money** (ADR-0005): integer paise (BigInt), pure engine with pinned tests (including the deterministic largest-remainder split), append-only ledger, idempotency keys — billing reruns write nothing twice.
- **DPDP / training data** (ADR-0012): decision payloads are pseudonymized and consent-tagged in an *erasable* table; the tamper-evident chain never carries PII, so erasure and append-only never conflict.

## Repository layout

```
apps/api                  NestJS API — one module per bounded context in src/modules/
  identity/               auth, users, roles, guards          audit/    log + decision capture
  candidates/             intake + Reviewer gate              requirements/  contractor + masked feed
  placements/  matching/  verification/                       billing/  scoring/
  admin/ (centres, orgs)  config/ (territories, system config)
apps/worker               outbox relay → BullMQ → notification fan-out (ADR-0010)
packages/db               Prisma 7 schema, migrations, seed — the ONLY owner of the RDS schema
packages/rbac             the permission matrix as code (pinned tests)
packages/engine-scoring   pure scoring engine (0–900, preset weights)
packages/engine-billing   pure billing engine (paise, largest-remainder, pinned tests)
packages/contracts        zod schemas for every API boundary → source of the OpenAPI contract
openapi/                  the contract consumed by ursainyk-frontend
docs/                     DELIVERABLES, PLAN, ADRs 0001–0012
```

## Local development

Prereqs: Node 22 (`brew install node@22`), pnpm 11 (`corepack enable`), Docker (Docker Desktop or `brew install colima docker docker-compose && colima start`).

```sh
pnpm install
cp .env.example .env
docker compose up -d        # postgres 16, redis 7, minio, mailpit
pnpm db:generate            # prisma client
pnpm db:migrate             # apply migrations (or: prisma migrate deploy)
pnpm --filter @ursainyk/db seed
pnpm dev                    # API on :3000
pnpm --filter @ursainyk/worker start:dev   # outbox relay + notifications
```

Gates: `pnpm typecheck · lint · build · test` (CI runs all four).

### Dev users (synthetic, from seed)

Password for all portal users: `dev-password-1`.

| Login | Role |
|---|---|
| `+911234500000` (OTP shown in API log) | Candidate |
| `esm@dev.local` | ESM Centre |
| `contractor@dev.local` | Contractor |
| `reviewer@dev.local` | Reviewer |
| `ops@dev.local` | Ops |
| `finance@dev.local` | Finance |
| `esm-manager@dev.local` | ESM Manager |
| `sales@dev.local` | Sales/BD |
| `root@dev.local` | Super Admin |

Any *unknown* phone on `POST /auth/otp/request` self-registers as a new candidate (the dev OTP sender prints the code to the API log). Admin users are prompted to enroll TOTP (`POST /auth/totp/enroll` → scan URI → `POST /auth/totp/activate`); once enrolled, login requires the code.

## Endpoint overview (by role)

**Auth (all):** `POST /auth/otp/request|verify` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password/change` · `POST /auth/totp/enroll|activate`

**Candidate:** `GET|PATCH /candidates/me` · `POST /candidates/me/submit` · `GET /placements` (own status)

**ESM Centre:** `POST /candidates` (walk-in) · `GET /candidates` (territory) · `GET /requirements` (masked feed) · `POST /placements` · `PATCH /placements/:id/stage` · `GET|POST /matching/suggestions/:id/accept|dismiss` · `POST /verifications` · `GET /verifications/due` · `GET /payouts` (own)

**Contractor:** `POST|GET|PATCH /requirements` · `GET /requirements/:id/employer` (own, audited) · `GET /placements` (supplied heads) · `GET /billing/invoices` (own)

**Reviewer:** `GET /review/queue` · `POST /review/:id/approve|reject`

**Ops:** `GET|PUT /scoring/presets` · `POST /scoring/candidates/:id/override` · `POST|GET /matching/suggestions` · `GET /matching/overview`

**Finance:** `POST /billing/runs` · `GET /billing/invoices` · `GET /payouts`

**ESM Manager:** `POST|GET|PATCH /centres` · `POST|DELETE /centres/:id/territories/:territoryId` · `GET /centres/:id/summary` · `POST /identity/users` (centre staff)

**Sales/BD:** `POST|GET|PATCH /contractor-orgs` · `PUT /contractor-orgs/:id/employer` · `POST /requirements` (on behalf) · `POST /identity/users` (contractor users)

**Super Admin:** `POST /identity/users` + roles/status/reset · `POST|GET|PATCH /territories` · `GET|PUT /config[/:key]` · `GET /audit/logs` (both tiers) · `GET /audit/chain/verify` · `GET /audit/decisions/export` · `POST /audit/decisions/erase` · `GET /requirements/:id/employer` (any, audited)

## Docs

`CONTRIBUTING.md` — standards (non-negotiable) · `docs/DELIVERABLES.md` — Phase 1 scope · `docs/PLAN.md` — build plan · `docs/adr/` — decisions 0001–0012 (start with 0004 auth, 0005 money, 0006 audit, 0007 scoping, 0012 audit chain + training capture).
