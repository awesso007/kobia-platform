-- Sprint 16: Chat / internal messaging - channels, messages (threads, mentions,
-- reactions), presence, pins, and per-channel notification prefs.
-- Additive only: new enums, new tables, one new value on SearchEntityType
-- (CHAT_MESSAGE). Applied per tenant schema via raw SQL + search_path
-- (scripts/apply-0016-acme.ts).

-- AlterEnum: SearchEntityType (index chat messages).
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'CHAT_MESSAGE';

-- CreateEnum: Sprint 16 chat enums.
CREATE TYPE "ChatChannelKind" AS ENUM ('PUBLIC', 'PRIVATE', 'DM', 'GROUP_DM');
CREATE TYPE "ChatMemberRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "ChatPresenceStatus" AS ENUM ('ONLINE', 'AWAY', 'DND', 'OFFLINE');
CREATE TYPE "ChatNotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateTable ChatChannel.
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ChatChannelKind" NOT NULL DEFAULT 'PUBLIC',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatChannel_slug_key" ON "ChatChannel"("slug");
CREATE INDEX "ChatChannel_kind_idx" ON "ChatChannel"("kind");
CREATE INDEX "ChatChannel_isArchived_idx" ON "ChatChannel"("isArchived");

-- CreateTable ChatMember.
CREATE TABLE "ChatMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatMember_channelId_userId_key" ON "ChatMember"("channelId", "userId");
CREATE INDEX "ChatMember_channelId_idx" ON "ChatMember"("channelId");
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateTable ChatMessage.
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "attachments" JSONB,
    "mentionsJson" JSONB,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatMessage_channelId_idx" ON "ChatMessage"("channelId");
CREATE INDEX "ChatMessage_parentId_idx" ON "ChatMessage"("parentId");
CREATE INDEX "ChatMessage_authorId_idx" ON "ChatMessage"("authorId");
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateTable ChatReaction.
CREATE TABLE "ChatReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatReaction_messageId_userId_emoji_key" ON "ChatReaction"("messageId", "userId", "emoji");
CREATE INDEX "ChatReaction_messageId_idx" ON "ChatReaction"("messageId");

-- CreateTable ChatPresence.
CREATE TABLE "ChatPresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ChatPresenceStatus" NOT NULL DEFAULT 'OFFLINE',
    "customStatus" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatPresence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatPresence_userId_key" ON "ChatPresence"("userId");

-- CreateTable ChatPinnedMessage.
CREATE TABLE "ChatPinnedMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatPinnedMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatPinnedMessage_channelId_messageId_key" ON "ChatPinnedMessage"("channelId", "messageId");
CREATE INDEX "ChatPinnedMessage_channelId_idx" ON "ChatPinnedMessage"("channelId");

-- CreateTable ChatNotificationPref.
CREATE TABLE "ChatNotificationPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "level" "ChatNotificationLevel" NOT NULL DEFAULT 'ALL',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatNotificationPref_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatNotificationPref_userId_channelId_key" ON "ChatNotificationPref"("userId", "channelId");
CREATE INDEX "ChatNotificationPref_channelId_idx" ON "ChatNotificationPref"("channelId");

-- AddForeignKey.
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatNotificationPref" ADD CONSTRAINT "ChatNotificationPref_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
