# ADR-0012: Hash-chained audit with two-tier visibility; decision capture for AI training

**Status:** accepted · **Date:** 2026-08-22

## Decision

Extends ADR-0006 in three ways.

**Tamper evidence.** Every `AuditLog` row is hash-chained: a `BEFORE INSERT` trigger (serialized by a transaction-scoped advisory lock) sets `hashPrev` to the previous row's `hashSelf` and computes `hashSelf = sha256(hashPrev ‖ row fields)` via a single shared `audit_row_hash()` function also used by `audit_chain_verify()`, which walks the chain and returns the first broken row. Combined with the existing UPDATE/DELETE-blocking trigger, any out-of-band edit (e.g. triggers disabled by a superuser) is detectable on the next verify.

**Two-tier visibility.** `AuditLog.visibility ∈ {ADMIN, SUPER}`. Human-actor events default to `ADMIN` and are readable by all six admin roles (`audit_log:read` widened in `@ursainyk/rbac`); service/worker events and masked-employer-read events are `SUPER`, visible only to Super Admin — they are bypass-detection signal, not operational noise. The tier is enforced in the query layer of `GET /audit/logs`, like territory scope.

**Decision capture for training.** Human decisions (reviewer corrections, matching accept/reject, verification outcomes, scoring overrides) are recorded as `DecisionEvent` rows with verbose feature context (location, language, salary band, …) for later in-house model training (parser first, per ADR-0008). Payloads are pseudonymized via a `SubjectPseudonym` mapping (opaque key, mapping deletable) and carry a `consentBasis` tag; exports (`GET /audit/decisions/export`, NDJSON) never include internal actor ids or erased rows. The chained audit row records only the pseudonym — **the chain is PII-free by construction**, so DPDP erasure (null payloads, tombstone events, delete mapping) never conflicts with append-only history.

## Consequences

- Chain appends serialize on one advisory lock; acceptable at Phase-1 write rates, revisit if audit throughput becomes a bottleneck (options: per-shard chains, batched sealing).
- Changing `audit_row_hash()` inputs breaks verification of prior rows — any change needs a migration plus an epoch marker.
- Training-data usefulness depends on modules actually calling `DecisionService.recordDecision` with rich context; that contract lands with each workstream (reviewer gate first).
