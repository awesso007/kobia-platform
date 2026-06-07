/*
 * Single site API (Sprint 17, authenticated). GET returns the site; PATCH
 * updates fields (name, description, favicon, theme, homePageId); DELETE removes
 * it and cascades pages/blocks. Tenant via getTenantDb(), guarded by RBAC.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getSite } from "@/lib/sites/queries";
import { updateSite, deleteSite } from "@/lib/sites/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const site = await getSite(db, params.siteId);
    if (!site) return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });
    return NextResponse.json({ ok: true, site });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { siteId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    await updateSite(db, params.siteId, {
      name: body.name as string | undefined,
      description: body.description as string | null | undefined,
      faviconUrl: body.faviconUrl as string | null | undefined,
      themeId: body.themeId as string | null | undefined,
      theme: body.theme,
      homePageId: body.homePageId as string | null | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { siteId: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    await deleteSite(db, params.siteId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
