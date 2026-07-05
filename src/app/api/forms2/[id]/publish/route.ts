/*
 * Forms 2.0 publish toggle API (Sprint 19, authenticated). POST sets the form
 * status (defaults PUBLISHED). RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { setFormStatus } from "@/lib/forms2/mutations";

export const dynamic = "force-dynamic";

const VALID = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // default to PUBLISHED
  }
  try {
    await requirePermission("form:manage");
    const status = (body.status as string) || "PUBLISHED";
    if (!VALID.includes(status as (typeof VALID)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }
    const { db } = getTenantDb();
    await setFormStatus(db, params.id, status as (typeof VALID)[number]);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return fail(err);
  }
}
