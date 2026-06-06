-- Sprint 10: Multi-pipeline polish, Products + Line Items, Quotes + PDF, and
-- automation polish. Additive only: new enums, new tables, new nullable columns
-- on existing tables (Pipeline, DealStage, Lead). No DROP on existing data.
-- Applied per tenant schema via raw SQL + search_path (scripts/apply-0010-acme.ts).

-- AlterEnum: new automation triggers for Sprint 10 (rotting deals, amount change,
-- quote lifecycle, line item changes).
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'STAGE_TIME_EXCEEDED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'DEAL_AMOUNT_CHANGED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'QUOTE_SENT';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'QUOTE_ACCEPTED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'LINE_ITEM_ADDED';

-- CreateEnum: Sprint 10 enums.
CREATE TYPE "PipelineEntityType" AS ENUM ('DEAL', 'LEAD', 'TICKET');
CREATE TYPE "StageWonOrLost" AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE "ProductType" AS ENUM ('ONE_TIME', 'RECURRING_MONTHLY', 'RECURRING_YEARLY', 'SERVICE');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable Pipeline: multi-pipeline metadata. entityType lets one pipeline
-- belong to Deals or Leads; order controls switcher sort; archivedAt soft-hides.
ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "entityType" "PipelineEntityType" NOT NULL DEFAULT 'DEAL';
ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable DealStage: per-stage probability, rotting threshold, and an explicit
-- won/lost enum that supersedes (but keeps) the isWon/isLost booleans.
ALTER TABLE "DealStage" ADD COLUMN IF NOT EXISTS "probability" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DealStage" ADD COLUMN IF NOT EXISTS "rotting_days" INTEGER;
ALTER TABLE "DealStage" ADD COLUMN IF NOT EXISTS "wonOrLost" "StageWonOrLost" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "DealStage" ADD COLUMN IF NOT EXISTS "color" TEXT;

-- Backfill wonOrLost from the legacy booleans so existing stages are correct.
UPDATE "DealStage" SET "wonOrLost" = 'WON' WHERE "isWon" = true AND "wonOrLost" = 'OPEN';
UPDATE "DealStage" SET "wonOrLost" = 'LOST' WHERE "isLost" = true AND "wonOrLost" = 'OPEN';

-- AlterTable Lead: optional pipeline + stage so Leads can run a kanban.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pipelineId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "stageId" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_pipelineId_stageId_idx" ON "Lead" ("pipelineId", "stageId");

-- CreateTable ProductCategory (tree).
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_name_key" ON "ProductCategory" ("name");
CREATE INDEX IF NOT EXISTS "ProductCategory_parentId_idx" ON "ProductCategory" ("parentId");

-- CreateTable Product.
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'ONE_TIME',
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "costCents" INTEGER,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product" ("sku");
CREATE INDEX IF NOT EXISTS "Product_sku_idx" ON "Product" ("sku");
CREATE INDEX IF NOT EXISTS "Product_active_idx" ON "Product" ("active");

-- CreateTable DealLineItem. lineTotalCents is a stored generated column so the
-- DB always keeps it consistent with qty/price/discount/tax.
CREATE TABLE "DealLineItem" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineTotalCents" INTEGER NOT NULL GENERATED ALWAYS AS (
      round(
        "quantity" * "unitPriceCents"
        * (1 - "discountPct" / 100.0)
        * (1 + "taxRatePct" / 100.0)
      )
    ) STORED,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealLineItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DealLineItem_dealId_idx" ON "DealLineItem" ("dealId");
CREATE INDEX IF NOT EXISTS "DealLineItem_productId_idx" ON "DealLineItem" ("productId");

-- CreateTable QuoteTemplate.
CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "htmlTemplate" TEXT NOT NULL,
    "defaultTerms" TEXT,
    "defaultNotes" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "logoFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable Quote.
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "dealId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "templateId" TEXT,
    "pdfFileId" TEXT,
    "publicSlug" TEXT NOT NULL,
    "ownerClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_number_key" ON "Quote" ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_publicSlug_key" ON "Quote" ("publicSlug");
CREATE INDEX IF NOT EXISTS "Quote_dealId_idx" ON "Quote" ("dealId");
CREATE INDEX IF NOT EXISTS "Quote_status_idx" ON "Quote" ("status");

-- CreateTable QuoteLineItem (same generated total as DealLineItem).
CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineTotalCents" INTEGER NOT NULL GENERATED ALWAYS AS (
      round(
        "quantity" * "unitPriceCents"
        * (1 - "discountPct" / 100.0)
        * (1 + "taxRatePct" / 100.0)
      )
    ) STORED,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuoteLineItem_quoteId_idx" ON "QuoteLineItem" ("quoteId");

-- AddForeignKey
ALTER TABLE "DealLineItem" ADD CONSTRAINT "DealLineItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealLineItem" ADD CONSTRAINT "DealLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuoteTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
