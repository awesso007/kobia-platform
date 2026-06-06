-- Sprint 13: Marketing - segments, broadcasts, drip campaigns, landing pages.
-- Additive only: new enums, new tables, new values on the existing
-- SearchEntityType enum (LANDING_PAGE, BROADCAST). No DROP on data.
-- Automation action kinds (SEND_BROADCAST, ENROLL_IN_CAMPAIGN, ADD_TO_SEGMENT)
-- live in the free-form Automation.actions Json column, so no enum change there.
-- Applied per tenant schema via raw SQL + search_path (scripts/apply-0013-acme.ts).

-- AlterEnum: SearchEntityType (index landing pages + broadcasts).
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'LANDING_PAGE';
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'BROADCAST';

-- CreateEnum: Sprint 13 marketing enums.
CREATE TYPE "SegmentEntityType" AS ENUM ('contact', 'lead');
CREATE TYPE "BroadcastChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "BroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED', 'FAILED');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "CampaignTriggerType" AS ENUM ('MANUAL', 'SEGMENT_ENTRY', 'TAG_ADDED', 'FORM_SUBMITTED');
CREATE TYPE "CampaignStepType" AS ENUM ('EMAIL', 'SMS', 'WAIT', 'CONDITION', 'TAG', 'WEBHOOK');
CREATE TYPE "CampaignEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'FAILED');
CREATE TYPE "LandingPageStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "UnsubscribeSource" AS ENUM ('BROADCAST', 'CAMPAIGN', 'MANUAL', 'PORTAL');

-- CreateTable Segment.
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filterJson" JSONB NOT NULL,
    "entityType" "SegmentEntityType" NOT NULL DEFAULT 'contact',
    "recipientCountCache" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Segment_entityType_idx" ON "Segment"("entityType");

-- CreateTable Broadcast.
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "BroadcastChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "fromNumber" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "segmentId" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "statsJson" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Broadcast_segmentId_idx" ON "Broadcast"("segmentId");
CREATE INDEX "Broadcast_status_idx" ON "Broadcast"("status");

-- CreateTable BroadcastRecipient.
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "BroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BroadcastRecipient_broadcastId_idx" ON "BroadcastRecipient"("broadcastId");
CREATE INDEX "BroadcastRecipient_status_idx" ON "BroadcastRecipient"("status");

-- CreateTable Campaign.
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "CampaignTriggerType" NOT NULL DEFAULT 'MANUAL',
    "triggerConfigJson" JSONB NOT NULL,
    "segmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_segmentId_idx" ON "Campaign"("segmentId");
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateTable CampaignStep.
CREATE TABLE "CampaignStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "CampaignStepType" NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CampaignStep_campaignId_idx" ON "CampaignStep"("campaignId");

-- CreateTable CampaignEnrollment.
CREATE TABLE "CampaignEnrollment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "currentStepId" TEXT,
    "status" "CampaignEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStepAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "dataJson" JSONB,
    CONSTRAINT "CampaignEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CampaignEnrollment_campaignId_idx" ON "CampaignEnrollment"("campaignId");
CREATE INDEX "CampaignEnrollment_status_idx" ON "CampaignEnrollment"("status");
CREATE INDEX "CampaignEnrollment_nextRunAt_idx" ON "CampaignEnrollment"("nextRunAt");

-- CreateTable LandingPage.
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LandingPageStatus" NOT NULL DEFAULT 'DRAFT',
    "htmlContent" TEXT NOT NULL,
    "cssContent" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "formId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");
CREATE INDEX "LandingPage_status_idx" ON "LandingPage"("status");

-- CreateTable LandingPageView.
CREATE TABLE "LandingPageView" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LandingPageView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LandingPageView_pageId_idx" ON "LandingPageView"("pageId");

-- CreateTable Unsubscribe.
CREATE TABLE "Unsubscribe" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "reason" TEXT,
    "source" "UnsubscribeSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Unsubscribe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Unsubscribe_email_key" ON "Unsubscribe"("email");

-- AddForeignKey.
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignStep" ADD CONSTRAINT "CampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "CampaignStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LandingPageView" ADD CONSTRAINT "LandingPageView_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
