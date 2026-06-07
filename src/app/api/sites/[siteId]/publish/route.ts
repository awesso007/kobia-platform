/*
 * Site publish toggle API (Sprint 17, authenticated). POST flips a site's
 * published flag; publishing also publishes its home page (which dispatches the
 * SITE_PAGE_PUBLISHED automation). Guarded by record:update.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { setSitePublished } from "@/lib/sites/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Default to publishing when no body is sent.
  }
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const published = body.published === undefined ? true : Boolean(body.published);
    await setSitePublished(db, params.siteId, published);
    return NextResponse.json({ ok: true, published });
  } catch (err) {
    return fail(err);
  }
}
