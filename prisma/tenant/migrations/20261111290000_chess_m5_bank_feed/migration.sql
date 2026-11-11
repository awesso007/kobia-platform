-- Optional bank import metadata. Actual bank data stays in KOBIA's
-- legacy entity-scoped BankTransaction table. No credentials or raw bank data.
CREATE TABLE "ChessBankFeedConnection" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "legacyTenantId" TEXT NOT NULL,
 "legacyEntityId" TEXT NOT NULL,
 "legacyBankAccountId" TEXT NOT NULL,
 "providerAccountRef" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT false,
 "createdByClerkUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessBankFeedConnection_serviceCaseId_legacyBankAccountId_key"
 ON "ChessBankFeedConnection"("serviceCaseId","legacyBankAccountId");
CREATE INDEX "ChessBankFeedConnection_businessId_active_idx"
 ON "ChessBankFeedConnection"("businessId","active");

CREATE TYPE "ChessBankFeedSyncStatus" AS ENUM ('STARTED','COMPLETED','FAILED');
CREATE TABLE "ChessBankFeedSyncRun" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "connectionId" TEXT NOT NULL,
 "requestedStartAt" TIMESTAMP(3) NOT NULL,
 "status" "ChessBankFeedSyncStatus" NOT NULL DEFAULT 'STARTED',
 "fetchedCount" INTEGER NOT NULL DEFAULT 0,
 "insertedCount" INTEGER NOT NULL DEFAULT 0,
 "errorCode" TEXT,
 "initiatedByClerkUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessBankFeedSyncRun_counts" CHECK ("fetchedCount">=0 AND "insertedCount">=0 AND "insertedCount"<="fetchedCount")
);
CREATE INDEX "ChessBankFeedSyncRun_connectionId_createdAt_idx"
 ON "ChessBankFeedSyncRun"("connectionId","createdAt");
CREATE INDEX "ChessBankFeedSyncRun_businessId_status_idx"
 ON "ChessBankFeedSyncRun"("businessId","status");
