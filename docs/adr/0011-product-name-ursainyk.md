# ADR-0011: Product name is Ursainyk

**Status:** accepted · **Date:** 2026-08-19 · **Amended:** 2026-08-21 (brand renamed Ergaxis → Ursainyk)

## Decision

The Phase 1 platform (mobile app, centre-lead app, ESM/Contractor/Admin portals) ships under the brand **Ursainyk** (initially named Ergaxis on 2026-08-19, renamed 2026-08-21); Nabhahita remains the client company and the marketing-site brand (nabhahita.com). User-facing identifiers follow the product: app names "Ursainyk" / "Ursainyk Centre", bundle ids `com.ursainyk.app` / `com.ursainyk.centre` (domain `ursainyk.*` assumed — confirm before store submission), portal titles "Ursainyk Admin / Centre Portal / Contractor Portal". Repos and the package scope follow the brand: `ursainyk-*` / `@ursainyk/*` (GitHub redirects the older `nabhahita-*` and `ergaxis-*` names).

## Consequences

Ursainyk logo/wordmark, app icons, store listings, portal domains and transactional-email sender identity are open items. Visual language (indigo/saffron palette, Inter Tight/Inter, component recipes) carries over unchanged from the Nabhahita site — see `ursainyk-frontend/docs/design-system.md`.
