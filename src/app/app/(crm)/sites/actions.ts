"use server";

/*
 * Sites server actions (Sprint 17). All DB access goes through getTenantDb().
 * Each mutating action enforces requirePermission and delegates to the shared
 * sites lib (which dispatches SITE_PAGE_PUBLISHED where relevant). Sites are not
 * CRM audited entities (auditWrite only covers LEAD/DEAL/CONTACT/COMPANY) so we
 * skip auditWrite here by design, mirroring Marketing and Chat.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import {
  createSite,
  updateSite,
  deleteSite,
  setSitePublished,
  createPage,
  updatePage,
  publishPage,
  deletePage,
  createBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  addDomain,
  deleteDomain,
  upsertTheme,
} from "@/lib/sites/mutations";
import type { SiteBlockTypeName } from "@/lib/sites/blocks";

// ---------------------------------------------------------------- Sites

export async function createSiteAction(input: {
  name: string;
  description?: string | null;
  slug?: string | null;
  themeId?: string | null;
}): Promise<string> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const id = await createSite(db, input);
  revalidatePath("/app/sites");
  return id;
}

export async function updateSiteAction(
  siteId: string,
  patch: { name?: string; description?: string | null; faviconUrl?: string | null; themeId?: string | null; theme?: unknown; homePageId?: string | null },
): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await updateSite(db, siteId, patch);
  revalidatePath("/app/sites");
  revalidatePath(`/app/sites/${siteId}`);
}

export async function deleteSiteAction(siteId: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await deleteSite(db, siteId);
  revalidatePath("/app/sites");
}

export async function setSitePublishedAction(siteId: string, published: boolean): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await setSitePublished(db, siteId, published);
  revalidatePath("/app/sites");
  revalidatePath(`/app/sites/${siteId}`);
}

// ---------------------------------------------------------------- Pages

export async function createPageAction(siteId: string, input: { title: string; slug?: string | null }): Promise<string> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const id = await createPage(db, siteId, input);
  revalidatePath(`/app/sites/${siteId}/pages`);
  return id;
}

export async function updatePageAction(
  siteId: string,
  pageId: string,
  patch: { title?: string; slug?: string; seoTitle?: string | null; seoDescription?: string | null; ogImageUrl?: string | null; order?: number },
): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await updatePage(db, pageId, patch);
  revalidatePath(`/app/sites/${siteId}/pages`);
  revalidatePath(`/app/sites/${siteId}/pages/${pageId}`);
}

export async function publishPageAction(siteId: string, pageId: string, published: boolean): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await publishPage(db, pageId, published);
  revalidatePath(`/app/sites/${siteId}/pages`);
  revalidatePath(`/app/sites/${siteId}/pages/${pageId}`);
}

export async function setHomePageAction(siteId: string, pageId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await updateSite(db, siteId, { homePageId: pageId });
  revalidatePath(`/app/sites/${siteId}/pages`);
}

export async function deletePageAction(siteId: string, pageId: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await deletePage(db, pageId);
  revalidatePath(`/app/sites/${siteId}/pages`);
}

// ---------------------------------------------------------------- Blocks

export async function createBlockAction(siteId: string, pageId: string, type: SiteBlockTypeName, data?: unknown): Promise<string> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const id = await createBlock(db, pageId, type, data);
  revalidatePath(`/app/sites/${siteId}/pages/${pageId}`);
  return id;
}

export async function updateBlockAction(siteId: string, pageId: string, blockId: string, patch: { data?: unknown; visible?: boolean }): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await updateBlock(db, blockId, patch);
  revalidatePath(`/app/sites/${siteId}/pages/${pageId}`);
}

export async function deleteBlockAction(siteId: string, pageId: string, blockId: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await deleteBlock(db, blockId);
  revalidatePath(`/app/sites/${siteId}/pages/${pageId}`);
}

export async function reorderBlocksAction(siteId: string, pageId: string, orderedIds: string[]): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await reorderBlocks(db, pageId, orderedIds);
  revalidatePath(`/app/sites/${siteId}/pages/${pageId}`);
}

// ---------------------------------------------------------------- Domains

export async function addDomainAction(siteId: string, domain: string): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const id = await addDomain(db, siteId, domain);
  revalidatePath(`/app/sites/${siteId}/domains`);
  return id;
}

export async function deleteDomainAction(siteId: string, domainId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await deleteDomain(db, domainId);
  revalidatePath(`/app/sites/${siteId}/domains`);
}

// ---------------------------------------------------------------- Themes

export async function upsertThemeAction(input: { id?: string | null; name: string; tokens: unknown; isDefault?: boolean }): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const id = await upsertTheme(db, input);
  revalidatePath("/app/sites");
  return id;
}
