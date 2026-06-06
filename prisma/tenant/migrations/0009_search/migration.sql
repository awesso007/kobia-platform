-- Sprint 9: global search index + saved views. Additive only: two new tables,
-- four new enums, a generated tsvector column with a GIN index. No DROP on
-- existing data. Applied per tenant schema via raw SQL + search_path.

-- CreateEnum
CREATE TYPE "SearchEntityType" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY', 'ACTIVITY', 'FILE', 'EMAIL_MESSAGE', 'NOTE');
CREATE TYPE "SavedViewEntityType" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY', 'ACTIVITY', 'FILE');
CREATE TYPE "SavedViewScope" AS ENUM ('PERSONAL', 'TENANT');
CREATE TYPE "SavedViewSortDir" AS ENUM ('ASC', 'DESC');

-- CreateTable: SearchIndex. The tsv column is GENERATED ALWAYS from title +
-- subtitle + body so it stays in sync on every upsert without app code.
CREATE TABLE "SearchIndex" (
    "id" TEXT NOT NULL,
    "entityType" "SearchEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT,
    "tsv" tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce("title", '') || ' ' || coalesce("subtitle", '') || ' ' || coalesce("body", ''))
    ) STORED,
    "ownerClerkUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SavedView.
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "entityType" "SavedViewEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "ownerClerkUserId" TEXT,
    "scope" "SavedViewScope" NOT NULL DEFAULT 'PERSONAL',
    "filters" JSONB NOT NULL,
    "sortBy" TEXT,
    "sortDir" "SavedViewSortDir" NOT NULL DEFAULT 'DESC',
    "columns" JSONB NOT NULL,
    "groupBy" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchIndex_entityType_entityId_key" ON "SearchIndex"("entityType", "entityId");
CREATE INDEX "SearchIndex_entityType_idx" ON "SearchIndex"("entityType");
CREATE INDEX "SearchIndex_tsv_idx" ON "SearchIndex" USING GIN ("tsv");
CREATE INDEX "SavedView_entityType_ownerClerkUserId_idx" ON "SavedView"("entityType", "ownerClerkUserId");
