/*
 * Single Forms 2.0 form API (Sprint 19, authenticated). GET returns the form
 * with steps + fields; PATCH updates form-level settings; DELETE removes it
 * (cascade). RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getForm } from "@/lib/forms2/queries";
import { updateForm, deleteForm } from "@/lib/forms2/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    const form = await getForm(db, params.id);
    if (!form) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, form });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    await updateForm(db, params.id, {
      name: body.name as string | undefined,
      slug: body.slug as string | undefined,
      description: body.description as string | null | undefined,
      successMessage: body.successMessage as string | null | undefined,
      redirectUrl: body.redirectUrl as string | null | undefined,
      submitButtonLabel: body.submitButtonLabel as string | undefined,
      theme: body.theme,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    await deleteForm(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
