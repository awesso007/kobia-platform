/*
 * Forms 2.0 collection API (Sprint 19, authenticated). GET lists the tenant's
 * Forms 2.0 with field/step/submission counts; POST creates a new form (with an
 * auto first step). RBAC form:manage; tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listForms } from "@/lib/forms2/queries";
import { createForm } from "@/lib/forms2/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    const forms = await listForms(db);
    return NextResponse.json({ ok: true, forms });
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
    await requirePermission("form:manage");
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await createForm(db, {
      name,
      slug: (body.slug as string) || null,
      description: (body.description as string) || null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
