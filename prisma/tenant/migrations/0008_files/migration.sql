-- Sprint 8: Files + Document Library. File storage metadata, folders, polymorphic
-- attachments, and public share links. Additive only: new enums + new tables and
-- one new column on EmailAttachment. No DROP on existing data. Applied per tenant
-- schema via raw SQL + search_path.

-- AlterEnum: extend AutomationTrigger with the file upload trigger event.
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'FILE_UPLOADED';

-- CreateEnum
CREATE TYPE "FileStorageProvider" AS ENUM ('S3', 'LOCAL');
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED', 'DELETED');
CREATE TYPE "FileSource" AS ENUM ('MANUAL', 'EMAIL', 'SMS', 'AUTOMATION', 'WEBFORM');
CREATE TYPE "FileAttachmentEntity" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY', 'ACTIVITY', 'EMAIL_MESSAGE', 'SMS_MESSAGE', 'NOTE');

-- AlterTable: link existing EmailAttachment rows to the new File system (nullable
-- for backwards compatibility; storageKey is retained).
ALTER TABLE "EmailAttachment" ADD COLUMN IF NOT EXISTS "fileId" TEXT;

-- CreateTable
CREATE TABLE "FileFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "ownerClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FileFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "storageProvider" "FileStorageProvider" NOT NULL DEFAULT 'S3',
    "storageKey" TEXT NOT NULL,
    "storageBucket" TEXT,
    "sha256" TEXT,
    "uploadedByClerkUserId" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "previewKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "folderId" TEXT,
    "source" "FileSource" NOT NULL DEFAULT 'MANUAL',
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileAttachment" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "entityType" "FileAttachmentEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "attachedByClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileShareLink" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "password" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdByClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");
CREATE UNIQUE INDEX "FileShareLink_slug_key" ON "FileShareLink"("slug");
CREATE UNIQUE INDEX "FileAttachment_fileId_entityType_entityId_key" ON "FileAttachment"("fileId", "entityType", "entityId");

CREATE INDEX "EmailAttachment_fileId_idx" ON "EmailAttachment"("fileId");
CREATE INDEX "FileFolder_parentId_idx" ON "FileFolder"("parentId");
CREATE INDEX "File_folderId_idx" ON "File"("folderId");
CREATE INDEX "File_uploadedByClerkUserId_idx" ON "File"("uploadedByClerkUserId");
CREATE INDEX "File_createdAt_idx" ON "File"("createdAt" DESC);
CREATE INDEX "FileAttachment_entityType_entityId_idx" ON "FileAttachment"("entityType", "entityId");
CREATE INDEX "FileShareLink_fileId_idx" ON "FileShareLink"("fileId");

-- AddForeignKey
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FileFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "File" ADD CONSTRAINT "File_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
