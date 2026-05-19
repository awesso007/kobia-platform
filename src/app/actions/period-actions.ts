"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantBySlug } from "@/lib/tenant";
import { getActiveEntity } from "@/lib/active-entity";
import {
  backfillPeriods,
  closePeriod,
  ensureMonthlyPeriod,
  reopenPeriod,
} from "@/lib/accounting/periods";
import { db } from "@/lib/db";

async function resolveTenantAndEntity(slug: string) {
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");
  const entity = await getActiveEntity({ tenantId: tenant.id, tenantSlug: tenant.slug });
  if (!entity) throw new Error("No active entity selected");
  return { tenant, entity };
}

/** Generate any missing monthly periods up to the current month. */
export async function backfillPeriodsAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { tenant, entity } = await resolveTenantAndEntity(slug);

  // Start from the earliest journal entry, or this entity's createdAt, whichever is older.
  const firstEntry = await db.journalEntry.findFirst({
    where: { entityId: entity.id },
    orderBy: { entryDate: "asc" },
    select: { entryDate: true },
  });
  const seed = firstEntry?.entryDate ?? entity.createdAt;
  await backfillPeriods(tenant.id, entity.id, seed.getUTCFullYear(), seed.getUTCMonth());
  revalidatePath(`/${slug}/books/close`);
}

/** Ensure a single monthly period exists (used by quick-create buttons). */
export async function ensurePeriodAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const year = Number(formData.get("year"));
  const monthIdx = Number(formData.get("monthIdx"));
  const { tenant, entity } = await resolveTenantAndEntity(slug);
  await ensureMonthlyPeriod(tenant.id, entity.id, year, monthIdx);
  revalidatePath(`/${slug}/books/close`);
}

/** Close a period. */
export async function closePeriodAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const closingNote = String(formData.get("closingNote") ?? "").trim() || undefined;

  if (!periodId) throw new Error("periodId required");
  await resolveTenantAndEntity(slug);
  const { userId } = await auth();
  await closePeriod({ periodId, closedByUserId: userId ?? undefined, closingNote });
  revalidatePath(`/${slug}/books/close`);
}

/** Reopen a period — requires reason. */
export async function reopenPeriodAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!periodId) throw new Error("periodId required");
  await resolveTenantAndEntity(slug);
  const { userId } = await auth();
  await reopenPeriod({ periodId, reopenedByUserId: userId ?? undefined, reason });
  revalidatePath(`/${slug}/books/close`);
}
