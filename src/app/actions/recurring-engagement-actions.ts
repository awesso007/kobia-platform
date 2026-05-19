"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  EngagementType,
  RecurringFrequency,
  RecurringStatus,
} from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function parseDate(s: string | null): Date {
  if (!s) return new Date();
  const t = s.trim();
  if (!t) return new Date();
  return new Date(t + "T12:00:00Z");
}

/** Compute the next run date given a frequency, interval, and dayOfMonth. */
function computeNextRun(
  from: Date,
  frequency: RecurringFrequency,
  intervalCount: number,
  dayOfMonth: number | null
): Date {
  const next = new Date(from);
  switch (frequency) {
    case "WEEKLY":
      next.setDate(next.getDate() + 7 * intervalCount);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + intervalCount);
      if (dayOfMonth) {
        next.setDate(Math.min(dayOfMonth, 28));
      }
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3 * intervalCount);
      if (dayOfMonth) {
        next.setDate(Math.min(dayOfMonth, 28));
      }
      break;
    case "ANNUALLY":
      next.setFullYear(next.getFullYear() + intervalCount);
      break;
  }
  return next;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createRecurringEngagementAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const entityId = ((formData.get("entityId") as string) || "").trim();
  const name = ((formData.get("name") as string) || "").trim();
  const type = ((formData.get("type") as EngagementType) ||
    "BOOKKEEPING") as EngagementType;
  const frequency =
    ((formData.get("frequency") as RecurringFrequency) ||
      "MONTHLY") as RecurringFrequency;
  const intervalCount = Math.max(1, Number(formData.get("intervalCount")) || 1);
  const dayOfMonthRaw = Number(formData.get("dayOfMonth"));
  const dayOfMonth =
    Number.isFinite(dayOfMonthRaw) && dayOfMonthRaw >= 1 && dayOfMonthRaw <= 28
      ? dayOfMonthRaw
      : null;
  const startDate = parseDate(formData.get("startDate") as string | null);
  const endDate = (formData.get("endDate") as string | null)
    ? parseDate(formData.get("endDate") as string)
    : null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const defaultTaskTitles =
    ((formData.get("defaultTaskTitles") as string) || "").trim() || null;

  if (!entityId) throw new Error("Client is required");
  if (!name) throw new Error("Name is required");

  // Verify entity belongs to tenant
  const entity = await db.entity.findFirst({
    where: { id: entityId, tenantId: auth.tenant.id },
  });
  if (!entity) throw new Error("Client not found");

  await db.recurringEngagement.create({
    data: {
      tenantId: auth.tenant.id,
      entityId,
      name,
      type,
      frequency,
      intervalCount,
      dayOfMonth,
      startDate,
      endDate,
      notes,
      defaultTaskTitles,
      status: "ACTIVE",
      nextRunDate: startDate,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/recurring`);
  redirect(`/${tenantSlug}/practice/recurring`);
}

export async function setRecurringStatusAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const status = formData.get("status") as RecurringStatus;

  const existing = await db.recurringEngagement.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Not found");

  await db.recurringEngagement.update({
    where: { id },
    data: { status },
  });

  revalidatePath(`/${tenantSlug}/practice/recurring`);
  revalidatePath(`/${tenantSlug}/practice/recurring/${id}`);
}

// ─── MATERIALIZATION ────────────────────────────────────────────────────────

/** Materialize ONE engagement from a recurring template. Internal helper. */
async function materializeOne(
  tenantId: string,
  recurringId: string
): Promise<{ engagementId: string }> {
  const tmpl = await db.recurringEngagement.findFirst({
    where: { id: recurringId, tenantId, status: "ACTIVE" },
  });
  if (!tmpl) throw new Error("Active template not found");

  // Create the engagement
  const engagement = await db.engagement.create({
    data: {
      tenantId,
      entityId: tmpl.entityId,
      name: `${tmpl.name} — ${new Date(tmpl.nextRunDate).toLocaleDateString(
        "en-US",
        { month: "short", year: "numeric" }
      )}`,
      type: tmpl.type,
      status: "ACTIVE",
      startDate: tmpl.nextRunDate,
      notes: tmpl.notes,
    },
  });

  // Create default tasks if any
  if (tmpl.defaultTaskTitles) {
    const titles = tmpl.defaultTaskTitles
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (titles.length > 0) {
      await db.task.createMany({
        data: titles.map((title, idx) => ({
          tenantId,
          engagementId: engagement.id,
          title,
          sortOrder: idx * 10,
          status: "TODO" as const,
        })),
      });
    }
  }

  // Log the run
  await db.recurringEngagementRun.create({
    data: {
      tenantId,
      recurringEngagementId: tmpl.id,
      generatedEngagementId: engagement.id,
      status: "SUCCESS",
    },
  });

  // Advance the schedule
  const nextRun = computeNextRun(
    tmpl.nextRunDate,
    tmpl.frequency,
    tmpl.intervalCount,
    tmpl.dayOfMonth
  );

  const runsCompleted = tmpl.runsCompleted + 1;
  const hitMaxRuns = tmpl.maxRuns != null && runsCompleted >= tmpl.maxRuns;
  const hitEndDate = tmpl.endDate != null && nextRun > tmpl.endDate;

  await db.recurringEngagement.update({
    where: { id: tmpl.id },
    data: {
      lastRunDate: new Date(),
      nextRunDate: nextRun,
      runsCompleted,
      status: hitMaxRuns || hitEndDate ? "COMPLETED" : tmpl.status,
    },
  });

  return { engagementId: engagement.id };
}

/** User-driven: run a template right now. */
export async function materializeNowAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  await materializeOne(auth.tenant.id, id);
  revalidatePath(`/${tenantSlug}/practice/recurring`);
  revalidatePath(`/${tenantSlug}/practice/recurring/${id}`);
}

/** Sweep: materialize every template whose nextRunDate has passed. */
export async function materializeAllDueAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const due = await db.recurringEngagement.findMany({
    where: {
      tenantId: auth.tenant.id,
      status: "ACTIVE",
      nextRunDate: { lte: new Date() },
    },
    select: { id: true },
    take: 100,
  });

  for (const t of due) {
    try {
      await materializeOne(auth.tenant.id, t.id);
    } catch (e) {
      await db.recurringEngagementRun.create({
        data: {
          tenantId: auth.tenant.id,
          recurringEngagementId: t.id,
          status: "FAILED",
          errorMessage:
            e instanceof Error ? e.message : "Unknown materialization error",
        },
      });
    }
  }

  revalidatePath(`/${tenantSlug}/practice/recurring`);
}
