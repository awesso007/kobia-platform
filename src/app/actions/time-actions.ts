"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PracticeTimeStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function dollarsToCents(s: string | null): bigint {
  if (!s) return 0n;
  const t = s.trim().replace(/[$,]/g, "");
  if (!t) return 0n;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 100));
}

function parseDateTimeLocal(s: string | null): Date | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  // <input type="datetime-local"> produces "YYYY-MM-DDTHH:mm"
  return new Date(t);
}

/** Resolve the hourly rate for a (user, engagement) pair. Returns cents. */
async function resolveRateCents(
  tenantId: string,
  userId: string,
  engagementId: string
): Promise<bigint> {
  // Order of preference: user+engagement > user > engagement > tenant default > 0
  const rates = await db.billingRate.findMany({
    where: {
      tenantId,
      OR: [
        { userId, engagementId },
        { userId, engagementId: null },
        { userId: null, engagementId },
        { userId: null, engagementId: null, isDefault: true },
      ],
    },
  });
  const exact = rates.find(
    (r) => r.userId === userId && r.engagementId === engagementId
  );
  if (exact) return exact.rateCents;
  const byUser = rates.find(
    (r) => r.userId === userId && r.engagementId === null
  );
  if (byUser) return byUser.rateCents;
  const byEngagement = rates.find(
    (r) => r.userId === null && r.engagementId === engagementId
  );
  if (byEngagement) return byEngagement.rateCents;
  const def = rates.find(
    (r) => r.userId === null && r.engagementId === null && r.isDefault
  );
  if (def) return def.rateCents;
  return 0n;
}

// ─── BILLING RATES ──────────────────────────────────────────────────────────

export async function upsertBillingRateAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const userId = ((formData.get("userId") as string) || "").trim() || null;
  const engagementId =
    ((formData.get("engagementId") as string) || "").trim() || null;
  const rateCents = dollarsToCents(formData.get("rate") as string | null);
  const isDefault = formData.get("isDefault") === "on";

  // If marking as default, unset any other defaults for this tenant
  if (isDefault) {
    await db.billingRate.updateMany({
      where: { tenantId: auth.tenant.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  // Look for a matching rate (same userId+engagementId scope) and update, else create
  const existing = await db.billingRate.findFirst({
    where: { tenantId: auth.tenant.id, userId, engagementId },
  });
  if (existing) {
    await db.billingRate.update({
      where: { id: existing.id },
      data: {
        rateCents,
        isDefault: isDefault && !userId && !engagementId,
        notes: ((formData.get("notes") as string) || "").trim() || null,
      },
    });
  } else {
    await db.billingRate.create({
      data: {
        tenantId: auth.tenant.id,
        userId,
        engagementId,
        rateCents,
        isDefault: isDefault && !userId && !engagementId,
        notes: ((formData.get("notes") as string) || "").trim() || null,
      },
    });
  }

  revalidatePath(`/${tenantSlug}/time/rates`);
}

export async function deleteBillingRateAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.billingRate.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Rate not found");

  await db.billingRate.delete({ where: { id } });
  revalidatePath(`/${tenantSlug}/time/rates`);
}

// ─── TIMER (running entries) ────────────────────────────────────────────────

/** Start a timer for the current user on an engagement. Stops any other running timer first. */
export async function startTimerAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const engagementId = (formData.get("engagementId") as string).trim();
  const description =
    ((formData.get("description") as string) || "").trim() || "Working";

  if (!engagementId) throw new Error("Engagement is required");

  // Stop any existing running timer for this user
  const running = await db.practiceTimeEntry.findFirst({
    where: {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      status: "RUNNING",
    },
  });
  if (running) {
    const now = new Date();
    const mins = Math.max(
      0,
      Math.round((now.getTime() - running.startedAt.getTime()) / 60000)
    );
    await db.practiceTimeEntry.update({
      where: { id: running.id },
      data: {
        endedAt: now,
        durationMinutes: mins,
        billableMinutes: mins,
        status: "LOGGED",
      },
    });
  }

  const rateCents = await resolveRateCents(
    auth.tenant.id,
    auth.user.id,
    engagementId
  );

  await db.practiceTimeEntry.create({
    data: {
      tenantId: auth.tenant.id,
      engagementId,
      userId: auth.user.id,
      description,
      startedAt: new Date(),
      rateCents,
      status: "RUNNING",
    },
  });

  revalidatePath(`/${tenantSlug}/time`);
}

export async function stopTimerAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;

  const entry = await db.practiceTimeEntry.findFirst({
    where: { id, tenantId: auth.tenant.id, status: "RUNNING" },
  });
  if (!entry) throw new Error("No running timer found");

  const now = new Date();
  const mins = Math.max(
    0,
    Math.round((now.getTime() - entry.startedAt.getTime()) / 60000)
  );

  await db.practiceTimeEntry.update({
    where: { id },
    data: {
      endedAt: now,
      durationMinutes: mins,
      billableMinutes: mins,
      status: "LOGGED",
    },
  });

  revalidatePath(`/${tenantSlug}/time`);
}

// ─── MANUAL ENTRIES ─────────────────────────────────────────────────────────

export async function createManualEntryAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const engagementId = (formData.get("engagementId") as string).trim();
  const description = (
    (formData.get("description") as string) || ""
  ).trim();
  const hours = Number(formData.get("hours") as string) || 0;
  const minutes = Number(formData.get("minutes") as string) || 0;
  const startedAt =
    parseDateTimeLocal(formData.get("startedAt") as string | null) ??
    new Date();
  const isBillable = formData.get("isBillable") !== "off";

  if (!engagementId) throw new Error("Engagement is required");
  if (!description) throw new Error("Description is required");

  const total = Math.max(0, Math.round(hours * 60 + minutes));
  if (total === 0) throw new Error("Duration must be greater than zero");

  const rateCents = await resolveRateCents(
    auth.tenant.id,
    auth.user.id,
    engagementId
  );

  await db.practiceTimeEntry.create({
    data: {
      tenantId: auth.tenant.id,
      engagementId,
      userId: auth.user.id,
      description,
      startedAt,
      endedAt: new Date(startedAt.getTime() + total * 60000),
      durationMinutes: total,
      billableMinutes: isBillable ? total : 0,
      rateCents,
      isBillable,
      status: "LOGGED",
    },
  });

  revalidatePath(`/${tenantSlug}/time`);
}

export async function updateEntryAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.practiceTimeEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Entry not found");
  if (existing.status === "BILLED") {
    throw new Error("Billed entries cannot be edited");
  }

  const hours = Number(formData.get("hours") as string) || 0;
  const minutes = Number(formData.get("minutes") as string) || 0;
  const total = Math.max(0, Math.round(hours * 60 + minutes));
  const isBillable = formData.get("isBillable") !== "off";

  await db.practiceTimeEntry.update({
    where: { id },
    data: {
      description: (
        (formData.get("description") as string) || existing.description
      ).trim(),
      durationMinutes: total,
      billableMinutes: isBillable ? total : 0,
      isBillable,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    },
  });

  revalidatePath(`/${tenantSlug}/time`);
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.practiceTimeEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Entry not found");
  if (existing.status === "BILLED") {
    throw new Error("Billed entries cannot be deleted");
  }

  await db.practiceTimeEntry.delete({ where: { id } });
  revalidatePath(`/${tenantSlug}/time`);
}

export async function setEntryStatusAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role)) {
    throw new Error("Only Owners and Admins can change status");
  }

  const id = formData.get("id") as string;
  const status = formData.get("status") as PracticeTimeStatus;

  const existing = await db.practiceTimeEntry.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Entry not found");

  await db.practiceTimeEntry.update({
    where: { id },
    data: { status },
  });

  revalidatePath(`/${tenantSlug}/time`);
}
