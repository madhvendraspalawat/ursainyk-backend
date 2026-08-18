# ADR-0008: Résumé parser: vision-LLM API behind an interface at launch

**Status:** accepted · **Date:** 2026-08-18

## Decision

Decided 2026-08-13: launch with a vision-LLM API (free tier for dev/synthetic data only; paid, no-training tier + DPA before any real candidate PII — DPDP). In-house OCR+NER deferred until volume justifies it. The parser is an interface in `apps/api/src/modules/parser`; ingestion, validation, scoring and Reviewer override are identical for any implementation. Jobs run async on BullMQ so rate limits degrade to slow, never to dropped.

## Consequences

_To expand as the workstream lands._
