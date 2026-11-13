-- M7 conservative daily AI request reservation, tenant-local.
-- No PII, model prompt or bank/tax data stored here.
CREATE TABLE "ChessAiUsageDaily" (
 "businessId" TEXT NOT NULL,
 "day" TIMESTAMP(3) NOT NULL,
 "callCount" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChessAiUsageDaily_pkey" PRIMARY KEY ("businessId","day"),
 CONSTRAINT "ChessAiUsageDaily_count_check" CHECK ("callCount">=0 AND "callCount"<=10000)
);
