import { withAuditedHistoricalServerRead } from "@/lib/chess/historical-server-read-round58";
/*
 * Sites page server queries (Sprint 17, server-only). Thin wrappers over the
 * shared sites lib that resolve the active tenant via getTenantDb(). Used by the
 * sites server pages to provide initial data for the client surfaces.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import {
  listSites,
  getSite,
  listPages,
  getPageWithBlocks,
  listDomains,
  listThemes,
  analyticsSummary,
} from "@/lib/sites/queries";

async function sitesForTenantOriginal() {
  const { db } = getTenantDb();
  return listSites(db);
}

async function siteDetailOriginal(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const pages = await listPages(db, siteId);
  return { site, pages };
}

async function pagesForSiteOriginal(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const pages = await listPages(db, siteId);
  return { site, pages };
}

async function pageEditorDataOriginal(siteId: string, pageId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const page = await getPageWithBlocks(db, pageId);
  if (!page || page.siteId !== siteId) return null;
  return { site, page };
}

async function themesForTenantOriginal() {
  const { db } = getTenantDb();
  return listThemes(db);
}

async function domainsForSiteOriginal(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const domains = await listDomains(db, siteId);
  return { site, domains };
}

async function analyticsForSiteOriginal(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const summary = await analyticsSummary(db, siteId);
  return { site, summary };
}

export const sitesForTenant = withAuditedHistoricalServerRead("sites.sitesForTenant", sitesForTenantOriginal);

export const siteDetail = withAuditedHistoricalServerRead("sites.siteDetail", siteDetailOriginal);

export const pagesForSite = withAuditedHistoricalServerRead("sites.pagesForSite", pagesForSiteOriginal);

export const pageEditorData = withAuditedHistoricalServerRead("sites.pageEditorData", pageEditorDataOriginal);

export const themesForTenant = withAuditedHistoricalServerRead("sites.themesForTenant", themesForTenantOriginal);

export const domainsForSite = withAuditedHistoricalServerRead("sites.domainsForSite", domainsForSiteOriginal);

export const analyticsForSite = withAuditedHistoricalServerRead("sites.analyticsForSite", analyticsForSiteOriginal);
