-- Calendar bridge outbox. Provider is disabled until per-employee consent
-- and an approved external calendar gateway have been configured.
CREATE TYPE "ChessCalendarSyncStatus" AS ENUM ('PENDING','SUBMITTING','SYNCED','REJECTED','UNKNOWN','CANCELLED');
CREATE TABLE "ChessCalendarOutbox" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "workItemId" TEXT NOT NULL,
 "recipientClerkUserId" TEXT NOT NULL,
 "scheduledFor" TIMESTAMP(3) NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "providerEventId" TEXT,
 "status" "ChessCalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
 "lastErrorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessCalendarOutbox_workItemId_key" ON "ChessCalendarOutbox"("workItemId");
CREATE UNIQUE INDEX "ChessCalendarOutbox_idempotencyKey_key" ON "ChessCalendarOutbox"("idempotencyKey");
CREATE INDEX "ChessCalendarOutbox_businessId_status_idx" ON "ChessCalendarOutbox"("businessId","status");
