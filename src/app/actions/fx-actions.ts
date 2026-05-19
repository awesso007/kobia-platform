"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantBySlug } from "@/lib/tenant";
import { upsertRate } from "@/lib/accounting/fx";
import { db } from "@/lib/db";

async function resolveTenant(slug: string) {
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");
  return tenant;
}

export async function upsertRateAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const fromCurrency = String(formData.get("fromCurrency") ?? "").toUpperCase();
  const toCurrency = String(formData.get("toCurrency") ?? "").toUpperCase();
  const rate = String(formData.get("rate") ?? "");
  const rateDate = new Date(String(formData.get("rateDate") ?? new Date().toISOString()));

  const tenant = await resolveTenant(slug);
  const { userId } = await auth();
  await upsertRate({
    tenantId: tenant.id,
    fromCurrency,
    toCurrency,
    rate,
    rateDate,
    source: "manual",
    createdByUserId: userId ?? undefined,
  });
  revalidatePath(`/${slug}/settings/currencies`);
}

export async function deleteRateAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const tenant = await resolveTenant(slug);
  await db.exchangeRate.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath(`/${slug}/settings/currencies`);
}
