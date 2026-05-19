"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import {
  processDueRecurringInvoices,
  runRecurringInvoiceOnce,
} from "@/lib/accounting/recurring";

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

export async function createRecurringInvoice(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${tenantSlug}/ar/invoices`);
  }

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) redirect(`/${tenantSlug}/books`);

  const customerId = formData.get("customerId")?.toString() ?? "";
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

  // Lines
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

  if (!customerId || !name || !startDateStr || lineDrafts.length === 0) {
    throw new Error(
      "Customer, name, start date, and at least one valid line are required."
    );
  }

  const startDate = new Date(startDateStr + "T00:00:00.000Z");
  const endDate = endDateStr ? new Date(endDateStr + "T23:59:59.000Z") : null;

  await db.recurringInvoice.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      customerId,
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

  revalidatePath(`/${tenantSlug}/ar/recurring`);
  redirect(`/${tenantSlug}/ar/recurring`);
}

export async function pauseRecurringInvoice(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  await db.recurringInvoice.update({
    where: { id, tenantId: auth.tenant.id },
    data: { status: "PAUSED" },
  });
  revalidatePath(`/${tenantSlug}/ar/recurring`);
}

export async function resumeRecurringInvoice(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  await db.recurringInvoice.update({
    where: { id, tenantId: auth.tenant.id },
    data: { status: "ACTIVE" },
  });
  revalidatePath(`/${tenantSlug}/ar/recurring`);
}

export async function cancelRecurringInvoice(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role)) return;

  await db.recurringInvoice.update({
    where: { id, tenantId: auth.tenant.id },
    data: { status: "CANCELED" },
  });
  revalidatePath(`/${tenantSlug}/ar/recurring`);
}

export async function runRecurringNow(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  const schedule = await db.recurringInvoice.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { nextRunDate: true },
  });
  if (!schedule) return;

  await runRecurringInvoiceOnce({
    recurringInvoiceId: id,
    scheduledFor: schedule.nextRunDate,
  });
  revalidatePath(`/${tenantSlug}/ar/recurring`);
}

export async function processDueNow(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) return;

  await processDueRecurringInvoices({ tenantId: auth.tenant.id });
  revalidatePath(`/${tenantSlug}/ar/recurring`);
}

