"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import {
  processDueRecurringBills,
  runRecurringBillOnce,
} from "@/lib/accounting/recurring-bills";

function parseDollarsToCents(s: string): bigint {
  const cleaned = s.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error(`Invalid dollar amount: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(fracPadded);
}

function parseQuantityToMilli(s: string): bigint {
  const cleaned = s.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) {
    throw new Error(`Invalid quantity: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "000").slice(0, 3);
  return BigInt(whole) * 1000n + BigInt(fracPadded);
}

export async function createRecurringBill(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${tenantSlug}/ap/bills`);
  }

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) redirect(`/${tenantSlug}/books`);

  const vendorId = formData.get("vendorId")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const frequency =
    (formData.get("frequency")?.toString() as
      | "WEEKLY"
      | "MONTHLY"
      | "QUARTERLY"
      | "ANNUALLY") ?? "MONTHLY";
  const intervalCount = Number(formData.get("intervalCount") ?? 1);
  const dayOfMonthRaw = formData.get("dayOfMonth")?.toString();
  const dayOfMonth = dayOfMonthRaw ? Number(dayOfMonthRaw) : null;
  const startDateStr = formData.get("startDate")?.toString() ?? "";
  const endDateStr = formData.get("endDate")?.toString() ?? "";
  const termsDays = Number(formData.get("termsDays") ?? 30);
  const currency = formData.get("currency")?.toString() ?? entity.baseCurrency;
  const memo = formData.get("memo")?.toString()?.trim() || null;
  const maxRunsRaw = formData.get("maxRuns")?.toString();
  const maxRuns = maxRunsRaw ? Number(maxRunsRaw) : null;

  const lineCount = Number(formData.get("lineCount") ?? 0);
  const lineDrafts: Array<{
    accountId: string;
    description: string;
    quantityMilli: bigint;
    unitPriceCents: bigint;
    lineNumber: number;
  }> = [];
  for (let i = 0; i < lineCount; i++) {
    const accountId = formData.get(`line_${i}_accountId`)?.toString() ?? "";
    const description =
      formData.get(`line_${i}_description`)?.toString().trim() ?? "";
    const qtyStr = formData.get(`line_${i}_quantity`)?.toString() ?? "1";
    const priceStr = formData.get(`line_${i}_unitPrice`)?.toString() ?? "0";
    if (!accountId || !description) continue;
    const quantityMilli = parseQuantityToMilli(qtyStr);
    const unitPriceCents = parseDollarsToCents(priceStr);
    if (quantityMilli <= 0n || unitPriceCents <= 0n) continue;
    lineDrafts.push({
      accountId,
      description,
      quantityMilli,
      unitPriceCents,
      lineNumber: lineDrafts.length + 1,
    });
  }

  if (!vendorId || !name || !startDateStr || lineDrafts.length === 0) {
    throw new Error(
      "Vendor, name, start date, and at least one valid line are required."
    );
  }

  const startDate = new Date(startDateStr + "T00:00:00.000Z");
  const endDate = endDateStr ? new Date(endDateStr + "T23:59:59.000Z") : null;

  await db.recurringBill.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      vendorId,
      name,
      frequency,
      intervalCount,
      dayOfMonth,
      startDate,
      endDate,
      termsDays,
      currency,
      memo,
      maxRuns,
      nextRunDate: startDate,
      status: "ACTIVE",
      lines: {
        create: lineDrafts.map((l) => ({
          tenantId: auth.tenant.id,
          accountId: l.accountId,
          description: l.description,
          quantityMilli: l.quantityMilli,
          unitPriceCents: l.unitPriceCents,
          lineNumber: l.lineNumber,
        })),
      },
    },
  });

  revalidatePath(`/${tenantSlug}/ap/recurring`);
  redirect(`/${tenantSlug}/ap/recurring`);
}

export async function pauseRecurringBill(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  await db.recurringBill.update({
    where: { id, tenantId: auth.tenant.id },
    data: { status: "PAUSED" },
  });
  revalidatePath(`/${tenantSlug}/ap/recurring`);
}

export async function resumeRecurringBill(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  await db.recurringBill.update({
    where: { id, tenantId: auth.tenant.id },
    data: { status: "ACTIVE" },
  });
  revalidatePath(`/${tenantSlug}/ap/recurring`);
}

export async function cancelRecurringBill(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role)) return;

  await db.recurringBill.update({
    where: { id, tenantId: auth.tenant.id },
    data: { status: "CANCELED" },
  });
  revalidatePath(`/${tenantSlug}/ap/recurring`);
}

export async function runRecurringBillNow(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  const schedule = await db.recurringBill.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { nextRunDate: true },
  });
  if (!schedule) return;

  await runRecurringBillOnce({
    recurringBillId: id,
    scheduledFor: schedule.nextRunDate,
  });
  revalidatePath(`/${tenantSlug}/ap/recurring`);
}

export async function processDueBillsNow(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  await processDueRecurringBills({ tenantId: auth.tenant.id });
  revalidatePath(`/${tenantSlug}/ap/recurring`);
}
