"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { TaxFilingType, TaxFilingStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dollarsToCents(v: string | null): bigint | null {
  if (!v) return null;
  const t = v.trim().replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.round(n * 100));
}

export async function createTaxFiling(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);

  const filingType = s(fd, "filingType") as TaxFilingType | null;
  if (!filingType) throw new Error("Filing type required");
  const periodLabel = s(fd, "periodLabel");
  if (!periodLabel) throw new Error("Period required");
  const dueDate = parseDate(s(fd, "dueDate"));
  if (!dueDate) throw new Error("Due date required");

  await db.taxFiling.create({
    data: {
      tenantId: auth.tenant.id,
      filingType,
      jurisdiction: s(fd, "jurisdiction"),
      periodLabel,
      dueDate,
      entityId: s(fd, "entityId"),
      amountCents: dollarsToCents(s(fd, "amount")),
      notes: s(fd, "notes"),
      status: (s(fd, "status") ?? "UPCOMING") as TaxFilingStatus,
      assigneeUserId: auth.user.id,
    },
  });

  revalidatePath(`/${slug}/tax-filings`);
  redirect(`/${slug}/tax-filings`);
}

export async function markTaxFilingFiled(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);
  const id = s(fd, "id");
  if (!id) throw new Error("Missing id");
  const confirmationNo = s(fd, "confirmationNo");

  await db.taxFiling.updateMany({
    where: { id, tenantId: auth.tenant.id },
    data: {
      status: "FILED",
      filedAt: new Date(),
      ...(confirmationNo ? { confirmationNo } : {}),
    },
  });

  revalidatePath(`/${slug}/tax-filings`);
}

export async function updateTaxFilingStatus(
  slug: string,
  fd: FormData,
): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);
  const id = s(fd, "id");
  if (!id) throw new Error("Missing id");
  const status = s(fd, "status") as TaxFilingStatus | null;
  if (!status) throw new Error("Status required");

  await db.taxFiling.updateMany({
    where: { id, tenantId: auth.tenant.id },
    data: { status },
  });

  revalidatePath(`/${slug}/tax-filings`);
}

export async function deleteTaxFiling(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);
  const id = s(fd, "id");
  if (!id) throw new Error("Missing id");

  await db.taxFiling.deleteMany({
    where: { id, tenantId: auth.tenant.id },
  });

  revalidatePath(`/${slug}/tax-filings`);
}
