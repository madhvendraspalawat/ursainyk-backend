# ADR-0001: Two repositories joined by an OpenAPI contract

**Status:** accepted · **Date:** 2026-08-18

## Decision

`ergaxis-backend` (API, workers, engines, schema) and `ergaxis-frontend` (Expo app + Next portals + shared UI) are separate repos, mirroring team boundaries (backend vs. app teams — Conway's law / Team Topologies). The master doc's single-Turborepo intent is preserved *within* each repo. What we give up is atomic cross-repo change (Potvin & Levenberg, CACM 2016), so: the backend commits `openapi/openapi.json`, the frontend generates its client from a pinned version, and API changes are additive-first (expand → migrate → contract).

## Consequences

_To expand as the workstream lands._
