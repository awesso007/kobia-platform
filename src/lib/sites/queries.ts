/*
 * Site read helpers (Sprint 17). Every function takes an explicit db so it works
 * inside a request scope (getTenantDb) and outside one (getTenantPrisma by slug,
 * used by the public renderer and the seed script).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, Site, SitePage, SiteBlock } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

export type SiteSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  published: boolean;
  customDomain: string | null;
  faviconUrl: string | null;
  homePageId: string | null;
  pageCount: number;
  updatedAt: Date;
};

export async function listSites(db: Db): Promise<SiteSummary[]> {
  const sites = await db.site.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { pages: true } } },
  });
  return sites.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    published: s.published,
    customDomain: s.customDomain,
    faviconUrl: s.faviconUrl,
    homePageId: s.homePageId,
    pageCount: s._count.pages,
    updatedAt: s.updatedAt,
  }));
}

export async function getSite(db: Db, siteId: string): Promise<Site | null> {
  return db.site.findUnique({ where: { id: siteId } });
}

export async function getSiteBySlug(db: Db, slug: string): Promise<Site | null> {
  return db.site.findUnique({ where: { slug } });
}

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  order: number;
  blockCount: number;
  isHome: boolean;
  updatedAt: Date;
};

export async function listPages(db: Db, siteId: string): Promise<PageSummary[]> {
  const site = await db.site.findUnique({ where: { id: siteId }, select: { homePageId: true } });
  const pages = await db.sitePage.findMany({
    where: { siteId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { blocks: true } } },
  });
  return pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    published: p.published,
    order: p.order,
    blockCount: p._count.blocks,
    isHome: site?.homePageId === p.id,
    updatedAt: p.updatedAt,
  }));
}

export type PageWithBlocks = SitePage & { blocks: SiteBlock[] };

/** A page plus its blocks ordered for editing/rendering. */
export async function getPageWithBlocks(db: Db, pageId: string): Promise<PageWithBlocks | null> {
  return db.sitePage.findUnique({
    where: { id: pageId },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
}

/** Resolve a published page for the public renderer by site slug + page slug. */
export async function getPublicPage(
  db: Db,
  siteSlug: string,
  pageSlug: string | null,
): Promise<{ site: Site; page: PageWithBlocks } | null> {
  const site = await db.site.findUnique({ where: { slug: siteSlug } });
  if (!site || !site.published) return null;

  let page: PageWithBlocks | null = null;
  if (pageSlug) {
    page = await db.sitePage.findUnique({
      where: { siteId_slug: { siteId: site.id, slug: pageSlug } },
      include: { blocks: { orderBy: { order: "asc" } } },
    });
  } else if (site.homePageId) {
    page = await db.sitePage.findUnique({
      where: { id: site.homePageId },
      include: { blocks: { orderBy: { order: "asc" } } },
    });
  }
  // Fall back to the first published page when no home is set.
  if (!page && !pageSlug) {
    page = await db.sitePage.findFirst({
      where: { siteId: site.id, published: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { blocks: { orderBy: { order: "asc" } } },
    });
  }
  if (!page || !page.published) return null;
  return { site, page };
}

export async function listDomains(db: Db, siteId: string) {
  return db.siteDomain.findMany({ where: { siteId }, orderBy: { createdAt: "asc" } });
}

/** Resolve which site (slug) a non-app hostname maps to, for custom domains. */
export async function resolveSiteSlugForDomain(db: Db, hostname: string): Promise<string | null> {
  const host = hostname.trim().toLowerCase();
  if (!host) return null;
  const byColumn = await db.site.findFirst({ where: { customDomain: host, published: true }, select: { slug: true } });
  if (byColumn) return byColumn.slug;
  const domain = await db.siteDomain.findFirst({
    where: { domain: host, verified: true },
    select: { site: { select: { slug: true, published: true } } },
  });
  return domain?.site.published ? domain.site.slug : null;
}

export type ThemeRow = { id: string; name: string; isDefault: boolean; tokens: unknown };

export async function listThemes(db: Db): Promise<ThemeRow[]> {
  return db.siteTheme.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
}

export type AnalyticsSummary = {
  totalViews: number;
  totalClicks: number;
  totalFormSubmits: number;
  topPages: { pageId: string | null; title: string; views: number }[];
};

/** Aggregate analytics for a site dashboard. */
export async function analyticsSummary(db: Db, siteId: string): Promise<AnalyticsSummary> {
  const [views, clicks, submits] = await Promise.all([
    db.siteAnalytics.count({ where: { siteId, eventType: "PAGEVIEW" } }),
    db.siteAnalytics.count({ where: { siteId, eventType: "CLICK" } }),
    db.siteAnalytics.count({ where: { siteId, eventType: "FORM_SUBMIT" } }),
  ]);

  const grouped = await db.siteAnalytics.groupBy({
    by: ["pageId"],
    where: { siteId, eventType: "PAGEVIEW" },
    _count: { _all: true },
  });
  const pageIds = grouped.map((g) => g.pageId).filter((id): id is string => !!id);
  const pages = pageIds.length
    ? await db.sitePage.findMany({ where: { id: { in: pageIds } }, select: { id: true, title: true } })
    : [];
  const titleById = new Map(pages.map((p) => [p.id, p.title]));

  const topPages = grouped
    .map((g) => ({
      pageId: g.pageId,
      title: g.pageId ? titleById.get(g.pageId) ?? "Unknown page" : "(no page)",
      views: g._count._all,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return { totalViews: views, totalClicks: clicks, totalFormSubmits: submits, topPages };
}
