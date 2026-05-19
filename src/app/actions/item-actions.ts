"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";

function parseCents(s: string): bigint {
  const cleaned = s.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
}

function parseQtyMilli(s: string): bigint {
  const cleaned = s.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) {
    throw new Error(`Invalid quantity: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  return BigInt(whole) * 1000n + BigInt((frac + "000").slice(0, 3));
}

export async function createItem(formData: FormData) {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    throw new Error("Forbidden");
  }
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) redirect(`/${tenantSlug}/books`);

  const type = (formData.get("type") as string) === "INVENTORY" ? "INVENTORY" : "SERVICE";
  const name = ((formData.get("name") as string) || "").trim();
  const sku = ((formData.get("sku") as string) || "").trim() || null;
  const description = ((formData.get("description") as string) || "").trim() || null;
  const revenueAccountId = (formData.get("revenueAccountId") as string) || "";
  const inventoryAccountId = (formData.get("inventoryAccountId") as string) || null;
  const cogsAccountId = (formData.get("cogsAccountId") as string) || null;
  const unitPriceCents = parseCents((formData.get("unitPrice") as string) || "0");
  const unitCostCents = parseCents((formData.get("unitCost") as string) || "0");
  const qtyOnHandMilli = parseQtyMilli((formData.get("qtyOnHand") as string) || "0");

  if (!name) throw new Error("Name required");
  if (!revenueAccountId) throw new Error("Revenue account required");
  if (type === "INVENTORY" && (!inventoryAccountId || !cogsAccountId)) {
    throw new Error("Inventory items require both Inventory and COGS accounts.");
  }

  await db.item.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      sku,
      name,
      description,
      type,
      revenueAccountId,
      inventoryAccountId: type === "INVENTORY" ? inventoryAccountId : null,
      cogsAccountId: type === "INVENTORY" ? cogsAccountId : null,
      unitPriceCents,
      unitCostCents,
      qtyOnHandMilli: type === "INVENTORY" ? qtyOnHandMilli : 0n,
    },
  });

  revalidatePath(`/${tenantSlug}/items`);
  redirect(`/${tenantSlug}/items`);
}

export async function toggleItem(formData: FormData) {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) throw new Error("Forbidden");

  const itemId = formData.get("itemId") as string;
  const existing = await db.item.findFirst({
    where: { id: itemId, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Not found");

  await db.item.update({
    where: { id: itemId },
    data: { isActive: !existing.isActive },
  });
  revalidatePath(`/${tenantSlug}/items`);
}

export async function adjustQty(formData: FormData) {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) throw new Error("Forbidden");

  const itemId = formData.get("itemId") as string;
  const deltaMilli = parseQtyMilli((formData.get("delta") as string) || "0");
  const sign = (formData.get("sign") as string) === "out" ? -1n : 1n;

  const existing = await db.item.findFirst({
    where: { id: itemId, tenantId: auth.tenant.id, type: "INVENTORY" },
  });
  if (!existing) throw new Error("Inventory item not found");

  await db.item.update({
    where: { id: itemId },
    data: {
      qtyOnHandMilli: existing.qtyOnHandMilli + sign * deltaMilli,
    },
  });
  revalidatePath(`/${tenantSlug}/items`);
}
