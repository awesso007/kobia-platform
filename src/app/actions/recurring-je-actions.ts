"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { RecurringFrequency } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import {
  runOneRecurringJE,
  runDueRecurringJEsForEntity,
} from "@/lib/accounting/recurring-je";

function parseCents(s: string): bigint {
  const cleaned = (s || "").trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
}

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

/**
 * Create a recurring JE template + its lines. Lines are submitted as parallel arrays
 * named line_account[], line_debit[], line_credit[], line_memo[], line_class[],
 * line_location[], line_department[].
 * Must balance (sum debits = sum credits) and have at least 2 non-zero lines.
 */
export async function createRecurringJEAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity selected.");

  const name = ((formData.get("name") as string) || "").trim();
  const description = ((formData.get("description") as string) || "").trim();
  const memo = ((formData.get("memo") as string) || "").trim();
  const frequency = (formData.get("frequency") as RecurringFrequency) || "MONTHLY";
  const nextRunDateStr = (formData.get("nextRunDate") as string) || "";
  const endDateStr = (formData.get("endDate") as string) || "";

  if (!name) throw new Error("Name is required.");
  if (!nextRunDateStr) throw new Error("First run date is required.");
  if (!["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"].includes(frequency)) {
    throw new Error("Invalid frequency.");
  }

  const accounts = formData.getAll("line_account").map((v) => String(v));
  const debits = formData.getAll("line_debit").map((v) => String(v));
  const credits = formData.getAll("line_credit").map((v) => String(v));
  const memos = formData.getAll("line_memo").map((v) => String(v));
  const classes = formData.getAll("line_class").map((v) => String(v));
  const locations = formData.getAll("line_location").map((v) => String(v));
  const departments = formData.getAll("line_department").map((v) => String(v));

  type DraftLine = {
    accountId: string;
    debitCents: bigint;
    creditCents: bigint;
    memo: string;
    classTag: string;
    locationTag: string;
    departmentTag: string;
    lineNumber: number;
  };

  const lines: DraftLine[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (let i = 0; i < accounts.length; i++) {
    const accId = accounts[i]?.trim() ?? "";
    if (!accId) continue;
    const d = parseCents(debits[i] ?? "0");
    const c = parseCents(credits[i] ?? "0");
    if (d === 0n && c === 0n) continue;
    if (d > 0n && c > 0n) throw new Error(`Line ${i + 1}: cannot have both debit and credit.`);
    totalDebit += d;
    totalCredit += c;
    lines.push({
      accountId: accId,
      debitCents: d,
      creditCents: c,
      memo: (memos[i] ?? "").trim(),
      classTag: (classes[i] ?? "").trim(),
      locationTag: (locations[i] ?? "").trim(),
      departmentTag: (departments[i] ?? "").trim(),
      lineNumber: lines.length + 1,
    });
  }

  if (lines.length < 2) throw new Error("At least 2 lines are required.");
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Lines must balance — debits ${totalDebit} cents vs credits ${totalCredit} cents.`,
    );
  }

  // Verify accounts all belong to this entity.
  const accountIds = Array.from(new Set(lines.map((l) => l.accountId)));
  const owned = await db.account.count({
    where: { id: { in: accountIds }, entityId: entity.id, tenantId: auth.tenant.id },
  });
  if (owned !== accountIds.length) {
    throw new Error("One or more accounts don’t belong to the active entity.");
  }

  await db.recurringJournalEntry.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      name,
      description: description || null,
      memo: memo || null,
      frequency,
      nextRunDate: new Date(nextRunDateStr + "T12:00:00Z"),
      endDate: endDateStr ? new Date(endDateStr + "T12:00:00Z") : null,
      createdByUserId: auth.user.id,
      lines: {
        create: lines.map((l) => ({
          tenantId: auth.tenant.id,
          accountId: l.accountId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          memo: l.memo || null,
          classTag: l.classTag || null,
          locationTag: l.locationTag || null,
          departmentTag: l.departmentTag || null,
          lineNumber: l.lineNumber,
        })),
      },
    },
  });

  revalidatePath(`/${tenantSlug}/books/recurring-jes`);
  redirect(`/${tenantSlug}/books/recurring-jes?created=1`);
}

export async function toggleRecurringJEAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("recurringId") as string;
  const existing = await db.recurringJournalEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, isActive: true },
  });
  if (!existing) throw new Error("Template not found.");

  await db.recurringJournalEntry.update({
    where: { id: existing.id },
    data: { isActive: !existing.isActive },
  });

  revalidatePath(`/${tenantSlug}/books/recurring-jes`);
}

export async function deleteRecurringJEAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("recurringId") as string;
  const existing = await db.recurringJournalEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Template not found.");

  // Cascade deletes lines (FK relation onDelete: Cascade).
  await db.recurringJournalEntry.delete({ where: { id: existing.id } });

  revalidatePath(`/${tenantSlug}/books/recurring-jes`);
}

export async function runRecurringJENowAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("recurringId") as string;
  const existing = await db.recurringJournalEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Template not found.");

  const result = await runOneRecurringJE(existing.id, auth.user.id);

  const c = cookies();
  c.set(
    "kobia_recurring_je_result",
    JSON.stringify({
      posted: result.posted ? 1 : 0,
      failed: result.posted ? 0 : 1,
      name: result.name,
      error: result.error ?? null,
      ts: Date.now(),
    }),
    { path: "/", maxAge: 15 },
  );

  revalidatePath(`/${tenantSlug}/books/recurring-jes`);
}

export async function runAllDueRecurringJEsAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity selected.");

  const results = await runDueRecurringJEsForEntity({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    postedByUserId: auth.user.id,
  });

  const posted = results.filter((r) => r.posted).length;
  const failed = results.length - posted;

  const c = cookies();
  c.set(
    "kobia_recurring_je_result",
    JSON.stringify({
      posted,
      failed,
      bulk: 1,
      ts: Date.now(),
    }),
    { path: "/", maxAge: 15 },
  );

  revalidatePath(`/${tenantSlug}/books/recurring-jes`);
}
