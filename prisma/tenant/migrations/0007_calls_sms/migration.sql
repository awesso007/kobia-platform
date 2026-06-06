-- Sprint 7: Calling + SMS via Twilio. Phone numbers, calls, SMS threads +
-- messages, telephony routing rules, and per-user preferences. Additive only:
-- new enums + new tables. No DROP on existing data. Applied per tenant schema
-- via raw SQL + search_path.

-- AlterEnum: extend AutomationTrigger with the telephony trigger events.
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'SMS_RECEIVED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'CALL_COMPLETED';

-- CreateEnum
CREATE TYPE "PhoneNumberType" AS ENUM ('LOCAL', 'TOLL_FREE', 'MOBILE');
CREATE TYPE "PhoneNumberProvider" AS ENUM ('TWILIO', 'MANUAL');
CREATE TYPE "PhoneNumberStatus" AS ENUM ('ACTIVE', 'RELEASED', 'PORTING');
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED');
CREATE TYPE "SmsDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "SmsMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');
CREATE TYPE "TelephonyRuleKind" AS ENUM ('VOICE', 'SMS');

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "friendlyName" TEXT,
    "type" "PhoneNumberType" NOT NULL DEFAULT 'LOCAL',
    "provider" "PhoneNumberProvider" NOT NULL DEFAULT 'TWILIO',
    "providerSid" TEXT,
    "capabilities" JSONB,
    "assignedClerkUserId" TEXT,
    "status" "PhoneNumberStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchasedAt" TIMESTAMP(3),
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "fromE164" TEXT NOT NULL,
    "toE164" TEXT NOT NULL,
    "providerCallSid" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "recordingDurationSec" INTEGER,
    "transcript" TEXT,
    "voicemailUrl" TEXT,
    "ownerClerkUserId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "leadId" TEXT,
    "companyId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsThread" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "ourNumberE164" TEXT NOT NULL,
    "peerE164" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "fromE164" TEXT NOT NULL,
    "toE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrls" JSONB,
    "providerMessageSid" TEXT,
    "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelephonyRule" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "kind" "TelephonyRuleKind" NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "callForwardingE164" TEXT,
    "receiveCallNotifications" BOOLEAN NOT NULL DEFAULT true,
    "defaultOutboundNumberId" TEXT,
    "defaultEmailAccountId" TEXT,
    "defaultSignatureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_e164_key" ON "PhoneNumber"("e164");
CREATE INDEX "PhoneNumber_status_idx" ON "PhoneNumber"("status");
CREATE INDEX "PhoneNumber_assignedClerkUserId_idx" ON "PhoneNumber"("assignedClerkUserId");
CREATE INDEX "Call_contactId_idx" ON "Call"("contactId");
CREATE INDEX "Call_leadId_idx" ON "Call"("leadId");
CREATE INDEX "Call_dealId_idx" ON "Call"("dealId");
CREATE INDEX "Call_companyId_idx" ON "Call"("companyId");
CREATE INDEX "Call_ownerClerkUserId_startedAt_idx" ON "Call"("ownerClerkUserId", "startedAt" DESC);
CREATE INDEX "Call_providerCallSid_idx" ON "Call"("providerCallSid");
CREATE UNIQUE INDEX "SmsThread_ourNumberE164_peerE164_key" ON "SmsThread"("ourNumberE164", "peerE164");
CREATE INDEX "SmsThread_contactId_idx" ON "SmsThread"("contactId");
CREATE INDEX "SmsThread_leadId_idx" ON "SmsThread"("leadId");
CREATE INDEX "SmsMessage_threadId_idx" ON "SmsMessage"("threadId");
CREATE INDEX "SmsMessage_providerMessageSid_idx" ON "SmsMessage"("providerMessageSid");
CREATE INDEX "TelephonyRule_phoneNumberId_idx" ON "TelephonyRule"("phoneNumberId");
CREATE UNIQUE INDEX "UserPreference_clerkUserId_key" ON "UserPreference"("clerkUserId");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SmsThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelephonyRule" ADD CONSTRAINT "TelephonyRule_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
