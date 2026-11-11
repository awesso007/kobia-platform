-- CHESS CORP 2 additive tenant-schema migration.
-- Apply using prisma migrate deploy against each tenant schema with a verified
-- backup and a release window. Do not run against public accidentally.
CREATE TYPE "ClientServiceArea" AS ENUM ('ACCOUNTING', 'BOOKKEEPING', 'PAYROLL', 'TAX', 'MORTGAGE', 'INSURANCE', 'REAL_ESTATE', 'INVESTMENTS');
CREATE TYPE "BusinessUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "BusinessAssignmentRole" AS ENUM ('MANAGER', 'PRACTITIONER', 'SUPPORT');
CREATE TYPE "ChessConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "ChessWorkStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ChessCaseStatus" AS ENUM ('INTAKE', 'REVIEW', 'ACTIVE', 'HOLD', 'CLOSED');
CREATE TYPE "ChessCredentialStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "ChessApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ChessDocumentStatus" AS ENUM ('PENDING', 'QUARANTINED', 'READY', 'REJECTED');

CREATE TABLE "ClientProfile" (
 "id" TEXT PRIMARY KEY,
 "displayName" TEXT NOT NULL,
 "contactId" TEXT,
 "ownerClerkUserId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ClientProfile_contactId_key" ON "ClientProfile"("contactId");
CREATE INDEX "ClientProfile_displayName_idx" ON "ClientProfile"("displayName");
CREATE INDEX "ClientProfile_ownerClerkUserId_idx" ON "ClientProfile"("ownerClerkUserId");

CREATE TABLE "ClientServiceLink" (
 "id" TEXT PRIMARY KEY,
 "profileId" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "externalId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ClientServiceLink_profileId_businessId_service_key" ON "ClientServiceLink"("profileId","businessId","service");
CREATE INDEX "ClientServiceLink_businessId_service_idx" ON "ClientServiceLink"("businessId","service");
CREATE INDEX "ClientServiceLink_service_externalId_idx" ON "ClientServiceLink"("service","externalId");
ALTER TABLE "ClientServiceLink" ADD CONSTRAINT "ClientServiceLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientServiceGrant" (
 "id" TEXT PRIMARY KEY,
 "linkId" TEXT NOT NULL,
 "clerkUserId" TEXT NOT NULL,
 "canRead" BOOLEAN NOT NULL DEFAULT false,
 "canWrite" BOOLEAN NOT NULL DEFAULT false,
 "revokedAt" TIMESTAMP(3),
 "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ClientServiceGrant_linkId_clerkUserId_key" ON "ClientServiceGrant"("linkId","clerkUserId");
CREATE INDEX "ClientServiceGrant_clerkUserId_revokedAt_idx" ON "ClientServiceGrant"("clerkUserId","revokedAt");
ALTER TABLE "ClientServiceGrant" ADD CONSTRAINT "ClientServiceGrant_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClientServiceLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChessBusinessUnit" (
 "id" TEXT PRIMARY KEY,
 "slug" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "legalName" TEXT,
 "status" "BusinessUnitStatus" NOT NULL DEFAULT 'ACTIVE',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessBusinessUnit_slug_key" ON "ChessBusinessUnit"("slug");

CREATE TABLE "ChessEmployeeAssignment" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clerkUserId" TEXT NOT NULL,
 "role" "BusinessAssignmentRole" NOT NULL DEFAULT 'SUPPORT',
 "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ChessEmployeeAssignment_businessId_clerkUserId_key" ON "ChessEmployeeAssignment"("businessId","clerkUserId");
CREATE INDEX "ChessEmployeeAssignment_clerkUserId_revokedAt_idx" ON "ChessEmployeeAssignment"("clerkUserId","revokedAt");
ALTER TABLE "ChessEmployeeAssignment" ADD CONSTRAINT "ChessEmployeeAssignment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "ChessBusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChessClientConsent" (
 "id" TEXT PRIMARY KEY,
 "clientProfileId" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "purpose" TEXT NOT NULL,
 "policyVersion" TEXT NOT NULL,
 "status" "ChessConsentStatus" NOT NULL DEFAULT 'PENDING',
 "consentedAt" TIMESTAMP(3),
 "acceptedByClerkUserId" TEXT,
 "verifiedEmailDigest" TEXT,
 "acceptanceEvidenceDigest" TEXT,
 "withdrawnAt" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChessClientConsent_clientProfileId_businessId_purpose_status_idx" ON "ChessClientConsent"("clientProfileId","businessId","purpose","status");

CREATE TABLE "ChessIntakeItem" (
 "id" TEXT PRIMARY KEY,
 "clientProfileId" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "required" BOOLEAN NOT NULL DEFAULT true,
 "completedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChessIntakeItem_clientProfileId_businessId_idx" ON "ChessIntakeItem"("clientProfileId","businessId");

CREATE TABLE "ChessWorkItem" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT,
 "title" TEXT NOT NULL,
 "status" "ChessWorkStatus" NOT NULL DEFAULT 'TODO',
 "assignedClerkUserId" TEXT,
 "dueAt" TIMESTAMP(3),
 "completedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChessWorkItem_businessId_status_dueAt_idx" ON "ChessWorkItem"("businessId","status","dueAt");
CREATE INDEX "ChessWorkItem_assignedClerkUserId_status_idx" ON "ChessWorkItem"("assignedClerkUserId","status");

CREATE TABLE "ChessServiceCase" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "status" "ChessCaseStatus" NOT NULL DEFAULT 'INTAKE',
 "referenceId" TEXT,
 "ownerClerkUserId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChessServiceCase_businessId_service_status_idx" ON "ChessServiceCase"("businessId","service","status");
CREATE INDEX "ChessServiceCase_clientProfileId_businessId_idx" ON "ChessServiceCase"("clientProfileId","businessId");

CREATE TABLE "ChessPractitionerCredential" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clerkUserId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "credentialType" TEXT NOT NULL,
 "credentialLastFour" TEXT,
 "jurisdiction" TEXT NOT NULL,
 "status" "ChessCredentialStatus" NOT NULL DEFAULT 'UNVERIFIED',
 "expiresAt" TIMESTAMP(3),
 "verifiedAt" TIMESTAMP(3),
 "verifiedByClerkUserId" TEXT,
 "verificationSource" TEXT,
 "registryCheckedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChessPractitionerCredential_businessId_service_clerkUserId_status_idx" ON "ChessPractitionerCredential"("businessId","service","clerkUserId","status");

CREATE TABLE "ChessActionApproval" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "actionType" TEXT NOT NULL,
 "payloadDigest" TEXT NOT NULL,
 "requestedBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "status" "ChessApprovalStatus" NOT NULL DEFAULT 'PENDING',
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChessActionApproval_businessId_status_createdAt_idx" ON "ChessActionApproval"("businessId","status","createdAt");

CREATE TABLE "ChessSecurityEvent" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT,
 "actorClerkUserId" TEXT,
 "action" TEXT NOT NULL,
 "resourceType" TEXT NOT NULL,
 "resourceId" TEXT,
 "decision" TEXT NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChessSecurityEvent_businessId_occurredAt_idx" ON "ChessSecurityEvent"("businessId","occurredAt");
CREATE INDEX "ChessSecurityEvent_actorClerkUserId_occurredAt_idx" ON "ChessSecurityEvent"("actorClerkUserId","occurredAt");

CREATE TABLE "ChessClientDocument" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "storageKey" TEXT NOT NULL,
 "fileName" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL,
 "maxBytes" INTEGER NOT NULL,
 "actualBytes" INTEGER,
 "checksumSha256" TEXT,
 "status" "ChessDocumentStatus" NOT NULL DEFAULT 'PENDING',
 "uploadedByClerkUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "verifiedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ChessClientDocument_storageKey_key" ON "ChessClientDocument"("storageKey");
CREATE INDEX "ChessClientDocument_businessId_clientProfileId_service_status_idx" ON "ChessClientDocument"("businessId","clientProfileId","service","status");

CREATE TABLE "ChessFinancialLink" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "legacyTenantId" TEXT NOT NULL,
 "legacyEntityId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChessFinancialLink_serviceCaseId_key" ON "ChessFinancialLink"("serviceCaseId");
CREATE UNIQUE INDEX "ChessFinancialLink_businessId_clientProfileId_service_legacyEntityId_key" ON "ChessFinancialLink"("businessId","clientProfileId","service","legacyEntityId");
CREATE INDEX "ChessFinancialLink_legacyTenantId_legacyEntityId_idx" ON "ChessFinancialLink"("legacyTenantId","legacyEntityId");
