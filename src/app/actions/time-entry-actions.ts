"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";

function hoursToMilli(v: FormDataEntryValue | null): bigint {
  const h = Number(v ?? 0);
  return BigInt(Math.round(h * 1000));
}

export async function createTimeEntryAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const employeeId = String(formData.get("employeeId") || "");
  const workDate = new Date(String(formData.get("workDate") || ""));
  const hoursMilli = hoursToMilli(formData.get("hours"));
  const isOvertime = formData.get("isOvertime") === "1";
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!tenantSlug || !employeeId || isNaN(workDate.getTime()) || hoursMilli <= 0n) {
    throw new Error("Missing or invalid input");
  }

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const employee = await db.employee.findFirst({
    where: { id: employeeId, tenantId: auth.tenant.id, entityId: entity.id },
  });
  if (!employee) throw new Error("Employee not found");

  await db.timeEntry.create({
    data: {
      tenantId: auth.tenant.id,
      employeeId: employee.id,
      workDate,
      hoursMilli,
      isOvertime,
      notes,
    },
  });

  revalidatePath(`/${tenantSlug}/payroll/employees/${employeeId}/time`);
}

export async function deleteTimeEntryAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const id = String(formData.get("id") || "");
  const employeeId = String(formData.get("employeeId") || "");
  if (!tenantSlug || !id) throw new Error("Missing tenantSlug or id");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const te = await db.timeEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!te) throw new Error("Time entry not found");
  // verify ownership via employee
  const emp = await db.employee.findFirst({
    where: { id: te.employeeId, entityId: entity.id, tenantId: auth.tenant.id },
  });
  if (!emp) throw new Error("Not authorized for this employee");
  if (te.paystubId) throw new Error("Cannot delete a time entry already on a paystub");

  await db.timeEntry.delete({ where: { id: te.id } });
  revalidatePath(`/${tenantSlug}/payroll/employees/${employeeId}/time`);
}
