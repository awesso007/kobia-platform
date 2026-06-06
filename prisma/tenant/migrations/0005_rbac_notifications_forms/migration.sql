-- Sprint 5: RBAC (Membership), in-app Notifications, Web-to-Lead forms.
-- Additive only: new enums + new tables. No DROP on existing data.

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'ASSIGNMENT', 'DUE_SOON', 'AUTOMATION_RESULT', 'SYSTEM');

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "email" TEXT,
    "displayName" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPref" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebForm" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldsConfig" JSONB NOT NULL,
    "thankYouUrl" TEXT,
    "redirectUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_clerkUserId_key" ON "Membership"("clerkUserId");
CREATE INDEX "Membership_role_idx" ON "Membership"("role");
CREATE INDEX "Membership_status_idx" ON "Membership"("status");
CREATE INDEX "Notification_clerkUserId_readAt_idx" ON "Notification"("clerkUserId", "readAt");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE UNIQUE INDEX "NotificationPref_clerkUserId_type_key" ON "NotificationPref"("clerkUserId", "type");
CREATE UNIQUE INDEX "WebForm_slug_key" ON "WebForm"("slug");
CREATE INDEX "WebForm_slug_idx" ON "WebForm"("slug");
