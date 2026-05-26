"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function canEdit(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function updateTenantBranding(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  const primaryColor = String(formData.get("primaryColor") ?? "").trim() || null;
  const secondaryColor = String(formData.get("secondaryColor") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legalName") ?? "").trim() || null;

  if (!tenantSlug) return;
  const auth = await getAuthContext(tenantSlug);
  if (!auth || !canEdit(auth.role)) return;

  await db.tenant.update({
    where: { id: auth.tenant.id },
    data: {
      ...(name ? { name } : {}),
      legalName,
      logoUrl,
      ...(primaryColor ? { primaryColor } : {}),
      ...(secondaryColor ? { secondaryColor } : {}),
    },
  });

  revalidatePath(`/${tenantSlug}/settings/branding`);
}

export async function updateEntityFiscal(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const fiscalYearEnd = String(formData.get("fiscalYearEnd") ?? "").trim() || null;
  const baseCurrency = String(formData.get("baseCurrency") ?? "USD").trim();

  if (!tenantSlug || !entityId) return;
  const auth = await getAuthContext(tenantSlug);
  if (!auth || !canEdit(auth.role)) return;

  await db.entity.updateMany({
    where: { id: entityId, tenantId: auth.tenant.id },
    data: { fiscalYearEnd, baseCurrency },
  });

  revalidatePath(`/${tenantSlug}/settings/fiscal`);
}
