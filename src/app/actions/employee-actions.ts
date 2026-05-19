"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";
import type { PayType } from "@prisma/client";

function parseDollarsToCents(v: FormDataEntryValue | null): bigint {
  const n = Number(String(v ?? "0").replace(/[$,]/g, "")) || 0;
  return BigInt(Math.round(n * 100));
}

export async function createEmployeeAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const payType = String(formData.get("payType") || "SALARY") as PayType;
  const payRateCents = parseDollarsToCents(formData.get("payRate"));
  const standardHours = formData.get("standardHoursPerPeriod");
  const hireDate = formData.get("hireDate") ? new Date(String(formData.get("hireDate"))) : null;
  const ssnLast4 = String(formData.get("ssnLast4") || "").trim().slice(0, 4) || null;
  const taxFilingStatus = String(formData.get("taxFilingStatus") || "").trim() || null;
  const homeAddress = String(formData.get("homeAddress") || "").trim() || null;

  if (!tenantSlug || !firstName || !lastName) {
    throw new Error("Missing tenantSlug, firstName, or lastName");
  }

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) throw new Error("Forbidden");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  await db.employee.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      firstName,
      lastName,
      email,
      payType,
      payRateCents,
      standardHoursPerPeriod: standardHours ? String(standardHours) : null,
      hireDate,
      ssnLast4,
      taxFilingStatus,
      homeAddress,
    },
  });

  revalidatePath(`/${tenantSlug}/payroll/employees`);
  redirect(`/${tenantSlug}/payroll/employees`);
}

export async function toggleEmployeeAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const id = String(formData.get("id") || "");
  if (!tenantSlug || !id) throw new Error("Missing tenantSlug or id");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const e = await db.employee.findFirst({
    where: { id, tenantId: auth.tenant.id, entityId: entity.id },
  });
  if (!e) throw new Error("Employee not found");

  await db.employee.update({
    where: { id: e.id },
    data: {
      isActive: !e.isActive,
      terminationDate: e.isActive ? new Date() : null,
    },
  });
  revalidatePath(`/${tenantSlug}/payroll/employees`);
}
