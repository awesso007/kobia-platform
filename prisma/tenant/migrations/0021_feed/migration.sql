-- Sprint 21: Feed / Activity Stream. Additive tenant-schema migration adding a
-- company social feed: posts, threaded comments, reactions, polls, mentions,
-- follows, and per-user view tracking. Authors/users are clerk user id strings
-- (no FK to a user table), matching the Chat models.
--
-- Additive only: new enums and new tables. Applied per tenant schema via raw
-- SQL + search_path (scripts/apply-0021-acme.ts). The FeedReaction one-target
-- CHECK and the two partial unique indexes are expressed here (Prisma schema
-- cannot model partial uniques / CHECKs), so the app toggles reactions with
-- findFirst rather than a composite findUnique.

-- CreateEnum: Sprint 21 feed enums.
CREATE TYPE "FeedPostType" AS ENUM ('POST', 'ANNOUNCEMENT', 'POLL', 'QUESTION', 'EVENT_SHARE', 'RECORD_SHARE', 'SYSTEM');
CREATE TYPE "FeedVisibility" AS ENUM ('PUBLIC', 'PRIVATE_GROUP', 'DIRECT');
CREATE TYPE "FeedSharedRecordType" AS ENUM ('DEAL', 'CONTACT', 'TASK', 'DOCUMENT');
CREATE TYPE "FeedReactionKind" AS ENUM ('LIKE', 'LOVE', 'LAUGH', 'WOW', 'SAD', 'THANKS');
CREATE TYPE "FeedFollowTargetType" AS ENUM ('POST', 'USER', 'RECORD');

-- CreateTable FeedPost.
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "FeedPostType" NOT NULL DEFAULT 'POST',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "sharedRecordType" "FeedSharedRecordType",
    "sharedRecordId" TEXT,
    "sharedRecordSnapshot" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "FeedVisibility" NOT NULL DEFAULT 'PUBLIC',
    "workgroupId" TEXT,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedComment.
CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedReaction.
CREATE TABLE "FeedReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "userId" TEXT NOT NULL,
    "kind" "FeedReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedReaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedReaction_one_target" CHECK (("postId" IS NOT NULL) <> ("commentId" IS NOT NULL))
);

-- CreateTable FeedPoll.
CREATE TABLE "FeedPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "FeedPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedPollOption.
CREATE TABLE "FeedPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FeedPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedPollVote.
CREATE TABLE "FeedPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedMention.
CREATE TABLE "FeedMention" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedFollow.
CREATE TABLE "FeedFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "FeedFollowTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeedView.
CREATE TABLE "FeedView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedView_pkey" PRIMARY KEY ("id")
);

-- Indexes.
CREATE INDEX "FeedPost_type_idx" ON "FeedPost"("type");
CREATE INDEX "FeedPost_authorId_idx" ON "FeedPost"("authorId");
CREATE INDEX "FeedPost_pinned_idx" ON "FeedPost"("pinned");
CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt");
CREATE INDEX "FeedPost_deletedAt_idx" ON "FeedPost"("deletedAt");
CREATE INDEX "FeedComment_postId_idx" ON "FeedComment"("postId");
CREATE INDEX "FeedComment_parentCommentId_idx" ON "FeedComment"("parentCommentId");
CREATE INDEX "FeedComment_authorId_idx" ON "FeedComment"("authorId");
CREATE INDEX "FeedComment_createdAt_idx" ON "FeedComment"("createdAt");
CREATE INDEX "FeedReaction_postId_idx" ON "FeedReaction"("postId");
CREATE INDEX "FeedReaction_commentId_idx" ON "FeedReaction"("commentId");
CREATE INDEX "FeedReaction_userId_idx" ON "FeedReaction"("userId");
CREATE UNIQUE INDEX "FeedReaction_post_user_kind_key" ON "FeedReaction"("postId", "userId", "kind") WHERE "postId" IS NOT NULL;
CREATE UNIQUE INDEX "FeedReaction_comment_user_kind_key" ON "FeedReaction"("commentId", "userId", "kind") WHERE "commentId" IS NOT NULL;
CREATE UNIQUE INDEX "FeedPoll_postId_key" ON "FeedPoll"("postId");
CREATE INDEX "FeedPollOption_pollId_idx" ON "FeedPollOption"("pollId");
CREATE UNIQUE INDEX "FeedPollVote_pollId_optionId_userId_key" ON "FeedPollVote"("pollId", "optionId", "userId");
CREATE INDEX "FeedPollVote_pollId_idx" ON "FeedPollVote"("pollId");
CREATE INDEX "FeedPollVote_optionId_idx" ON "FeedPollVote"("optionId");
CREATE INDEX "FeedMention_postId_idx" ON "FeedMention"("postId");
CREATE INDEX "FeedMention_commentId_idx" ON "FeedMention"("commentId");
CREATE INDEX "FeedMention_mentionedUserId_idx" ON "FeedMention"("mentionedUserId");
CREATE UNIQUE INDEX "FeedFollow_userId_targetType_targetId_key" ON "FeedFollow"("userId", "targetType", "targetId");
CREATE INDEX "FeedFollow_userId_idx" ON "FeedFollow"("userId");
CREATE INDEX "FeedFollow_targetType_targetId_idx" ON "FeedFollow"("targetType", "targetId");
CREATE UNIQUE INDEX "FeedView_postId_userId_key" ON "FeedView"("postId", "userId");
CREATE INDEX "FeedView_postId_idx" ON "FeedView"("postId");

-- Foreign keys.
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPoll" ADD CONSTRAINT "FeedPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPollOption" ADD CONSTRAINT "FeedPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "FeedPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPollVote" ADD CONSTRAINT "FeedPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "FeedPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPollVote" ADD CONSTRAINT "FeedPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "FeedPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedView" ADD CONSTRAINT "FeedView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
