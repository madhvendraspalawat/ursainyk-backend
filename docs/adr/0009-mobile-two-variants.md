# ADR-0009: One Expo codebase, two app variants (candidate / centre)

**Status:** accepted · **Date:** 2026-08-18

## Decision

The candidate app and the ESM centre-lead field app are one Expo project built as two products (`APP_VARIANT=candidate|centre` in `app.config.ts`, separate EAS profiles, bundle ids and icons). This honours §11.8 ('no privileged code shipped to lower-privilege apps') without duplicating the i18n/voice/offline stack. Authorization is still enforced server-side.

## Consequences

_To expand as the workstream lands._
