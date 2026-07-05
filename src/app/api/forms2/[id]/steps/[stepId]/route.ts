/*
 * Forms 2.0 single step API (Sprint 19, authenticated). PATCH updates a step's
 * title/description; DELETE removes it (its fields survive as orphans on the
 * form). RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { updateStep, deleteStep } from "@/lib/forms2/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    await updateStep(db, params.stepId, {
      title: body.title as string | undefined,
      description: body.description as string | null | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    await deleteStep(db, params.stepId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
