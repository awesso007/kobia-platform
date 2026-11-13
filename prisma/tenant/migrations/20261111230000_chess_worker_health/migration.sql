-- Tenant-scoped operational telemetry. No client PII or secrets.
CREATE TYPE "ChessWorkerKind" AS ENUM ('RECURRING_WORK','CALENDAR_SYNC');
CREATE TYPE "ChessWorkerRunStatus" AS ENUM ('SUCCESS','DEGRADED','FAILED');
CREATE TABLE "ChessWorkerRun" (
 "id" TEXT PRIMARY KEY,
 "kind" "ChessWorkerKind" NOT NULL,
 "status" "ChessWorkerRunStatus" NOT NULL,
 "examined" INTEGER NOT NULL DEFAULT 0,
 "processed" INTEGER NOT NULL DEFAULT 0,
 "blocked" INTEGER NOT NULL DEFAULT 0,
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChessWorkerRun_kind_occurredAt_idx" ON "ChessWorkerRun"("kind","occurredAt");
