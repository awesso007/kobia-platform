"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function enableBillPortal(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const billId = String(formData.get("billId") || "");

  if (!tenantSlug || !billId) throw new Error("Missing tenantSlug or billId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const existing = await db.bill.findFirst({
    where: { id: billId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Bill not found");

  await db.bill.update({
    where: { id: existing.id },
    data: { publicViewToken: generateToken() },
  });

  revalidatePath(`/${tenantSlug}/ap/bills/${billId}`);
}

export async function disableBillPortal(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const billId = String(formData.get("billId") || "");

  if (!tenantSlug || !billId) throw new Error("Missing tenantSlug or billId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const existing = await db.bill.findFirst({
    where: { id: billId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Bill not found");

  await db.bill.update({
    where: { id: existing.id },
    data: { publicViewToken: null },
  });

  revalidatePath(`/${tenantSlug}/ap/bills/${billId}`);
}
