-- Sprint 6: Email integration. Per-user mail accounts, threads, messages,
-- attachments, templates, signatures. Additive only: new enums + new tables.
-- No DROP on existing data. Applied per tenant schema via raw SQL + search_path.

-- AlterEnum: extend AutomationTrigger with the email trigger events.
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_SENT';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_RECEIVED';

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('SMTP_IMAP', 'GMAIL_OAUTH', 'OUTLOOK_OAUTH');
CREATE TYPE "EmailAccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "EmailMessageStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');
CREATE TYPE "EmailRecordType" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY');
CREATE TYPE "EmailTemplateScope" AS ENUM ('PERSONAL', 'TENANT');

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "ownerClerkUserId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'SMTP_IMAP',
    "displayName" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassEncrypted" TEXT,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapUser" TEXT,
    "imapPassEncrypted" TEXT,
    "oauthRefreshTokenEncrypted" TEXT,
    "status" "EmailAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "participantsJson" JSONB,
    "recordType" "EmailRecordType",
    "recordId" TEXT,
    "accountId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT,
    "direction" "EmailDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" JSONB NOT NULL,
    "ccAddresses" JSONB,
    "bccAddresses" JSONB,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "snippet" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'SENT',
    "errorMessage" TEXT,
    "repliedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "variables" JSONB,
    "scope" "EmailTemplateScope" NOT NULL DEFAULT 'PERSONAL',
    "ownerClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSignature" (
    "id" TEXT NOT NULL,
    "ownerClerkUserId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_ownerClerkUserId_address_key" ON "EmailAccount"("ownerClerkUserId", "address");
CREATE INDEX "EmailAccount_status_idx" ON "EmailAccount"("status");
CREATE INDEX "EmailThread_recordType_recordId_idx" ON "EmailThread"("recordType", "recordId");
CREATE INDEX "EmailThread_accountId_lastMessageAt_idx" ON "EmailThread"("accountId", "lastMessageAt");
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE INDEX "EmailMessage_externalId_idx" ON "EmailMessage"("externalId");
CREATE INDEX "EmailMessage_status_idx" ON "EmailMessage"("status");
CREATE INDEX "EmailAttachment_messageId_idx" ON "EmailAttachment"("messageId");
CREATE INDEX "EmailTemplate_scope_idx" ON "EmailTemplate"("scope");
CREATE INDEX "EmailSignature_ownerClerkUserId_idx" ON "EmailSignature"("ownerClerkUserId");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
