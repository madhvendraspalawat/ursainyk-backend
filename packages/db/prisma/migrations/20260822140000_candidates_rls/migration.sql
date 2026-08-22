-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "territoryId" TEXT,
    "centreId" TEXT,
    "createdById" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "languages" TEXT[],
    "qualification" TEXT,
    "educationLevel" TEXT,
    "totalExpMonths" INTEGER,
    "relevantExpMonths" INTEGER,
    "city" TEXT,
    "pincode" TEXT,
    "locationFlexible" BOOLEAN,
    "profile" JSONB,
    "score" INTEGER,
    "scoreBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_userId_key" ON "Candidate"("userId");

-- CreateIndex
CREATE INDEX "Candidate_territoryId_status_idx" ON "Candidate"("territoryId", "status");

-- CreateIndex
CREATE INDEX "Candidate_phone_idx" ON "Candidate"("phone");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "EsmCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Hand-written: territory RLS on Candidate (ADR-0007) ──────────────────────
-- FORCE: the app connects as the table owner, and owners bypass plain RLS.
ALTER TABLE "Candidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Candidate" FORCE ROW LEVEL SECURITY;

-- Scope contract: app.territory_ids unset -> deny all (fail closed);
-- '*' -> unrestricted (self/admin paths, which add their own ownership filters);
-- otherwise a comma-joined uuid list (ESM sessions).
CREATE POLICY candidate_territory_scope ON "Candidate"
  FOR ALL
  USING (
    current_setting('app.territory_ids', true) = '*'
    OR "territoryId" = ANY (app_territory_ids())
  )
  WITH CHECK (
    current_setting('app.territory_ids', true) = '*'
    OR "territoryId" = ANY (app_territory_ids())
  );
