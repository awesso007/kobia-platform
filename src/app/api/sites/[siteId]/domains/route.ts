/*
 * Site domains API (Sprint 17, authenticated). GET lists a site's custom
 * domains; POST adds one (generating a verification token); DELETE removes one
 * by id. Guarded by RBAC, tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listDomains } from "@/lib/sites/queries";
import { addDomain, deleteDomain } from "@/lib/sites/mutations";
import { isValidDomain } from "@/lib/sites/site-utils";

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
    const domains = await listDomains(db, params.siteId);
    return NextResponse.json({ ok: true, domains });
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
    await requirePermission("record:update");
    const domain = String(body.domain ?? "").trim().toLowerCase();
    if (!isValidDomain(domain)) return NextResponse.json({ ok: false, error: "Invalid domain." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await addDomain(db, params.siteId, domain);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params: _params }: { params: { siteId: string } }) {
  try {
    await requirePermission("record:update");
    const domainId = req.nextUrl.searchParams.get("domainId") ?? "";
    if (!domainId) return NextResponse.json({ ok: false, error: "domainId is required." }, { status: 400 });
    const { db } = getTenantDb();
    await deleteDomain(db, domainId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
