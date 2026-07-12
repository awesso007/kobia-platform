-- Sprint 22: Workgroups / Projects Hub. Additive tenant-schema migration adding
-- Bitrix24-style scoped workspaces (Workgroup) with membership, invites, and
-- join requests, plus nullable workgroupId cross-links on existing modules
-- (Task, CalendarEvent, Document, ChatChannel; FeedPost already has it).
--
-- Additive only: new enums, new tables, new nullable columns + indexes. Applied
-- per tenant schema via raw SQL + search_path (scripts/apply-0022-acme.ts).
-- Every statement tolerates "already exists" on re-run.

-- CreateEnum: Sprint 22 workgroup enums.
CREATE TYPE "WorkgroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'SECRET');
CREATE TYPE "WorkgroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "WorkgroupMemberRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');
CREATE TYPE "WorkgroupInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');
CREATE TYPE "WorkgroupJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable Workgroup.
CREATE TABLE IF NOT EXISTS "Workgroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "WorkgroupVisibility" NOT NULL DEFAULT 'PUBLIC',
    "icon" TEXT,
    "coverColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "ownerId" TEXT NOT NULL,
    "status" "WorkgroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "chatChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workgroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkgroupMember.
CREATE TABLE IF NOT EXISTS "WorkgroupMember" (
    "id" TEXT NOT NULL,
    "workgroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkgroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "WorkgroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkgroupInvite.
CREATE TABLE IF NOT EXISTS "WorkgroupInvite" (
    "id" TEXT NOT NULL,
    "workgroupId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "inviteeEmail" TEXT,
    "status" "WorkgroupInviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "WorkgroupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkgroupJoinRequest.
CREATE TABLE IF NOT EXISTS "WorkgroupJoinRequest" (
    "id" TEXT NOT NULL,
    "workgroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "WorkgroupJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "WorkgroupJoinRequest_pkey" PRIMARY KEY ("id")
);

-- Indexes and unique constraints.
CREATE UNIQUE INDEX IF NOT EXISTS "Workgroup_slug_key" ON "Workgroup"("slug");
CREATE INDEX IF NOT EXISTS "Workgroup_visibility_idx" ON "Workgroup"("visibility");
CREATE INDEX IF NOT EXISTS "Workgroup_status_idx" ON "Workgroup"("status");
CREATE INDEX IF NOT EXISTS "Workgroup_ownerId_idx" ON "Workgroup"("ownerId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkgroupMember_workgroupId_userId_key" ON "WorkgroupMember"("workgroupId", "userId");
CREATE INDEX IF NOT EXISTS "WorkgroupMember_userId_idx" ON "WorkgroupMember"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkgroupInvite_token_key" ON "WorkgroupInvite"("token");
CREATE INDEX IF NOT EXISTS "WorkgroupInvite_workgroupId_idx" ON "WorkgroupInvite"("workgroupId");
CREATE INDEX IF NOT EXISTS "WorkgroupInvite_inviteeUserId_idx" ON "WorkgroupInvite"("inviteeUserId");
CREATE INDEX IF NOT EXISTS "WorkgroupInvite_status_idx" ON "WorkgroupInvite"("status");

CREATE INDEX IF NOT EXISTS "WorkgroupJoinRequest_workgroupId_idx" ON "WorkgroupJoinRequest"("workgroupId");
CREATE INDEX IF NOT EXISTS "WorkgroupJoinRequest_userId_idx" ON "WorkgroupJoinRequest"("userId");
CREATE INDEX IF NOT EXISTS "WorkgroupJoinRequest_status_idx" ON "WorkgroupJoinRequest"("status");

-- Foreign keys (child tables cascade with the parent workgroup).
ALTER TABLE "WorkgroupMember" ADD CONSTRAINT "WorkgroupMember_workgroupId_fkey" FOREIGN KEY ("workgroupId") REFERENCES "Workgroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkgroupInvite" ADD CONSTRAINT "WorkgroupInvite_workgroupId_fkey" FOREIGN KEY ("workgroupId") REFERENCES "Workgroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkgroupJoinRequest" ADD CONSTRAINT "WorkgroupJoinRequest_workgroupId_fkey" FOREIGN KEY ("workgroupId") REFERENCES "Workgroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cross-link columns on existing modules (nullable, additive). FeedPost already
-- carries workgroupId from Sprint 21.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workgroupId" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "workgroupId" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "workgroupId" TEXT;
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "workgroupId" TEXT;

CREATE INDEX IF NOT EXISTS "Task_workgroupId_idx" ON "Task"("workgroupId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_workgroupId_idx" ON "CalendarEvent"("workgroupId");
CREATE INDEX IF NOT EXISTS "Document_workgroupId_idx" ON "Document"("workgroupId");
CREATE INDEX IF NOT EXISTS "ChatChannel_workgroupId_idx" ON "ChatChannel"("workgroupId");
