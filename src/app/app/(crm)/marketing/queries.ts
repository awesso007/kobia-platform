import { withAuditedHistoricalServerRead } from "@/lib/chess/historical-server-read-round58";
/*
 * Marketing read queries (Sprint 13, server-only). All reads go through
 * getTenantDb(). Listing helpers for the overview, segments, broadcasts,
 * campaigns, and landing pages surfaces plus the detail loaders the edit pages
 * need.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";

export type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  recipientCountCache: number;
  lastEvaluatedAt: Date | null;
  updatedAt: Date;
};

async function listSegmentsOriginal(): Promise<SegmentRow[]> {
  const { db } = getTenantDb();
  return db.segment.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      entityType: true,
      recipientCountCache: true,
      lastEvaluatedAt: true,
      updatedAt: true,
    },
  });
}

async function getSegmentOriginal(id: string) {
  const { db } = getTenantDb();
  return db.segment.findUnique({ where: { id } });
}

export type BroadcastRow = {
  id: string;
  name: string;
  channel: string;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  segmentName: string | null;
  updatedAt: Date;
};

async function listBroadcastsOriginal(): Promise<BroadcastRow[]> {
  const { db } = getTenantDb();
  const rows = await db.broadcast.findMany({
    orderBy: { updatedAt: "desc" },
    include: { segment: { select: { name: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    channel: b.channel,
    status: b.status,
    scheduledAt: b.scheduledAt,
    sentAt: b.sentAt,
    segmentName: b.segment?.name ?? null,
    updatedAt: b.updatedAt,
  }));
}

async function getBroadcastOriginal(id: string) {
  const { db } = getTenantDb();
  return db.broadcast.findUnique({ where: { id } });
}

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  triggerType: string;
  stepCount: number;
  activeEnrollments: number;
  updatedAt: Date;
};

async function listCampaignsOriginal(): Promise<CampaignRow[]> {
  const { db } = getTenantDb();
  const rows = await db.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { steps: true } },
      enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    triggerType: c.triggerType,
    stepCount: c._count.steps,
    activeEnrollments: c.enrollments.length,
    updatedAt: c.updatedAt,
  }));
}

async function getCampaignOriginal(id: string) {
  const { db } = getTenantDb();
  return db.campaign.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
}

export type LandingPageRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  viewCount: number;
  conversionCount: number;
  publishedAt: Date | null;
  updatedAt: Date;
};

async function listLandingPagesOriginal(): Promise<LandingPageRow[]> {
  const { db } = getTenantDb();
  return db.landingPage.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      viewCount: true,
      conversionCount: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}

async function getLandingPageOriginal(id: string) {
  const { db } = getTenantDb();
  return db.landingPage.findUnique({ where: { id } });
}

/** Lite list of segments for select dropdowns (broadcast / campaign builders). */
async function listSegmentsLiteOriginal(): Promise<{ id: string; name: string; entityType: string }[]> {
  const { db } = getTenantDb();
  return db.segment.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, entityType: true } });
}

/** Counts for the marketing overview dashboard. */
async function getMarketingOverviewOriginal(): Promise<{
  segments: number;
  broadcasts: number;
  campaigns: number;
  landingPages: number;
  unsubscribes: number;
}> {
  const { db } = getTenantDb();
  const [segments, broadcasts, campaigns, landingPages, unsubscribes] = await Promise.all([
    db.segment.count(),
    db.broadcast.count(),
    db.campaign.count(),
    db.landingPage.count(),
    db.unsubscribe.count(),
  ]);
  return { segments, broadcasts, campaigns, landingPages, unsubscribes };
}

export const listSegments = withAuditedHistoricalServerRead("marketing.listSegments", listSegmentsOriginal);

export const getSegment = withAuditedHistoricalServerRead("marketing.getSegment", getSegmentOriginal);

export const listBroadcasts = withAuditedHistoricalServerRead("marketing.listBroadcasts", listBroadcastsOriginal);

export const getBroadcast = withAuditedHistoricalServerRead("marketing.getBroadcast", getBroadcastOriginal);

export const listCampaigns = withAuditedHistoricalServerRead("marketing.listCampaigns", listCampaignsOriginal);

export const getCampaign = withAuditedHistoricalServerRead("marketing.getCampaign", getCampaignOriginal);

export const listLandingPages = withAuditedHistoricalServerRead("marketing.listLandingPages", listLandingPagesOriginal);

export const getLandingPage = withAuditedHistoricalServerRead("marketing.getLandingPage", getLandingPageOriginal);

export const listSegmentsLite = withAuditedHistoricalServerRead("marketing.listSegmentsLite", listSegmentsLiteOriginal);

export const getMarketingOverview = withAuditedHistoricalServerRead("marketing.getMarketingOverview", getMarketingOverviewOriginal);
