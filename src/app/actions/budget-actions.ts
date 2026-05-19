"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";

function parseDollarsToCents(s: string): bigint {
  const cleaned = (s ?? "").trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return 0n;
  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;
  const [whole = "0", frac = ""] = body.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const v = BigInt(whole) * 100n + BigInt(fracPadded);
  return negative ? -v : v;
}

export async function createBudget(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${tenantSlug}/books`);
  }
  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) redirect(`/${tenantSlug}/books`);

  const name = formData.get("name")?.toString().trim() ?? "";
  const fiscalYear = Number(formData.get("fiscalYear") ?? new Date().getUTCFullYear());
  const currency = formData.get("currency")?.toString() ?? entity.baseCurrency ?? "USD";
  if (!name || !fiscalYear) throw new Error("Name and fiscal year are required.");

  const budget = await db.budget.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      name,
      fiscalYear,
      currency,
    },
  });
  revalidatePath(`/${tenantSlug}/books/budget`);
  redirect(`/${tenantSlug}/books/budget/${budget.id}`);
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export async function saveBudgetLines(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const budgetId = formData.get("budgetId")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${tenantSlug}/books`);
  }

  const budget = await db.budget.findFirst({
    where: { id: budgetId, tenantId: auth.tenant.id },
  });
  if (!budget) redirect(`/${tenantSlug}/books/budget`);

  const accountCount = Number(formData.get("accountCount") ?? 0);
  for (let i = 0; i < accountCount; i++) {
    const accountId = formData.get(`row_${i}_accountId`)?.toString() ?? "";
    if (!accountId) continue;
    const monthValues: Record<string, bigint> = {};
    for (const m of MONTHS) {
      monthValues[m] = parseDollarsToCents(
        formData.get(`row_${i}_${m}`)?.toString() ?? ""
      );
    }
    await db.budgetLine.upsert({
      where: { budgetId_accountId: { budgetId: budget!.id, accountId } },
      create: {
        tenantId: auth.tenant.id,
        budgetId: budget!.id,
        accountId,
        ...monthValues,
      },
      update: { ...monthValues },
    });
  }
  revalidatePath(`/${tenantSlug}/books/budget/${budgetId}`);
}

export async function deleteBudget(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role)) return;

  const target = await db.budget.findFirst({ where: { id, tenantId: auth.tenant.id }, select: { id: true } });
  if (!target) return;
  await db.budget.delete({ where: { id: target.id } });
  revalidatePath(`/${tenantSlug}/books/budget`);
  redirect(`/${tenantSlug}/books/budget`);
}
