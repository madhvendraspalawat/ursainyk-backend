-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PlacementStage" AS ENUM ('MET', 'SUITABLE', 'CALLBACK', 'PLACED', 'JOINED');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('ACTIVE', 'LEFT', 'WON_BACK');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('INVOICE_LINE', 'PAYOUT_LINE');

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "city" TEXT,
    "territoryId" TEXT,
    "salaryMinPaise" BIGINT,
    "salaryMaxPaise" BIGINT,
    "terms" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerIdentity" (
    "orgId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerIdentity_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "MatchSuggestion" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "suggestedById" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "centreId" TEXT,
    "territoryId" TEXT,
    "stage" "PlacementStage" NOT NULL DEFAULT 'MET',
    "joinedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "submittedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "orgId" TEXT,
    "centreId" TEXT,
    "placementId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Requirement_territoryId_status_idx" ON "Requirement"("territoryId", "status");

-- CreateIndex
CREATE INDEX "Requirement_orgId_status_idx" ON "Requirement"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSuggestion_requirementId_candidateId_key" ON "MatchSuggestion"("requirementId", "candidateId");

-- CreateIndex
CREATE INDEX "Placement_territoryId_stage_idx" ON "Placement"("territoryId", "stage");

-- CreateIndex
CREATE INDEX "Placement_requirementId_idx" ON "Placement"("requirementId");

-- CreateIndex
CREATE INDEX "Placement_candidateId_idx" ON "Placement"("candidateId");

-- CreateIndex
CREATE INDEX "Verification_period_outcome_idx" ON "Verification"("period", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_placementId_period_key" ON "Verification"("placementId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_period_kind_idx" ON "LedgerEntry"("period", "kind");

-- CreateIndex
CREATE INDEX "LedgerEntry_orgId_period_idx" ON "LedgerEntry"("orgId", "period");

-- CreateIndex
CREATE INDEX "LedgerEntry_centreId_period_idx" ON "LedgerEntry"("centreId", "period");

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "ContractorOrg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerIdentity" ADD CONSTRAINT "EmployerIdentity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "ContractorOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSuggestion" ADD CONSTRAINT "MatchSuggestion_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSuggestion" ADD CONSTRAINT "MatchSuggestion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "EsmCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written: territory RLS on Requirement + Placement (ADR-0007) ────────
-- Same scope contract as Candidate: unset -> deny, '*' -> unrestricted, list -> filter.
ALTER TABLE "Requirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Requirement" FORCE ROW LEVEL SECURITY;
CREATE POLICY requirement_territory_scope ON "Requirement"
  FOR ALL
  USING (
    current_setting('app.territory_ids', true) = '*'
    OR "territoryId" = ANY (app_territory_ids())
  )
  WITH CHECK (
    current_setting('app.territory_ids', true) = '*'
    OR "territoryId" = ANY (app_territory_ids())
  );

ALTER TABLE "Placement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Placement" FORCE ROW LEVEL SECURITY;
CREATE POLICY placement_territory_scope ON "Placement"
  FOR ALL
  USING (
    current_setting('app.territory_ids', true) = '*'
    OR "territoryId" = ANY (app_territory_ids())
  )
  WITH CHECK (
    current_setting('app.territory_ids', true) = '*'
    OR "territoryId" = ANY (app_territory_ids())
  );

-- ── Hand-written: immutable facts (ADR-0005) ─────────────────────────────────
CREATE OR REPLACE FUNCTION append_only_block() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (ADR-0005): % blocked', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_no_update_delete
  BEFORE UPDATE OR DELETE ON "Verification"
  FOR EACH ROW EXECUTE FUNCTION append_only_block();

CREATE TRIGGER ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION append_only_block();
