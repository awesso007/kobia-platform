-- M5 read-only finance bridge review metadata; no PII, account credentials,
-- bank transactions, tax IDs, or payroll employee details stored here.
CREATE TYPE "ChessBankReviewStatus" AS ENUM ('PENDING','APPROVED','REJECTED','STALE');
CREATE TABLE "ChessBankReview" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "legacyTenantId" TEXT NOT NULL,
 "legacyEntityId" TEXT NOT NULL,
 "legacyBankTransactionId" TEXT NOT NULL,
 "transactionDigest" TEXT NOT NULL,
 "suggestedAccountId" TEXT,
 "confidenceBasisPoints" INTEGER,
 "approvedAccountId" TEXT,
 "status" "ChessBankReviewStatus" NOT NULL DEFAULT 'PENDING',
 "createdByClerkUserId" TEXT NOT NULL,
 "reviewedByClerkUserId" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessBankReview_confidence_range" CHECK ("confidenceBasisPoints" IS NULL OR "confidenceBasisPoints" BETWEEN 0 AND 10000)
);
CREATE UNIQUE INDEX "ChessBankReview_serviceCaseId_legacyBankTransactionId_key" ON "ChessBankReview"("serviceCaseId","legacyBankTransactionId");
CREATE INDEX "ChessBankReview_businessId_status_createdAt_idx" ON "ChessBankReview"("businessId","status","createdAt");

CREATE TYPE "ChessTaxWorkpaperStatus" AS ENUM ('DRAFT','REVIEWED','APPROVED','SUPERSEDED');
CREATE TABLE "ChessTaxWorkpaper" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "legacyTenantId" TEXT NOT NULL,
 "legacyEntityId" TEXT NOT NULL,
 "taxYear" INTEGER NOT NULL,
 "startAt" TIMESTAMP(3) NOT NULL,
 "endAt" TIMESTAMP(3) NOT NULL,
 "snapshotDigest" TEXT NOT NULL,
 "sourceEntryCount" INTEGER NOT NULL,
 "status" "ChessTaxWorkpaperStatus" NOT NULL DEFAULT 'DRAFT',
 "createdByClerkUserId" TEXT NOT NULL,
 "reviewedByClerkUserId" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "approvedByClerkUserId" TEXT,
 "approvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessTaxWorkpaper_year_range" CHECK ("taxYear" BETWEEN 2000 AND 2100),
 CONSTRAINT "ChessTaxWorkpaper_dates" CHECK ("startAt"<"endAt"),
 CONSTRAINT "ChessTaxWorkpaper_source_count" CHECK ("sourceEntryCount">=0)
);
CREATE UNIQUE INDEX "ChessTaxWorkpaper_serviceCaseId_taxYear_snapshotDigest_key" ON "ChessTaxWorkpaper"("serviceCaseId","taxYear","snapshotDigest");
CREATE INDEX "ChessTaxWorkpaper_businessId_taxYear_status_idx" ON "ChessTaxWorkpaper"("businessId","taxYear","status");

ALTER TYPE "ChessPayrollDispatchStatus" ADD VALUE 'PROVIDER_PAID';
ALTER TYPE "ChessPayrollDispatchStatus" ADD VALUE 'PROVIDER_FAILED';
ALTER TABLE "ChessPayrollDispatch" ADD COLUMN "providerCheckedAt" TIMESTAMP(3);
