"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";

export async function createTaxRateAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const name = String(formData.get("name") || "").trim();
  const jurisdiction = String(formData.get("jurisdiction") || "").trim() || null;
  const ratePct = Number(formData.get("ratePct") || 0);
  const isDefault = formData.get("isDefault") === "1";

  if (!tenantSlug || !name || isNaN(ratePct)) {
    throw new Error("Missing tenantSlug, name, or rate");
  }
  if (ratePct < 0 || ratePct > 100) throw new Error("Rate must be 0-100");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    throw new Error("Forbidden");
  }
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const rateBps = Math.round(ratePct * 100);

  if (isDefault) {
    await db.taxRate.updateMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id },
      data: { isDefault: false },
    });
  }
  await db.taxRate.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      name,
      jurisdiction,
      rateBps,
      isDefault,
    },
  });
  revalidatePath(`/${tenantSlug}/settings/tax-rates`);
}

export async function toggleTaxRateAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const id = String(formData.get("id") || "");
  if (!tenantSlug || !id) throw new Error("Missing tenantSlug or id");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const rate = await db.taxRate.findFirst({
    where: { id, tenantId: auth.tenant.id, entityId: entity.id },
  });
  if (!rate) throw new Error("Tax rate not found");

  await db.taxRate.update({ where: { id: rate.id }, data: { isActive: !rate.isActive } });
  revalidatePath(`/${tenantSlug}/settings/tax-rates`);
}

export async function setDefaultTaxRateAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const id = String(formData.get("id") || "");
  if (!tenantSlug || !id) throw new Error("Missing tenantSlug or id");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const rate = await db.taxRate.findFirst({
    where: { id, tenantId: auth.tenant.id, entityId: entity.id },
  });
  if (!rate) throw new Error("Tax rate not found");

  await db.taxRate.updateMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    data: { isDefault: false },
  });
  await db.taxRate.update({ where: { id: rate.id }, data: { isDefault: true, isActive: true } });
  revalidatePath(`/${tenantSlug}/settings/tax-rates`);
}

export async function deleteTaxRateAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const id = String(formData.get("id") || "");
  if (!tenantSlug || !id) throw new Error("Missing tenantSlug or id");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const rate = await db.taxRate.findFirst({
    where: { id, tenantId: auth.tenant.id, entityId: entity.id },
  });
  if (!rate) throw new Error("Tax rate not found");

  await db.taxRate.delete({ where: { id: rate.id } });
  revalidatePath(`/${tenantSlug}/settings/tax-rates`);
}
