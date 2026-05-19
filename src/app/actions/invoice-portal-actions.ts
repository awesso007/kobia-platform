"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";

function generateToken(): string {
  // 32 random bytes → 64-char hex, URL-safe
  return randomBytes(32).toString("hex");
}

/**
 * Generate (or regenerate) a public view token for an invoice.
 * Returns nothing; revalidates the invoice detail page.
 */
export async function enableInvoicePortal(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const invoiceId = String(formData.get("invoiceId") || "");

  if (!tenantSlug || !invoiceId) throw new Error("Missing tenantSlug or invoiceId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  const existing = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: auth.tenant.id, entityId: entity.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Invoice not found");

  await db.invoice.update({
    where: { id: existing.id },
    data: { publicViewToken: generateToken() },
  });

  revalidatePath(`/${tenantSlug}/ar/invoices/${invoiceId}`);
}

/**
 * Disable the public portal link for an invoice (clears the token).
 */
export async function disableInvoicePortal(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const invoiceId = String(formData.get("invoiceId") || "");

  if (!tenantSlug || !invoiceId) throw new Error("Missing tenantSlug or invoiceId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  const existing = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: auth.tenant.id, entityId: entity.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Invoice not found");

  await db.invoice.update({
    where: { id: existing.id },
    data: { publicViewToken: null },
  });

  revalidatePath(`/${tenantSlug}/ar/invoices/${invoiceId}`);
}
