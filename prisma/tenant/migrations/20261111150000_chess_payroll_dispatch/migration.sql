CREATE TYPE "ChessPayrollDispatchStatus" AS ENUM ('READY','SUBMITTING','SUBMITTED','REJECTED','UNKNOWN');
CREATE TABLE "ChessPayrollDispatch" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "legacyTenantId" TEXT NOT NULL,
 "legacyEntityId" TEXT NOT NULL,
 "legacyPayRunId" TEXT NOT NULL,
 "approvalId" TEXT NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "providerRequestId" TEXT,
 "status" "ChessPayrollDispatchStatus" NOT NULL DEFAULT 'READY',
 "lastErrorCode" TEXT,
 "submittedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessPayrollDispatch_approvalId_key" ON "ChessPayrollDispatch"("approvalId");
CREATE UNIQUE INDEX "ChessPayrollDispatch_idempotencyKey_key" ON "ChessPayrollDispatch"("idempotencyKey");
CREATE UNIQUE INDEX "ChessPayrollDispatch_businessId_legacyPayRunId_key" ON "ChessPayrollDispatch"("businessId","legacyPayRunId");
CREATE INDEX "ChessPayrollDispatch_businessId_status_idx" ON "ChessPayrollDispatch"("businessId","status");
