-- Canonical audit-row hash + ordered chain (ADR-0012 epoch 2).
-- The original audit_row_hash took timestamptz: hashing then depended on the
-- session TimeZone through the implicit timestamp→timestamptz cast, which can
-- differ between the inserting session and a later verifying session
-- (observed as a false "chain broken" in CI). The input is now rendered with
-- an explicit, timezone-free format on the stored timestamp itself.
-- Pre-production epoch change: no production rows exist; dev/e2e databases
-- are recreated. Any future input change requires a new epoch + migration
-- (ADR-0012 consequences).

DROP TRIGGER IF EXISTS audit_log_chain_insert ON "AuditLog";
DROP FUNCTION IF EXISTS audit_row_hash(text, timestamptz, text, text, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION audit_row_hash(
  prev text, at_ timestamp, actor_type text, actor_id text,
  action_ text, entity_ text, entity_id text, data_ jsonb, visibility_ text
) RETURNS text AS $$
  SELECT encode(digest(
    coalesce(prev, 'genesis')
    || '|' || to_char(at_, 'YYYY-MM-DD"T"HH24:MI:SS.MS')
    || '|' || actor_type
    || '|' || coalesce(actor_id, '')
    || '|' || action_
    || '|' || entity_
    || '|' || coalesce(entity_id, '')
    || '|' || coalesce(data_::text, '')
    || '|' || visibility_, 'sha256'), 'hex');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));
  -- Re-assign the id UNDER the lock: the default nextval fires before this
  -- trigger, so under contention id order and lock (=chain) order can diverge
  -- — a valid chain that a by-id verifier misreads as broken. Holding both
  -- the id and the hash assignment inside the lock keeps them identical.
  NEW.id := nextval(pg_get_serial_sequence('"AuditLog"', 'id'));
  SELECT "hashSelf" INTO prev FROM "AuditLog" ORDER BY id DESC LIMIT 1;
  NEW."hashPrev" := prev;
  NEW."hashSelf" := audit_row_hash(prev, NEW.at, NEW."actorType", NEW."actorId",
    NEW.action, NEW.entity, NEW."entityId", NEW.data, NEW.visibility::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_chain_insert
  BEFORE INSERT ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

CREATE OR REPLACE FUNCTION audit_chain_verify() RETURNS bigint AS $$
DECLARE r record; prev text := NULL;
BEGIN
  FOR r IN SELECT * FROM "AuditLog" ORDER BY id LOOP
    IF r."hashPrev" IS DISTINCT FROM prev THEN RETURN r.id; END IF;
    IF r."hashSelf" IS DISTINCT FROM audit_row_hash(prev, r.at, r."actorType",
      r."actorId", r.action, r.entity, r."entityId", r.data, r.visibility::text)
    THEN RETURN r.id; END IF;
    prev := r."hashSelf";
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Diagnostics for the first broken row: which part disagrees and why.
CREATE OR REPLACE FUNCTION audit_chain_diag() RETURNS jsonb AS $$
DECLARE r record; prev text := NULL; expected text;
BEGIN
  FOR r IN SELECT * FROM "AuditLog" ORDER BY id LOOP
    IF r."hashPrev" IS DISTINCT FROM prev THEN
      RETURN jsonb_build_object('id', r.id, 'kind', 'hashPrev', 'stored', r."hashPrev", 'expected', prev);
    END IF;
    expected := audit_row_hash(prev, r.at, r."actorType", r."actorId",
      r.action, r.entity, r."entityId", r.data, r.visibility::text);
    IF r."hashSelf" IS DISTINCT FROM expected THEN
      RETURN jsonb_build_object('id', r.id, 'kind', 'hashSelf', 'stored', r."hashSelf", 'expected', expected);
    END IF;
    prev := r."hashSelf";
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
