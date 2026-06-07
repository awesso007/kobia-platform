-- Sprint 14: Documents - SharePoint-style folders, doc editor, eSign envelopes.
-- Additive only: new enums, new tables, two new values on the existing
-- SearchEntityType enum (DOCUMENT, DOC_FOLDER). No DROP on data.
-- Applied per tenant schema via raw SQL + search_path (scripts/apply-0014-acme.ts).

-- AlterEnum: SearchEntityType (index documents + folders).
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'DOC_FOLDER';

-- CreateEnum: Sprint 14 document enums.
CREATE TYPE "DocumentKind" AS ENUM ('FILE', 'DOC');
CREATE TYPE "DocumentPermissionLevel" AS ENUM ('VIEW', 'EDIT', 'OWNER');
CREATE TYPE "EnvelopeStatus" AS ENUM ('DRAFT', 'SENT', 'COMPLETED', 'VOIDED', 'DECLINED');
CREATE TYPE "EnvelopeSignerStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED');
CREATE TYPE "EnvelopeAuditEventType" AS ENUM ('CREATED', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'COMPLETED');

-- CreateTable DocFolder.
CREATE TABLE "DocFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocFolder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocFolder_parentId_idx" ON "DocFolder"("parentId");
CREATE INDEX "DocFolder_path_idx" ON "DocFolder"("path");

-- CreateTable Document.
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folderId" TEXT,
    "kind" "DocumentKind" NOT NULL DEFAULT 'FILE',
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT,
    "bodyHtml" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateTable DocumentVersion.
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT,
    "bodyHtml" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateTable DocumentShareLink.
CREATE TABLE "DocumentShareLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "password" TEXT,
    "expiresAt" TIMESTAMP(3),
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentShareLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentShareLink_token_key" ON "DocumentShareLink"("token");
CREATE INDEX "DocumentShareLink_documentId_idx" ON "DocumentShareLink"("documentId");
CREATE INDEX "DocumentShareLink_token_idx" ON "DocumentShareLink"("token");

-- CreateTable DocumentPermission.
CREATE TABLE "DocumentPermission" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "folderId" TEXT,
    "userId" TEXT,
    "role" TEXT,
    "permission" "DocumentPermissionLevel" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentPermission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentPermission_documentId_idx" ON "DocumentPermission"("documentId");
CREATE INDEX "DocumentPermission_folderId_idx" ON "DocumentPermission"("folderId");

-- CreateTable Envelope.
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EnvelopeStatus" NOT NULL DEFAULT 'DRAFT',
    "documentId" TEXT NOT NULL,
    "message" TEXT,
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Envelope_documentId_idx" ON "Envelope"("documentId");
CREATE INDEX "Envelope_status_idx" ON "Envelope"("status");

-- CreateTable EnvelopeSigner.
CREATE TABLE "EnvelopeSigner" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "EnvelopeSignerStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "token" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "signatureData" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    CONSTRAINT "EnvelopeSigner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnvelopeSigner_token_key" ON "EnvelopeSigner"("token");
CREATE INDEX "EnvelopeSigner_envelopeId_idx" ON "EnvelopeSigner"("envelopeId");
CREATE INDEX "EnvelopeSigner_token_idx" ON "EnvelopeSigner"("token");

-- CreateTable EnvelopeAuditEvent.
CREATE TABLE "EnvelopeAuditEvent" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "signerId" TEXT,
    "event" "EnvelopeAuditEventType" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnvelopeAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnvelopeAuditEvent_envelopeId_idx" ON "EnvelopeAuditEvent"("envelopeId");

-- AddForeignKey.
ALTER TABLE "DocFolder" ADD CONSTRAINT "DocFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeSigner" ADD CONSTRAINT "EnvelopeSigner_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeAuditEvent" ADD CONSTRAINT "EnvelopeAuditEvent_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeAuditEvent" ADD CONSTRAINT "EnvelopeAuditEvent_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "EnvelopeSigner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
