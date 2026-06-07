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

export async function sitesForTenant() {
  const { db } = getTenantDb();
  return listSites(db);
}

export async function siteDetail(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const pages = await listPages(db, siteId);
  return { site, pages };
}

export async function pagesForSite(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const pages = await listPages(db, siteId);
  return { site, pages };
}

export async function pageEditorData(siteId: string, pageId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const page = await getPageWithBlocks(db, pageId);
  if (!page || page.siteId !== siteId) return null;
  return { site, page };
}

export async function themesForTenant() {
  const { db } = getTenantDb();
  return listThemes(db);
}

export async function domainsForSite(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const domains = await listDomains(db, siteId);
  return { site, domains };
}

export async function analyticsForSite(siteId: string) {
  const { db } = getTenantDb();
  const site = await getSite(db, siteId);
  if (!site) return null;
  const summary = await analyticsSummary(db, siteId);
  return { site, summary };
}
