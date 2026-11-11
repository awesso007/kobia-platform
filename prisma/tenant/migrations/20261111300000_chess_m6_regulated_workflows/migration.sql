-- M6: metadata only. No taxpayer data, medical histories, investment
-- positions, mortgage applications, customer SSNs, quotes or trade orders.
CREATE TYPE "ChessAffiliationStatus" AS ENUM ('UNVERIFIED','VERIFIED','REJECTED','EXPIRED');
CREATE TABLE "ChessRegulatedAffiliation" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clerkUserId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "jurisdiction" TEXT NOT NULL,
 "practitionerRegistryId" TEXT NOT NULL,
 "firmRegistryId" TEXT NOT NULL,
 "status" "ChessAffiliationStatus" NOT NULL DEFAULT 'UNVERIFIED',
 "checkedAt" TIMESTAMP(3),
 "verifiedByClerkUserId" TEXT,
 "sourceUrl" TEXT,
 "expiresAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessRegulatedAffiliation_businessId_clerkUserId_service_key"
 ON "ChessRegulatedAffiliation"("businessId","clerkUserId","service");
CREATE INDEX "ChessRegulatedAffiliation_businessId_service_status_idx"
 ON "ChessRegulatedAffiliation"("businessId","service","status");

CREATE TYPE "ChessRegulatedWorkflowKind" AS ENUM (
 'MORTGAGE_APPLICATION_COORDINATION','MORTGAGE_DOCUMENT_INTAKE',
 'INSURANCE_COVERAGE_INTAKE','INSURANCE_APPLICATION_COORDINATION',
 'REAL_ESTATE_BUYER_INTAKE','REAL_ESTATE_SELLER_INTAKE',
 'INVESTMENTS_GOAL_DISCOVERY','INVESTMENTS_RISK_DISCOVERY'
);
CREATE TYPE "ChessRegulatedWorkflowStatus" AS ENUM (
 'DRAFT','REVIEW','APPROVED','SUBMITTING','SUBMITTED',
 'UNKNOWN','REJECTED','CLOSED'
);
CREATE TABLE "ChessRegulatedWorkflow" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "kind" "ChessRegulatedWorkflowKind" NOT NULL,
 "requestKey" TEXT NOT NULL,
 "status" "ChessRegulatedWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
 "createdByClerkUserId" TEXT NOT NULL,
 "reviewedByClerkUserId" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "approvedByClerkUserId" TEXT,
 "approvedAt" TIMESTAMP(3),
 "idempotencyKey" TEXT NOT NULL,
 "providerRequestId" TEXT,
 "lastErrorCode" TEXT,
 "submittedAt" TIMESTAMP(3),
 "providerCheckedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessRegulatedWorkflow_serviceCaseId_requestKey_key"
 ON "ChessRegulatedWorkflow"("serviceCaseId","requestKey");
CREATE UNIQUE INDEX "ChessRegulatedWorkflow_idempotencyKey_key"
 ON "ChessRegulatedWorkflow"("idempotencyKey");
CREATE INDEX "ChessRegulatedWorkflow_businessId_service_status_createdAt_idx"
 ON "ChessRegulatedWorkflow"("businessId","service","status","createdAt");

CREATE TABLE "ChessRegulatedChecklistItem" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "workflowId" TEXT NOT NULL,
 "itemKey" TEXT NOT NULL,
 "completedAt" TIMESTAMP(3),
 "completedByClerkUserId" TEXT,
 "evidenceDocumentId" TEXT,
 CONSTRAINT "ChessRegulatedChecklistItem_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "ChessRegulatedWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChessRegulatedChecklistItem_workflowId_itemKey_key"
 ON "ChessRegulatedChecklistItem"("workflowId","itemKey");
CREATE INDEX "ChessRegulatedChecklistItem_workflowId_completedAt_idx"
 ON "ChessRegulatedChecklistItem"("workflowId","completedAt");
