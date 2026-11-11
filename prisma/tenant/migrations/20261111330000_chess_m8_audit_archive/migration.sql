-- Out-of-band audit archive receipts; original ChessSecurityEvent trigger
-- continues to prevent UPDATE and DELETE on source audit evidence.
CREATE TYPE "ChessAuditArchiveStatus" AS ENUM ('PENDING','SUBMITTING','UNKNOWN','ARCHIVED','REJECTED');
CREATE TABLE "ChessAuditArchiveOutbox" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "eventId" TEXT NOT NULL,
 "digest" TEXT NOT NULL,
 "status" "ChessAuditArchiveStatus" NOT NULL DEFAULT 'PENDING',
 "receiptId" TEXT,
 "lastErrorCode" TEXT,
 "attemptedAt" TIMESTAMP(3),
 "archivedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessAuditArchiveOutbox_eventId_fkey"
 FOREIGN KEY ("eventId") REFERENCES "ChessSecurityEvent"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ChessAuditArchiveOutbox_digest_hmac"
 CHECK ("digest" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "ChessAuditArchiveOutbox_archive_receipt"
 CHECK ("status" <> 'ARCHIVED' OR ("receiptId" IS NOT NULL AND "archivedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "ChessAuditArchiveOutbox_eventId_key"
 ON "ChessAuditArchiveOutbox"("eventId");
CREATE INDEX "ChessAuditArchiveOutbox_status_createdAt_idx"
 ON "ChessAuditArchiveOutbox"("status","createdAt");
