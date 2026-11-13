-- M7 business-scoped structured suggestions and billing metadata.
-- Neither table stores account details, prompts, financial document contents,
-- client payment methods, payroll wages, protected health data or tax returns.
CREATE TYPE "ChessAiSuggestionStatus" AS ENUM ('PENDING','ACCEPTED','REJECTED','STALE');
CREATE TYPE "ChessAiPriority" AS ENUM ('LOW','NORMAL','HIGH');
CREATE TYPE "ChessAiRecommendation" AS ENUM ('KEEP_QUEUE','REVIEW_DEADLINE','ESCALATE_TO_MANAGER');
CREATE TABLE "ChessAiSuggestion" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "workItemId" TEXT NOT NULL,
 "sourceDigest" TEXT NOT NULL,
 "priority" "ChessAiPriority" NOT NULL,
 "recommendation" "ChessAiRecommendation" NOT NULL,
 "rationaleCode" TEXT NOT NULL,
 "modelVersion" TEXT NOT NULL,
 "status" "ChessAiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
 "requestedByClerkUserId" TEXT NOT NULL,
 "reviewedByClerkUserId" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessAiSuggestion_sourceDigest_sha256" CHECK ("sourceDigest" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "ChessAiSuggestion_workItemId_sourceDigest_key"
 ON "ChessAiSuggestion"("workItemId","sourceDigest");
CREATE INDEX "ChessAiSuggestion_businessId_status_createdAt_idx"
 ON "ChessAiSuggestion"("businessId","status","createdAt");

CREATE TYPE "ChessBillingInvoiceStatus" AS ENUM (
 'DRAFT','APPROVED','SUBMITTING','SENT','UNKNOWN','REJECTED','VOID'
);
CREATE TABLE "ChessBillingInvoice" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "requestKey" TEXT NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'USD',
 "amountCents" BIGINT NOT NULL,
 "descriptionCode" TEXT NOT NULL,
 "status" "ChessBillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
 "sourceDigest" TEXT NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "createdByClerkUserId" TEXT NOT NULL,
 "approvedByClerkUserId" TEXT,
 "approvedAt" TIMESTAMP(3),
 "sentByClerkUserId" TEXT,
 "sentAt" TIMESTAMP(3),
 "providerInvoiceId" TEXT,
 "lastErrorCode" TEXT,
 "providerCheckedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessBillingInvoice_amount_positive" CHECK ("amountCents">0 AND "amountCents"<=1000000000),
 CONSTRAINT "ChessBillingInvoice_currency_usd" CHECK ("currency"='USD'),
 CONSTRAINT "ChessBillingInvoice_sourceDigest_sha256" CHECK ("sourceDigest" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "ChessBillingInvoice_serviceCaseId_requestKey_key"
 ON "ChessBillingInvoice"("serviceCaseId","requestKey");
CREATE UNIQUE INDEX "ChessBillingInvoice_idempotencyKey_key"
 ON "ChessBillingInvoice"("idempotencyKey");
CREATE INDEX "ChessBillingInvoice_businessId_status_createdAt_idx"
 ON "ChessBillingInvoice"("businessId","status","createdAt");
CREATE INDEX "ChessBillingInvoice_clientProfileId_businessId_idx"
 ON "ChessBillingInvoice"("clientProfileId","businessId");
