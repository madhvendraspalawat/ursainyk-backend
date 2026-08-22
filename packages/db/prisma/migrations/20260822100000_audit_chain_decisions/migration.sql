-- CreateEnum
CREATE TYPE "AuditVisibility" AS ENUM ('ADMIN', 'SUPER');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('REVIEWER_CORRECTION', 'MATCHING', 'VERIFICATION_OUTCOME', 'SCORING_OVERRIDE');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hashPrev" TEXT,
ADD COLUMN     "hashSelf" TEXT,
ADD COLUMN     "visibility" "AuditVisibility" NOT NULL DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE "DecisionEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionType" "DecisionType" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "actorRole" TEXT,
    "actorId" TEXT,
    "context" JSONB,
    "input" JSONB,
    "output" JSONB,
    "label" TEXT,
    "rationale" TEXT,
    "auditLogId" BIGINT,
    "consentBasis" TEXT NOT NULL,
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "DecisionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectPseudonym" (
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectPseudonym_pkey" PRIMARY KEY ("subjectType","subjectId")
);

-- CreateIndex
CREATE INDEX "DecisionEvent_decisionType_at_idx" ON "DecisionEvent"("decisionType", "at");

-- CreateIndex
CREATE INDEX "DecisionEvent_subjectType_subjectKey_idx" ON "DecisionEvent"("subjectType", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectPseudonym_key_key" ON "SubjectPseudonym"("key");

-- CreateIndex
CREATE INDEX "AuditLog_visibility_at_idx" ON "AuditLog"("visibility", "at");


-- ── Hand-written: tamper-evident hash chain (ADR-0012) ───────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Single definition of a row's hash input, used by both the trigger and the
-- verifier. Change requires a new migration AND re-verification strategy.
CREATE OR REPLACE FUNCTION audit_row_hash(
  prev text, at_ timestamptz, actor_type text, actor_id text,
  action_ text, entity_ text, entity_id text, data_ jsonb, visibility_ text
) RETURNS text AS $$
  SELECT encode(digest(
    coalesce(prev, 'genesis')
    || '|' || extract(epoch from at_)::text
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
  -- Serialize chain appends (global chain). Xact-scoped: released on commit.
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));
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

-- Walks the whole chain; returns the id of the first broken row, or NULL if intact.
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
