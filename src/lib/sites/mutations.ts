/*
 * Site write helpers (Sprint 17). Every function takes an explicit db so it can
 * run inside a request scope or in the seed script. Page publish transitions
 * (draft -> published) dispatch the SITE_PAGE_PUBLISHED automation trigger; a
 * site publish toggle cascades to its home page.
 *
 * Slugs are unique-per-site (pages) or unique-per-tenant (sites); collisions are
 * resolved by appending a short numeric suffix.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { randomBytes } from "crypto";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { slugify, isValidSlug, DEFAULT_THEME_TOKENS } from "./site-utils";
import { defaultBlockData, isBlockType, type SiteBlockTypeName } from "./blocks";

type Db = PrismaClient;

async function uniqueSiteSlug(db: Db, base: string): Promise<string> {
  let slug = slugify(base) || "site";
  if (!isValidSlug(slug)) slug = "site";
  let candidate = slug;
  let n = 1;
  while (await db.site.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${slug}-${n++}`.slice(0, 50);
  }
  return candidate;
}

async function uniquePageSlug(db: Db, siteId: string, base: string): Promise<string> {
  let slug = slugify(base) || "page";
  if (!isValidSlug(slug)) slug = "page";
  let candidate = slug;
  let n = 1;
  while (
    await db.sitePage.findUnique({ where: { siteId_slug: { siteId, slug: candidate } }, select: { id: true } })
  ) {
    candidate = `${slug}-${n++}`.slice(0, 50);
  }
  return candidate;
}

export async function createSite(
  db: Db,
  input: { name: string; description?: string | null; slug?: string | null; themeId?: string | null },
): Promise<string> {
  const slug = await uniqueSiteSlug(db, input.slug || input.name);
  const theme = input.themeId
    ? await db.siteTheme.findUnique({ where: { id: input.themeId } })
    : await db.siteTheme.findFirst({ where: { isDefault: true } });
  const site = await db.site.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      themeId: theme?.id ?? null,
      theme: (theme?.tokens ?? DEFAULT_THEME_TOKENS) as never,
    },
  });

  // Every new site gets an empty home page so the editor has somewhere to start.
  const homeSlug = await uniquePageSlug(db, site.id, "home");
  const home = await db.sitePage.create({
    data: { siteId: site.id, slug: homeSlug, title: "Home", order: 0 },
  });
  await db.site.update({ where: { id: site.id }, data: { homePageId: home.id } });
  return site.id;
}

export async function updateSite(
  db: Db,
  siteId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    faviconUrl: string | null;
    themeId: string | null;
    theme: unknown;
    homePageId: string | null;
  }>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.faviconUrl !== undefined) data.faviconUrl = patch.faviconUrl || null;
  if (patch.themeId !== undefined) data.themeId = patch.themeId;
  if (patch.theme !== undefined) data.theme = patch.theme as never;
  if (patch.homePageId !== undefined) data.homePageId = patch.homePageId;
  if (Object.keys(data).length === 0) return;
  await db.site.update({ where: { id: siteId }, data });
}

export async function deleteSite(db: Db, siteId: string): Promise<void> {
  // homePageId has no FK (avoids the circular create), so clear it before the
  // cascade deletes the pages, to be safe across drivers.
  await db.site.update({ where: { id: siteId }, data: { homePageId: null } }).catch(() => undefined);
  await db.site.delete({ where: { id: siteId } });
}

/** Toggle a site's published flag; publishing also publishes the home page. */
export async function setSitePublished(db: Db, siteId: string, published: boolean): Promise<void> {
  const site = await db.site.update({ where: { id: siteId }, data: { published } });
  if (published && site.homePageId) {
    await publishPage(db, site.homePageId, true);
  }
}

export async function createPage(
  db: Db,
  siteId: string,
  input: { title: string; slug?: string | null },
): Promise<string> {
  const slug = await uniquePageSlug(db, siteId, input.slug || input.title);
  const last = await db.sitePage.findFirst({ where: { siteId }, orderBy: { order: "desc" }, select: { order: true } });
  const page = await db.sitePage.create({
    data: { siteId, slug, title: input.title.trim() || "Untitled", order: (last?.order ?? -1) + 1 },
  });
  return page.id;
}

export async function updatePage(
  db: Db,
  pageId: string,
  patch: Partial<{
    title: string;
    slug: string;
    seoTitle: string | null;
    seoDescription: string | null;
    ogImageUrl: string | null;
    order: number;
  }>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim() || "Untitled";
  if (patch.seoTitle !== undefined) data.seoTitle = patch.seoTitle || null;
  if (patch.seoDescription !== undefined) data.seoDescription = patch.seoDescription || null;
  if (patch.ogImageUrl !== undefined) data.ogImageUrl = patch.ogImageUrl || null;
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.slug !== undefined) {
    const page = await db.sitePage.findUnique({ where: { id: pageId }, select: { siteId: true } });
    if (page) data.slug = await uniquePageSlug(db, page.siteId, patch.slug);
  }
  if (Object.keys(data).length === 0) return;
  await db.sitePage.update({ where: { id: pageId }, data });
}

/** Set a page's published flag. Dispatches SITE_PAGE_PUBLISHED on draft->published. */
export async function publishPage(db: Db, pageId: string, published: boolean): Promise<void> {
  const before = await db.sitePage.findUnique({ where: { id: pageId }, select: { published: true } });
  if (!before) return;
  if (before.published === published) return;
  await db.sitePage.update({ where: { id: pageId }, data: { published } });
  if (published) {
    await dispatchAutomation({ type: "SITE_PAGE_PUBLISHED", entityType: "SITE_PAGE", entityId: pageId }, db);
  }
}

export async function deletePage(db: Db, pageId: string): Promise<void> {
  const page = await db.sitePage.findUnique({ where: { id: pageId }, select: { siteId: true } });
  if (page) {
    // If this was the home page, clear the pointer first.
    await db.site.updateMany({ where: { id: page.siteId, homePageId: pageId }, data: { homePageId: null } });
  }
  await db.sitePage.delete({ where: { id: pageId } });
}

export async function createBlock(
  db: Db,
  pageId: string,
  type: SiteBlockTypeName,
  data?: unknown,
): Promise<string> {
  if (!isBlockType(type)) throw new Error(`Invalid block type: ${type}`);
  const last = await db.siteBlock.findFirst({ where: { pageId }, orderBy: { order: "desc" }, select: { order: true } });
  const block = await db.siteBlock.create({
    data: {
      pageId,
      type,
      order: (last?.order ?? -1) + 1,
      data: (data ?? defaultBlockData(type)) as never,
    },
  });
  return block.id;
}

export async function updateBlock(
  db: Db,
  blockId: string,
  patch: Partial<{ data: unknown; visible: boolean }>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.data !== undefined) data.data = patch.data as never;
  if (patch.visible !== undefined) data.visible = patch.visible;
  if (Object.keys(data).length === 0) return;
  await db.siteBlock.update({ where: { id: blockId }, data });
}

export async function deleteBlock(db: Db, blockId: string): Promise<void> {
  await db.siteBlock.delete({ where: { id: blockId } });
}

/** Reorder a page's blocks to match the given id sequence. */
export async function reorderBlocks(db: Db, pageId: string, orderedIds: string[]): Promise<void> {
  const existing = await db.siteBlock.findMany({ where: { pageId }, select: { id: true } });
  const valid = new Set(existing.map((b) => b.id));
  await db.$transaction(
    orderedIds
      .filter((id) => valid.has(id))
      .map((id, idx) => db.siteBlock.update({ where: { id }, data: { order: idx } })),
  );
}

export async function addDomain(db: Db, siteId: string, domain: string): Promise<string> {
  const token = `kobia-verify-${randomBytes(12).toString("hex")}`;
  const row = await db.siteDomain.create({
    data: { siteId, domain: domain.trim().toLowerCase(), verificationToken: token },
  });
  return row.id;
}

export async function deleteDomain(db: Db, domainId: string): Promise<void> {
  await db.siteDomain.delete({ where: { id: domainId } });
}

export async function upsertTheme(
  db: Db,
  input: { id?: string | null; name: string; tokens: unknown; isDefault?: boolean },
): Promise<string> {
  if (input.isDefault) {
    await db.siteTheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }
  if (input.id) {
    const row = await db.siteTheme.update({
      where: { id: input.id },
      data: { name: input.name.trim(), tokens: input.tokens as never, isDefault: input.isDefault ?? false },
    });
    return row.id;
  }
  const row = await db.siteTheme.create({
    data: { name: input.name.trim(), tokens: input.tokens as never, isDefault: input.isDefault ?? false },
  });
  return row.id;
}
