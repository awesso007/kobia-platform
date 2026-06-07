-- Sprint 15: Helpdesk - ticketing, SLA, knowledge base, customer portal.
-- Additive only: new enums, new tables, two new values on SearchEntityType
-- (TICKET, KB_ARTICLE), and a tenant-level sequence for ticket numbers.
-- Applied per tenant schema via raw SQL + search_path (scripts/apply-0015-acme.ts).

-- AlterEnum: SearchEntityType (index tickets + KB articles).
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'TICKET';
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'KB_ARTICLE';

-- CreateEnum: Sprint 15 helpdesk enums.
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TicketChannel" AS ENUM ('EMAIL', 'PORTAL', 'PHONE', 'CHAT', 'MANUAL');
CREATE TYPE "TicketAuthorType" AS ENUM ('AGENT', 'CUSTOMER', 'SYSTEM');
CREATE TYPE "TicketAuditEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'REPLIED', 'INTERNAL_NOTE', 'MERGED', 'CLOSED', 'REOPENED', 'SLA_BREACHED');
CREATE TYPE "KbStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "KbVisibility" AS ENUM ('PUBLIC', 'INTERNAL', 'AUTHENTICATED');

-- CreateSequence: ticket numbers start at 1001, unique within the tenant schema.
CREATE SEQUENCE IF NOT EXISTS "ticket_number_seq" START 1001;

-- CreateTable Team.
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "memberIdsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Team_name_idx" ON "Team"("name");

-- CreateTable SlaPolicy.
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "firstResponseMinutes" INTEGER NOT NULL DEFAULT 60,
    "resolveMinutes" INTEGER NOT NULL DEFAULT 1440,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "priorityOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SlaPolicy_name_idx" ON "SlaPolicy"("name");

-- CreateTable TicketCategory.
CREATE TABLE "TicketCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slaPolicyId" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketCategory_name_idx" ON "TicketCategory"("name");

-- CreateTable Ticket.
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "channel" "TicketChannel" NOT NULL DEFAULT 'MANUAL',
    "requesterContactId" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "assigneeId" TEXT,
    "teamId" TEXT,
    "categoryId" TEXT,
    "slaPolicyId" TEXT,
    "firstResponseDueAt" TIMESTAMP(3),
    "resolveDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFieldsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");
CREATE INDEX "Ticket_status_priority_idx" ON "Ticket"("status", "priority");
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");
CREATE INDEX "Ticket_teamId_idx" ON "Ticket"("teamId");
CREATE INDEX "Ticket_requesterEmail_idx" ON "Ticket"("requesterEmail");
CREATE INDEX "Ticket_number_idx" ON "Ticket"("number");
CREATE INDEX "Ticket_categoryId_idx" ON "Ticket"("categoryId");

-- CreateTable TicketMessage.
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "TicketAuthorType" NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateTable TicketAttachment.
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateTable TicketWatcher.
CREATE TABLE "TicketWatcher" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketWatcher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketWatcher_ticketId_userId_key" ON "TicketWatcher"("ticketId", "userId");
CREATE INDEX "TicketWatcher_ticketId_idx" ON "TicketWatcher"("ticketId");

-- CreateTable KbCategory.
CREATE TABLE "KbCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KbCategory_slug_key" ON "KbCategory"("slug");
CREATE INDEX "KbCategory_slug_idx" ON "KbCategory"("slug");

-- CreateTable KbArticle.
CREATE TABLE "KbArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "summary" TEXT,
    "categoryId" TEXT,
    "status" "KbStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "KbVisibility" NOT NULL DEFAULT 'PUBLIC',
    "authorId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KbArticle_slug_key" ON "KbArticle"("slug");
CREATE INDEX "KbArticle_slug_idx" ON "KbArticle"("slug");
CREATE INDEX "KbArticle_categoryId_idx" ON "KbArticle"("categoryId");
CREATE INDEX "KbArticle_status_idx" ON "KbArticle"("status");

-- CreateTable KbFeedback.
CREATE TABLE "KbFeedback" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KbFeedback_articleId_idx" ON "KbFeedback"("articleId");

-- CreateTable CustomerPortalSession.
CREATE TABLE "CustomerPortalSession" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerPortalSession_token_key" ON "CustomerPortalSession"("token");
CREATE INDEX "CustomerPortalSession_token_idx" ON "CustomerPortalSession"("token");
CREATE INDEX "CustomerPortalSession_contactId_idx" ON "CustomerPortalSession"("contactId");

-- CreateTable TicketAuditEvent.
CREATE TABLE "TicketAuditEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorType" "TicketAuthorType" NOT NULL,
    "actorId" TEXT,
    "event" "TicketAuditEventType" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketAuditEvent_ticketId_idx" ON "TicketAuditEvent"("ticketId");

-- AddForeignKey.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterContactId_fkey" FOREIGN KEY ("requesterContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KbArticle" ADD CONSTRAINT "KbArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KbCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KbFeedback" ADD CONSTRAINT "KbFeedback_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KbArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketAuditEvent" ADD CONSTRAINT "TicketAuditEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
