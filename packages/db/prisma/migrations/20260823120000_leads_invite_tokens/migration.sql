-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('EMPLOYER', 'JOB_SEEKER', 'CENTRE_LEAD', 'OTHER');

-- CreateTable
CREATE TABLE "PasswordSetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordSetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audience" "Audience" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "district" TEXT,
    "sector" TEXT,
    "headcount" TEXT,
    "message" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "firstTouch" JSONB,
    "convertingPage" TEXT,
    "pagesViewed" JSONB,
    "sessionCount" INTEGER,
    "firstSeenAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "deviceInfo" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordSetToken_tokenHash_key" ON "PasswordSetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordSetToken_userId_idx" ON "PasswordSetToken"("userId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_audience_status_idx" ON "Lead"("audience", "status");

