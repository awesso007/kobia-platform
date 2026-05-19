"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  EngagementStatus,
  EngagementType,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return new Date(t + "T12:00:00Z");
}

// ─── ENGAGEMENTS ────────────────────────────────────────────────────────────

export async function createEngagementAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const name = ((formData.get("name") as string) || "").trim();
  const entityId = (formData.get("entityId") as string) || "";
  const type = (formData.get("type") as EngagementType) || "BOOKKEEPING";
  const startDate = parseDate(formData.get("startDate") as string | null);
  const targetDate = parseDate(formData.get("targetDate") as string | null);
  const notes = ((formData.get("notes") as string) || "").trim();

  if (!name) throw new Error("Engagement name is required.");
  if (!entityId) throw new Error("Client (entity) is required.");

  const entity = await db.entity.findFirst({
    where: { id: entityId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!entity) throw new Error("Client not found in this firm.");

  const engagement = await db.engagement.create({
    data: {
      tenantId: auth.tenant.id,
      entityId,
      name,
      type,
      startDate,
      targetDate,
      notes: notes || null,
      createdByUserId: auth.user.id,
    },
    select: { id: true },
  });

  revalidatePath(`/${tenantSlug}/practice`);
  redirect(`/${tenantSlug}/practice/engagements/${engagement.id}`);
}

export async function updateEngagementStatusAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("engagementId") as string;
  const status = formData.get("status") as EngagementStatus;
  const allowed: EngagementStatus[] = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
  if (!allowed.includes(status)) throw new Error("Invalid status.");

  const existing = await db.engagement.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Engagement not found.");

  await db.engagement.update({
    where: { id: existing.id },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath(`/${tenantSlug}/practice`);
  revalidatePath(`/${tenantSlug}/practice/engagements/${existing.id}`);
}

export async function deleteEngagementAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("engagementId") as string;
  const existing = await db.engagement.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Engagement not found.");

  await db.engagement.delete({ where: { id: existing.id } });

  revalidatePath(`/${tenantSlug}/practice`);
  redirect(`/${tenantSlug}/practice`);
}

// ─── TASKS ──────────────────────────────────────────────────────────────────

export async function createTaskAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const engagementId = formData.get("engagementId") as string;
  const title = ((formData.get("title") as string) || "").trim();
  const description = ((formData.get("description") as string) || "").trim();
  const priority = (formData.get("priority") as TaskPriority) || "MED";
  const dueDate = parseDate(formData.get("dueDate") as string | null);
  const assigneeUserId = (formData.get("assigneeUserId") as string) || "";

  if (!title) throw new Error("Task title is required.");

  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!engagement) throw new Error("Engagement not found.");

  // Determine sort order — append to end of TODO column
  const last = await db.task.findFirst({
    where: { engagementId: engagement.id, status: "TODO" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 10;

  await db.task.create({
    data: {
      tenantId: auth.tenant.id,
      engagementId: engagement.id,
      title,
      description: description || null,
      priority,
      dueDate,
      assigneeUserId: assigneeUserId || null,
      sortOrder,
      createdByUserId: auth.user.id,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/engagements/${engagement.id}`);
  revalidatePath(`/${tenantSlug}/practice/tasks`);
}

export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("taskId") as string;
  const status = formData.get("status") as TaskStatus;
  const allowed: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
  if (!allowed.includes(status)) throw new Error("Invalid task status.");

  const existing = await db.task.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, engagementId: true },
  });
  if (!existing) throw new Error("Task not found.");

  await db.task.update({
    where: { id: existing.id },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/engagements/${existing.engagementId}`);
  revalidatePath(`/${tenantSlug}/practice/tasks`);
}

export async function updateTaskAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("taskId") as string;
  const title = ((formData.get("title") as string) || "").trim();
  const description = ((formData.get("description") as string) || "").trim();
  const priority = (formData.get("priority") as TaskPriority) || "MED";
  const dueDate = parseDate(formData.get("dueDate") as string | null);
  const assigneeUserId = (formData.get("assigneeUserId") as string) || "";

  if (!title) throw new Error("Task title is required.");

  const existing = await db.task.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, engagementId: true },
  });
  if (!existing) throw new Error("Task not found.");

  await db.task.update({
    where: { id: existing.id },
    data: {
      title,
      description: description || null,
      priority,
      dueDate,
      assigneeUserId: assigneeUserId || null,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/engagements/${existing.engagementId}`);
  revalidatePath(`/${tenantSlug}/practice/tasks`);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("taskId") as string;
  const existing = await db.task.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, engagementId: true },
  });
  if (!existing) throw new Error("Task not found.");

  await db.task.delete({ where: { id: existing.id } });

  revalidatePath(`/${tenantSlug}/practice/engagements/${existing.engagementId}`);
  revalidatePath(`/${tenantSlug}/practice/tasks`);
}
