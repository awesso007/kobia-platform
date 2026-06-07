-- Sprint 17: Sites / Landing Page Builder - multi-page marketing sites with
-- reusable blocks, themes, custom domains, and lightweight analytics.
-- Additive only: new enums and new tables. Applied per tenant schema via raw
-- SQL + search_path (scripts/apply-0017-acme.ts).

-- CreateEnum: Sprint 17 sites enums.
CREATE TYPE "SiteBlockType" AS ENUM ('HERO', 'TEXT', 'IMAGE', 'CTA', 'FEATURES', 'TESTIMONIAL', 'FAQ', 'FORM_EMBED', 'HTML', 'SPACER', 'GALLERY', 'VIDEO');
CREATE TYPE "SiteAnalyticsEvent" AS ENUM ('PAGEVIEW', 'CLICK', 'FORM_SUBMIT');

-- CreateTable SiteTheme.
CREATE TABLE "SiteTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tokens" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteTheme_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteTheme_isDefault_idx" ON "SiteTheme"("isDefault");

-- CreateTable Site.
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "theme" JSONB,
    "themeId" TEXT,
    "faviconUrl" TEXT,
    "customDomain" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "homePageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Site_slug_key" ON "Site"("slug");
CREATE UNIQUE INDEX "Site_customDomain_key" ON "Site"("customDomain");
CREATE INDEX "Site_published_idx" ON "Site"("published");

-- CreateTable SitePage.
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "ogImageUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SitePage_siteId_slug_key" ON "SitePage"("siteId", "slug");
CREATE INDEX "SitePage_siteId_idx" ON "SitePage"("siteId");
CREATE INDEX "SitePage_published_idx" ON "SitePage"("published");

-- CreateTable SiteBlock.
CREATE TABLE "SiteBlock" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" "SiteBlockType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteBlock_pageId_idx" ON "SiteBlock"("pageId");

-- CreateTable SiteDomain.
CREATE TABLE "SiteDomain" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteDomain_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SiteDomain_domain_key" ON "SiteDomain"("domain");
CREATE INDEX "SiteDomain_siteId_idx" ON "SiteDomain"("siteId");

-- CreateTable SiteAnalytics.
CREATE TABLE "SiteAnalytics" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT,
    "eventType" "SiteAnalyticsEvent" NOT NULL DEFAULT 'PAGEVIEW',
    "path" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteAnalytics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteAnalytics_siteId_idx" ON "SiteAnalytics"("siteId");
CREATE INDEX "SiteAnalytics_pageId_idx" ON "SiteAnalytics"("pageId");
CREATE INDEX "SiteAnalytics_eventType_idx" ON "SiteAnalytics"("eventType");
CREATE INDEX "SiteAnalytics_createdAt_idx" ON "SiteAnalytics"("createdAt");

-- AddForeignKey.
ALTER TABLE "Site" ADD CONSTRAINT "Site_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "SiteTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteBlock" ADD CONSTRAINT "SiteBlock_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "SitePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteDomain" ADD CONSTRAINT "SiteDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteAnalytics" ADD CONSTRAINT "SiteAnalytics_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
