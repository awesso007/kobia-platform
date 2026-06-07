/*
 * Site pages collection API (Sprint 17, authenticated). GET lists a site's
 * pages with block counts; POST creates a page. Guarded by RBAC, tenant via
 * getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listPages } from "@/lib/sites/queries";
import { createPage } from "@/lib/sites/mutations";

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
    const pages = await listPages(db, params.siteId);
    return NextResponse.json({ ok: true, pages });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Title is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await createPage(db, params.siteId, { title, slug: (body.slug as string) || null });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
