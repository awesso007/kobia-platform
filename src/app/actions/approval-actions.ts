"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { approveBill, rejectBill } from "@/lib/accounting/approvals";

function parseDollarsToCents(s: string): bigint {
  const cleaned = (s || "").trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error(`Invalid dollar amount: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(fracPadded);
}

/** OWNER/ADMIN: configure the approval threshold for the active entity. */
export async function saveApprovalRuleAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const thresholdDollars = String(formData.get("thresholdDollars") || "0");
  const isEnabled = formData.get("isEnabled") === "on";

  if (!tenantSlug) throw new Error("Missing tenantSlug");
  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN"].includes(auth.role)) throw new Error("Forbidden");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  const thresholdCents = parseDollarsToCents(thresholdDollars);

  await db.approvalRule.upsert({
    where: { entityId: entity.id },
    create: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      thresholdCents,
      isEnabled,
    },
    update: { thresholdCents, isEnabled },
  });

  revalidatePath(`/${tenantSlug}/settings/approvals`);
  revalidatePath(`/${tenantSlug}/ap/approvals`);
}

/** OWNER/ADMIN: approve a pending bill (posts it). */
export async function approveBillAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const billId = String(formData.get("billId") || "");
  const note = String(formData.get("note") || "") || undefined;

  if (!tenantSlug || !billId) throw new Error("Missing fields");
  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN"].includes(auth.role)) throw new Error("Forbidden");

  // Confirm bill belongs to tenant
  const bill = await db.bill.findFirst({
    where: { id: billId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!bill) throw new Error("Bill not found");

  await approveBill({
    tenantId: auth.tenant.id,
    billId: bill.id,
    decidedByUserId: auth.user.id,
    note,
  });

  revalidatePath(`/${tenantSlug}/ap/approvals`);
  redirect(`/${tenantSlug}/ap/bills/${bill.id}`);
}

/** OWNER/ADMIN: reject a pending bill. */
export async function rejectBillAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const billId = String(formData.get("billId") || "");
  const note = String(formData.get("note") || "") || undefined;

  if (!tenantSlug || !billId) throw new Error("Missing fields");
  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  if (!["OWNER", "ADMIN"].includes(auth.role)) throw new Error("Forbidden");

  const bill = await db.bill.findFirst({
    where: { id: billId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!bill) throw new Error("Bill not found");

  await rejectBill({
    tenantId: auth.tenant.id,
    billId: bill.id,
    decidedByUserId: auth.user.id,
    note,
  });

  revalidatePath(`/${tenantSlug}/ap/approvals`);
  redirect(`/${tenantSlug}/ap/approvals`);
}
