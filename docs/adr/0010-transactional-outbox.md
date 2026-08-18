# ADR-0010: Transactional outbox for notifications and domain events

**Status:** accepted · **Date:** 2026-08-18

## Decision

Domain events (candidate approved, placement joined, verification complete) are written to an `outbox` table in the same transaction as the state change; a worker relays them to BullMQ → channels (FCM/SMS/WhatsApp/SES). Guarantees at-least-once delivery without dual-write bugs (Richardson, microservices.io). Templates are multilingual and versioned.

## Consequences

_To expand as the workstream lands._
