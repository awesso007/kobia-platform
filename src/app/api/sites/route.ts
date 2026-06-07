/*
 * Sites collection API (Sprint 17, authenticated). GET lists the tenant's sites
 * with page counts; POST creates a new site (with an auto home page). Both
 * enforce requirePermission and resolve the tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listSites } from "@/lib/sites/queries";
import { createSite } from "@/lib/sites/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const sites = await listSites(db);
    return NextResponse.json({ ok: true, sites });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await createSite(db, {
      name,
      description: (body.description as string) || null,
      slug: (body.slug as string) || null,
      themeId: (body.themeId as string) || null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
