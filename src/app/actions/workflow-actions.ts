"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  Prisma,
  WorkflowTrigger,
  WorkflowActionType,
  TaskPriority,
  ActivityType,
} from "@prisma/client";
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

function buildActionConfig(
  actionType: WorkflowActionType,
  fd: FormData,
): Record<string, unknown> {
  switch (actionType) {
    case "CREATE_TASK": {
      const title = s(fd, "task_title");
      if (!title) throw new Error("Task title required");
      const priority = (s(fd, "task_priority") ?? "MED") as TaskPriority;
      const dueRaw = s(fd, "task_due_in_days");
      const dueInDays = dueRaw ? Math.max(0, parseInt(dueRaw, 10) || 0) : null;
      return {
        type: "CREATE_TASK",
        title,
        priority,
        ...(dueInDays !== null ? { dueInDays } : {}),
      };
    }
    case "LOG_ACTIVITY": {
      const subject = s(fd, "activity_subject");
      if (!subject) throw new Error("Activity subject required");
      const activityType = (s(fd, "activity_type") ?? "NOTE") as ActivityType;
      const body = s(fd, "activity_body");
      return {
        type: "LOG_ACTIVITY",
        subject,
        activityType,
        ...(body ? { body } : {}),
      };
    }
    case "SEND_INTERNAL_NOTE": {
      const note = s(fd, "note");
      if (!note) throw new Error("Note required");
      return { type: "SEND_INTERNAL_NOTE", note };
    }
    case "CREATE_ENGAGEMENT": {
      const title = s(fd, "engagement_title");
      if (!title) throw new Error("Engagement title required");
      return {
        type: "CREATE_ENGAGEMENT",
        title,
        engagementType: s(fd, "engagement_type") ?? "GENERAL",
      };
    }
    case "UPDATE_DEAL_STAGE": {
      const targetStageName = s(fd, "target_stage_name");
      if (!targetStageName) throw new Error("Target stage name required");
      return { type: "UPDATE_DEAL_STAGE", targetStageName };
    }
  }
}

export async function createWorkflowRule(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  const { tenant, role } = auth;
  assertRole(role);

  const name = s(fd, "name");
  if (!name) throw new Error("Name required");
  const trigger = s(fd, "trigger") as WorkflowTrigger | null;
  if (!trigger) throw new Error("Trigger required");
  const actionType = s(fd, "action_type") as WorkflowActionType | null;
  if (!actionType) throw new Error("Action required");

  const actionConfig = buildActionConfig(actionType, fd);

  await db.workflowRule.create({
    data: {
      tenantId: tenant.id,
      name,
      description: s(fd, "description"),
      trigger,
      actionType,
      actionConfig: actionConfig as Prisma.InputJsonValue,
      isActive: s(fd, "is_active") === "1",
    },
  });

  revalidatePath(`/${slug}/workflows`);
  redirect(`/${slug}/workflows`);
}

export async function toggleWorkflowRule(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  const { tenant, role } = auth;
  assertRole(role);
  const id = s(fd, "id");
  if (!id) throw new Error("Missing rule id");
  const rule = await db.workflowRule.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!rule) throw new Error("Rule not found");
  await db.workflowRule.update({
    where: { id },
    data: { isActive: !rule.isActive },
  });
  revalidatePath(`/${slug}/workflows`);
}

export async function deleteWorkflowRule(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  const { tenant, role } = auth;
  assertRole(role);
  const id = s(fd, "id");
  if (!id) throw new Error("Missing rule id");
  await db.workflowRule.deleteMany({
    where: { id, tenantId: tenant.id },
  });
  revalidatePath(`/${slug}/workflows`);
  redirect(`/${slug}/workflows`);
}
