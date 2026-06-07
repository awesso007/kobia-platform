/*
 * SLA policies API (Sprint 15, authenticated). GET lists policies; POST creates
 * one with first-response and resolve minute targets.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";

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
    const policies = await db.slaPolicy.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ ok: true, policies });
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
    if (!name) return NextResponse.json({ ok: false, error: "Policy name is required." }, { status: 400 });
    const { db } = getTenantDb();
    const policy = await db.slaPolicy.create({
      data: {
        name,
        description: String(body.description ?? "").trim() || null,
        firstResponseMinutes: Math.max(1, Math.round(Number(body.firstResponseMinutes ?? 60) || 60)),
        resolveMinutes: Math.max(1, Math.round(Number(body.resolveMinutes ?? 1440) || 1440)),
        businessHoursOnly: Boolean(body.businessHoursOnly),
      },
    });
    return NextResponse.json({ ok: true, id: policy.id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
