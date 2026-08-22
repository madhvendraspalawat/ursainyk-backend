-- AlterTable
ALTER TABLE "Credential" ADD COLUMN     "totpVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "relayedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outbox_relayedAt_at_idx" ON "Outbox"("relayedAt", "at");

