/*
 * Forms 2.0 single field API (Sprint 19, authenticated). PATCH updates any field
 * setting (type, label, options, validation, visibility rule, calculation,
 * payment); DELETE removes it. RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import type { FormFieldType } from "@/lib/db/generated/tenant";
import { FIELD_TYPES } from "@/lib/forms2/form-utils";
import { updateField, deleteField } from "@/lib/forms2/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; fieldId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("form:manage");
    if (body.type !== undefined && !FIELD_TYPES.includes(body.type as (typeof FIELD_TYPES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid field type." }, { status: 400 });
    }
    const { db } = getTenantDb();
    await updateField(db, params.fieldId, {
      stepId: body.stepId === undefined ? undefined : ((body.stepId as string) || null),
      type: body.type as FormFieldType | undefined,
      label: body.label as string | undefined,
      key: body.key as string | undefined,
      required: body.required === undefined ? undefined : Boolean(body.required),
      placeholder: body.placeholder as string | null | undefined,
      helpText: body.helpText as string | null | undefined,
      options: body.options,
      validation: body.validation,
      defaultValue: body.defaultValue as string | null | undefined,
      calculation: body.calculation as string | null | undefined,
      paymentAmount:
        body.paymentAmount === undefined ? undefined : body.paymentAmount === null ? null : Number(body.paymentAmount),
      paymentCurrency: body.paymentCurrency as string | undefined,
      paymentDescription: body.paymentDescription as string | null | undefined,
      visibilityRule: body.visibilityRule,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; fieldId: string } }) {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    await deleteField(db, params.fieldId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
