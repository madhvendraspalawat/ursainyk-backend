# ADR-0011: Product name is Ergaxis

**Status:** accepted · **Date:** 2026-08-19

## Decision

The Phase 1 platform (mobile app, centre-lead app, ESM/Contractor/Admin portals) ships under the brand **Ergaxis**; Nabhahita remains the client company and the marketing-site brand (nabhahita.com). User-facing identifiers follow the product: app names "Ergaxis" / "Ergaxis Centre", bundle ids `com.ergaxis.app` / `com.ergaxis.centre` (domain `ergaxis.*` assumed — confirm before store submission), portal titles "Ergaxis Admin / Centre Portal / Contractor Portal". Repo names and the internal `@nabhahita/*` package scope keep referring to the client project.

## Consequences

Ergaxis logo/wordmark, app icons, store listings, portal domains and transactional-email sender identity are open items. Visual language (indigo/saffron palette, Inter Tight/Inter, component recipes) carries over unchanged from the Nabhahita site — see `nabhahita-frontend/docs/design-system.md`.
