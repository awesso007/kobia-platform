/*
 * Single page API (Sprint 17, authenticated). GET returns the page with its
 * blocks; PATCH updates page fields/SEO/order/slug and can toggle published
 * (which dispatches SITE_PAGE_PUBLISHED); DELETE removes the page.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getPageWithBlocks } from "@/lib/sites/queries";
import { updatePage, publishPage, deletePage } from "@/lib/sites/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { siteId: string; pageId: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const page = await getPageWithBlocks(db, params.pageId);
    if (!page) return NextResponse.json({ ok: false, error: "Page not found." }, { status: 404 });
    return NextResponse.json({ ok: true, page });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { siteId: string; pageId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    await updatePage(db, params.pageId, {
      title: body.title as string | undefined,
      slug: body.slug as string | undefined,
      seoTitle: body.seoTitle as string | null | undefined,
      seoDescription: body.seoDescription as string | null | undefined,
      ogImageUrl: body.ogImageUrl as string | null | undefined,
      order: body.order as number | undefined,
    });
    if (body.published !== undefined) {
      await publishPage(db, params.pageId, Boolean(body.published));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { siteId: string; pageId: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    await deletePage(db, params.pageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
