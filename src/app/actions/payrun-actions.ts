"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import {
  createDraftPayRun,
  postPayRun,
  voidPayRun,
} from "@/lib/accounting/payroll";

const PERIOD_FRACTIONS: Record<string, number> = {
  weekly: 1 / 52,
  biweekly: 1 / 26,
  semimonthly: 1 / 24,
  monthly: 1 / 12,
};

export async function createPayRunAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const periodStart = new Date(String(formData.get("periodStart") || ""));
  const periodEnd = new Date(String(formData.get("periodEnd") || ""));
  const payDate = new Date(String(formData.get("payDate") || ""));
  const cadence = String(formData.get("cadence") || "biweekly");

  if (
    !tenantSlug ||
    isNaN(periodStart.getTime()) ||
    isNaN(periodEnd.getTime()) ||
    isNaN(payDate.getTime())
  ) {
    throw new Error("Missing or invalid dates");
  }

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) throw new Error("Forbidden");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const pr = await createDraftPayRun({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    periodStart,
    periodEnd,
    payDate,
    periodFractionOfYear: PERIOD_FRACTIONS[cadence] ?? 1 / 26,
  });

  revalidatePath(`/${tenantSlug}/payroll/runs`);
  redirect(`/${tenantSlug}/payroll/runs/${pr.id}`);
}

export async function postPayRunAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const payRunId = String(formData.get("payRunId") || "");
  if (!tenantSlug || !payRunId) throw new Error("Missing tenantSlug or payRunId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) throw new Error("Forbidden");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  await postPayRun({
    payRunId,
    tenantId: auth.tenant.id,
    entityId: entity.id,
    postedByUserId: auth.user.id,
  });
  revalidatePath(`/${tenantSlug}/payroll/runs`);
  revalidatePath(`/${tenantSlug}/payroll/runs/${payRunId}`);
}

export async function voidPayRunAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const payRunId = String(formData.get("payRunId") || "");
  if (!tenantSlug || !payRunId) throw new Error("Missing tenantSlug or payRunId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN"].includes(auth.role)) throw new Error("Forbidden");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  await voidPayRun({ payRunId, tenantId: auth.tenant.id, entityId: entity.id });
  revalidatePath(`/${tenantSlug}/payroll/runs`);
  redirect(`/${tenantSlug}/payroll/runs`);
}
