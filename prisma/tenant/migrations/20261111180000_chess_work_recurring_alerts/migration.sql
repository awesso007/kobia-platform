-- CHESS CORP 2 - recurring work and in-app notifications.
-- Apply to each tenant schema only after backing up that tenant.
CREATE TYPE "ChessRecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "ChessWorkRecurrence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "clientProfileId" TEXT,
  "title" TEXT NOT NULL,
  "assignedClerkUserId" TEXT,
  "frequency" "ChessRecurrenceFrequency" NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "anchorDay" INTEGER NOT NULL,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByClerkUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChessWorkRecurrence_active_nextRunAt_idx" ON "ChessWorkRecurrence"("active","nextRunAt");
CREATE INDEX "ChessWorkRecurrence_businessId_active_idx" ON "ChessWorkRecurrence"("businessId","active");
ALTER TABLE "ChessWorkRecurrence" ADD CONSTRAINT "ChessWorkRecurrence_interval_range"
  CHECK ("interval" BETWEEN 1 AND 12);
ALTER TABLE "ChessWorkRecurrence" ADD CONSTRAINT "ChessWorkRecurrence_anchor_day_range"
  CHECK ("anchorDay" BETWEEN 1 AND 31);

ALTER TABLE "ChessWorkItem" ADD COLUMN "recurrenceId" TEXT;
ALTER TABLE "ChessWorkItem" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE UNIQUE INDEX "ChessWorkItem_recurrenceId_scheduledFor_key" ON "ChessWorkItem"("recurrenceId", "scheduledFor");
ALTER TABLE "ChessWorkItem" ADD CONSTRAINT "ChessWorkItem_recurrenceId_fkey"
  FOREIGN KEY ("recurrenceId") REFERENCES "ChessWorkRecurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChessEmployeeAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "recipientClerkUserId" TEXT NOT NULL,
  "workItemId" TEXT,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChessEmployeeAlert_dedupeKey_key" ON "ChessEmployeeAlert"("dedupeKey");
CREATE INDEX "ChessEmployeeAlert_recipientClerkUserId_readAt_createdAt_idx"
  ON "ChessEmployeeAlert"("recipientClerkUserId","readAt","createdAt");
CREATE INDEX "ChessEmployeeAlert_businessId_createdAt_idx"
  ON "ChessEmployeeAlert"("businessId","createdAt");
