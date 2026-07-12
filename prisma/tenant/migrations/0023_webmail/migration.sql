-- Sprint 23: Webmail UI. Additive tenant-schema migration that turns the Sprint
-- 6 email tables into a Gmail-like inbox: folder/read/star flags + indexes on
-- EmailMessage, account-scoped labels/filters/drafts, and per-account fields on
-- EmailSignature. Additive only (new enum values, new columns, new tables); it
-- never renames or drops anything. Applied per tenant schema via raw SQL +
-- search_path (scripts/apply-0023-acme.ts). Every statement tolerates re-run.
--
-- No em-dashes in copy by project convention (use hyphens).

-- New folder enum for the mailbox.
CREATE TYPE "EmailFolder" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'SPAM', 'TRASH');

-- New automation triggers for star / label actions.
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_STARRED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_LABELED';

-- Additive columns on EmailMessage powering the inbox.
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "folder" "EmailFolder" NOT NULL DEFAULT 'INBOX';
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "EmailMessage_accountId_folder_receivedAt_idx" ON "EmailMessage"("accountId", "folder", "receivedAt");
CREATE INDEX IF NOT EXISTS "EmailMessage_accountId_threadId_receivedAt_idx" ON "EmailMessage"("accountId", "threadId", "receivedAt");

-- Additive per-account fields on the existing EmailSignature table.
ALTER TABLE "EmailSignature" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "EmailSignature" ADD COLUMN IF NOT EXISTS "name" TEXT;
CREATE INDEX IF NOT EXISTS "EmailSignature_accountId_idx" ON "EmailSignature"("accountId");

-- CreateTable EmailLabel.
CREATE TABLE IF NOT EXISTS "EmailLabel" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailMessageLabel.
CREATE TABLE IF NOT EXISTS "EmailMessageLabel" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessageLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailFilter.
CREATE TABLE IF NOT EXISTS "EmailFilter" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailDraft.
CREATE TABLE IF NOT EXISTS "EmailDraft" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "threadId" TEXT,
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "attachments" JSONB,
    "inReplyTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- Indexes and unique constraints for the new tables.
CREATE UNIQUE INDEX IF NOT EXISTS "EmailLabel_accountId_name_key" ON "EmailLabel"("accountId", "name");
CREATE INDEX IF NOT EXISTS "EmailLabel_accountId_idx" ON "EmailLabel"("accountId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailMessageLabel_messageId_labelId_key" ON "EmailMessageLabel"("messageId", "labelId");
CREATE INDEX IF NOT EXISTS "EmailMessageLabel_labelId_idx" ON "EmailMessageLabel"("labelId");

CREATE INDEX IF NOT EXISTS "EmailFilter_accountId_idx" ON "EmailFilter"("accountId");

CREATE INDEX IF NOT EXISTS "EmailDraft_accountId_updatedAt_idx" ON "EmailDraft"("accountId", "updatedAt");

-- Foreign keys (labels join table cascades with message + label).
ALTER TABLE "EmailMessageLabel" ADD CONSTRAINT "EmailMessageLabel_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessageLabel" ADD CONSTRAINT "EmailMessageLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "EmailLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
