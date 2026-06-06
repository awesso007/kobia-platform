"use server";

/*
 * Projects + Tasks server actions (Sprint 11). All DB access goes through
 * getTenantDb(). Each mutating action enforces requirePermission, dispatches
 * automations, reindexes search, and notifies affected users where relevant.
 * Tasks/Projects are not CRM-audited entities (auditWrite only covers the 4 CRM
 * types), so we skip auditWrite here by design.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { notify } from "@/lib/notifications/notify";
import { projectKeyFromName } from "@/lib/projects/shared";
import { getTaskDetail } from "@/lib/projects/queries";

export async function loadTaskDetail(id: string) {
  return getTaskDetail(id);
}

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

/* ----------------------------------- Projects ----------------------------------- */

export async function createProject(input: {
  name: string;
  description?: string;
  status?: string;
  visibility?: string;
  ownerClerkUserId?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  color?: string;
  memberClerkUserIds?: string[];
}): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Project name is required.");
  const { db } = getTenantDb();

  // Unique key derived from the name; suffix -N on collision.
  const base = projectKeyFromName(name);
  let key = base;
  for (let n = 2; await db.project.findUnique({ where: { key } }); n++) key = `${base}-${n}`;

  const owner = input.ownerClerkUserId || currentUserId() || null;
  const project = await db.project.create({
    data: {
      key,
      name,
      description: input.description?.trim() || null,
      status: (input.status ?? "PLANNING") as never,
      visibility: (input.visibility ?? "TEAM") as never,
      ownerClerkUserId: owner,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      budget: input.budget != null ? input.budget : null,
      color: input.color || null,
    },
  });

  // Default task list for the project.
  await db.taskList.create({ data: { projectId: project.id, name: "Backlog", isDefault: true, sortOrder: 0 } });

  // Members: owner as OWNER, plus any selected as MEMBER.
  const memberIds = new Set(input.memberClerkUserIds ?? []);
  if (owner) memberIds.delete(owner);
  await db.projectMember.createMany({
    data: [
      ...(owner ? [{ projectId: project.id, clerkUserId: owner, role: "OWNER" as never }] : []),
      ...Array.from(memberIds).map((uid) => ({ projectId: project.id, clerkUserId: uid, role: "MEMBER" as never })),
    ],
    skipDuplicates: true,
  });

  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "PROJECT", entityId: project.id });
  await reindex(db, "PROJECT", project.id);
  revalidatePath("/app/projects");
  return project.id;
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string; status?: string; visibility?: string; ownerClerkUserId?: string | null; startDate?: string | null; endDate?: string | null; budget?: number | null; color?: string | null },
): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const before = await db.project.findUnique({ where: { id } });
  if (!before) throw new Error("Project not found.");

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.status !== undefined) data.status = input.status as never;
  if (input.visibility !== undefined) data.visibility = input.visibility as never;
  if (input.ownerClerkUserId !== undefined) data.ownerClerkUserId = input.ownerClerkUserId || null;
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.budget !== undefined) data.budget = input.budget;
  if (input.color !== undefined) data.color = input.color || null;

  await db.project.update({ where: { id }, data });

  const changedFields = Object.keys(data);
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "PROJECT", entityId: id, changedFields });
  if (input.status !== undefined && input.status !== before.status) {
    await dispatchAutomation({ type: "PROJECT_STATUS_CHANGED", entityType: "PROJECT", entityId: id, changedFields: ["status"] });
  }
  await reindex(db, "PROJECT", id);
  revalidatePath("/app/projects");
  revalidatePath(`/app/projects/${id}`);
}

export async function deleteProject(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.project.delete({ where: { id } });
  await removeFromIndex(db, "PROJECT", id);
  revalidatePath("/app/projects");
}

export async function addProjectMember(projectId: string, clerkUserId: string, role: string = "MEMBER"): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.projectMember.upsert({
    where: { projectId_clerkUserId: { projectId, clerkUserId } },
    create: { projectId, clerkUserId, role: role as never },
    update: { role: role as never },
  });
  revalidatePath(`/app/projects/${projectId}`);
}

export async function removeProjectMember(projectId: string, clerkUserId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.projectMember.deleteMany({ where: { projectId, clerkUserId } });
  revalidatePath(`/app/projects/${projectId}`);
}

export async function createTaskList(projectId: string | null, name: string): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const count = await db.taskList.count({ where: { projectId } });
  const list = await db.taskList.create({ data: { projectId, name: name.trim() || "List", sortOrder: count } });
  if (projectId) revalidatePath(`/app/projects/${projectId}`);
  return list.id;
}

/* ------------------------------------ Tasks ------------------------------------ */

export async function createTask(input: {
  title: string;
  projectId?: string | null;
  listId?: string | null;
  parentTaskId?: string | null;
  description?: string;
  status?: string;
  priority?: string;
  assigneeClerkUserId?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  estimatedMinutes?: number | null;
}): Promise<string> {
  await requirePermission("record:create");
  const title = input.title?.trim();
  if (!title) throw new Error("Task title is required.");
  const { db } = getTenantDb();
  const reporter = currentUserId();

  const task = await db.task.create({
    data: {
      title,
      projectId: input.projectId ?? null,
      listId: input.listId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      description: input.description?.trim() || null,
      status: (input.status ?? "TODO") as never,
      priority: (input.priority ?? "NORMAL") as never,
      assigneeClerkUserId: input.assigneeClerkUserId ?? null,
      reporterClerkUserId: reporter,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      estimatedMinutes: input.estimatedMinutes ?? null,
    },
  });

  if (task.assigneeClerkUserId && task.assigneeClerkUserId !== reporter) {
    await notify(task.assigneeClerkUserId, {
      type: "TASK_ASSIGNED",
      title: `Assigned: ${title}`,
      linkUrl: input.projectId ? `/app/projects/${input.projectId}?task=${task.id}` : `/app/tasks?task=${task.id}`,
    });
  }

  await dispatchAutomation({ type: "TASK_CREATED", entityType: "TASK", entityId: task.id });
  await reindex(db, "TASK", task.id);
  revalidatePathsForTask(input.projectId ?? null);
  return task.id;
}

export async function updateTask(
  id: string,
  input: Partial<{
    title: string;
    description: string | null;
    status: string;
    priority: string;
    assigneeClerkUserId: string | null;
    reporterClerkUserId: string | null;
    projectId: string | null;
    listId: string | null;
    parentTaskId: string | null;
    dueAt: string | null;
    startAt: string | null;
    estimatedMinutes: number | null;
    actualMinutes: number;
    progressPct: number;
    sortOrder: number;
  }>,
): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const before = await db.task.findUnique({ where: { id } });
  if (!before) throw new Error("Task not found.");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.status !== undefined) {
    data.status = input.status as never;
    if (input.status === "DONE" && before.status !== "DONE") {
      data.completedAt = new Date();
      if (input.progressPct === undefined) data.progressPct = 100;
    } else if (input.status !== "DONE" && before.status === "DONE") {
      data.completedAt = null;
    }
  }
  if (input.priority !== undefined) data.priority = input.priority as never;
  if (input.assigneeClerkUserId !== undefined) data.assigneeClerkUserId = input.assigneeClerkUserId;
  if (input.reporterClerkUserId !== undefined) data.reporterClerkUserId = input.reporterClerkUserId;
  if (input.projectId !== undefined) data.projectId = input.projectId;
  if (input.listId !== undefined) data.listId = input.listId;
  if (input.parentTaskId !== undefined) data.parentTaskId = input.parentTaskId;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.startAt !== undefined) data.startAt = input.startAt ? new Date(input.startAt) : null;
  if (input.estimatedMinutes !== undefined) data.estimatedMinutes = input.estimatedMinutes;
  if (input.actualMinutes !== undefined) data.actualMinutes = input.actualMinutes;
  if (input.progressPct !== undefined) data.progressPct = Math.max(0, Math.min(100, input.progressPct));
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  const after = await db.task.update({ where: { id }, data });
  const changedFields = Object.keys(data);

  // Notify newly assigned user.
  if (input.assigneeClerkUserId !== undefined && input.assigneeClerkUserId && input.assigneeClerkUserId !== before.assigneeClerkUserId) {
    await notify(input.assigneeClerkUserId, {
      type: "TASK_ASSIGNED",
      title: `Assigned: ${after.title}`,
      linkUrl: after.projectId ? `/app/projects/${after.projectId}?task=${id}` : `/app/tasks?task=${id}`,
    });
  }

  // Notify reporter on status change.
  if (input.status !== undefined && input.status !== before.status) {
    if (before.reporterClerkUserId && before.reporterClerkUserId !== currentUserId()) {
      await notify(before.reporterClerkUserId, {
        type: "SYSTEM",
        title: `Task "${after.title}" is now ${input.status}`,
        linkUrl: after.projectId ? `/app/projects/${after.projectId}?task=${id}` : `/app/tasks?task=${id}`,
      });
    }
    await dispatchAutomation({ type: "TASK_STATUS_CHANGED", entityType: "TASK", entityId: id, changedFields: ["status"] });
  }

  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "TASK", entityId: id, changedFields });
  await reindex(db, "TASK", id);
  revalidatePathsForTask(after.projectId);
}

/** Soft-delete a task (sets deletedAt). */
export async function deleteTask(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  const task = await db.task.update({ where: { id }, data: { deletedAt: new Date() } });
  await removeFromIndex(db, "TASK", id);
  revalidatePathsForTask(task.projectId);
}

/* -------------------------------- Dependencies --------------------------------- */

export async function addDependency(predecessorTaskId: string, successorTaskId: string, type: string = "FINISH_TO_START"): Promise<void> {
  await requirePermission("record:update");
  if (predecessorTaskId === successorTaskId) throw new Error("A task cannot depend on itself.");
  const { db } = getTenantDb();
  await db.taskDependency.upsert({
    where: { predecessorTaskId_successorTaskId: { predecessorTaskId, successorTaskId } },
    create: { predecessorTaskId, successorTaskId, type: type as never },
    update: { type: type as never },
  });
  const succ = await db.task.findUnique({ where: { id: successorTaskId }, select: { projectId: true } });
  revalidatePathsForTask(succ?.projectId ?? null);
}

export async function removeDependency(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.taskDependency.delete({ where: { id } });
  revalidatePath("/app/projects", "layout");
}

/* ---------------------------------- Checklists --------------------------------- */

export async function addChecklist(taskId: string, title: string): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const count = await db.checklist.count({ where: { taskId } });
  const c = await db.checklist.create({ data: { taskId, title: title.trim() || "Checklist", sortOrder: count } });
  return c.id;
}

export async function addChecklistItem(checklistId: string, title: string): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const count = await db.checklistItem.count({ where: { checklistId } });
  const i = await db.checklistItem.create({ data: { checklistId, title: title.trim() || "Item", sortOrder: count } });
  return i.id;
}

export async function toggleChecklistItem(id: string, done: boolean): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.checklistItem.update({
    where: { id },
    data: { done, completedAt: done ? new Date() : null, completedByClerkUserId: done ? currentUserId() : null },
  });
}

export async function deleteChecklistItem(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.checklistItem.delete({ where: { id } });
}

/* ----------------------------------- Comments ---------------------------------- */

export async function addTaskComment(taskId: string, body: string, mentions: string[] = []): Promise<string> {
  await requirePermission("record:update");
  const text = body?.trim();
  if (!text) throw new Error("Comment body is required.");
  const { db } = getTenantDb();
  const me = currentUserId();
  const comment = await db.taskComment.create({ data: { taskId, clerkUserId: me ?? "system", body: text, mentions: mentions as never } });

  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true, projectId: true, reporterClerkUserId: true, assigneeClerkUserId: true } });
  const link = task?.projectId ? `/app/projects/${task.projectId}?task=${taskId}` : `/app/tasks?task=${taskId}`;

  for (const uid of new Set(mentions)) {
    if (uid && uid !== me) {
      await notify(uid, { type: "TASK_MENTIONED", title: `Mentioned in "${task?.title ?? "a task"}"`, body: text.slice(0, 140), linkUrl: link });
    }
  }
  // Notify assignee/reporter (other than commenter) that a comment landed.
  for (const uid of new Set([task?.assigneeClerkUserId, task?.reporterClerkUserId])) {
    if (uid && uid !== me && !mentions.includes(uid)) {
      await notify(uid, { type: "TASK_COMMENTED", title: `New comment on "${task?.title ?? "a task"}"`, body: text.slice(0, 140), linkUrl: link });
    }
  }

  await reindex(db, "TASK_COMMENT", comment.id);
  if (task?.projectId) revalidatePath(`/app/projects/${task.projectId}`);
  return comment.id;
}

/* --------------------------------- Time entries -------------------------------- */

export async function startTimer(taskId: string | null, projectId: string | null, description?: string): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const me = currentUserId() ?? "system";
  const te = await db.timeEntry.create({
    data: { taskId, projectId, clerkUserId: me, description: description?.trim() || null, startedAt: new Date() },
  });
  return te.id;
}

export async function stopTimer(timeEntryId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const te = await db.timeEntry.findUnique({ where: { id: timeEntryId } });
  if (!te) return;
  const endedAt = new Date();
  const minutes = Math.max(0, Math.round((endedAt.getTime() - te.startedAt.getTime()) / 60_000));
  await db.timeEntry.update({ where: { id: timeEntryId }, data: { endedAt, durationMinutes: minutes } });
  if (te.taskId) {
    const agg = await db.timeEntry.aggregate({ where: { taskId: te.taskId }, _sum: { durationMinutes: true } });
    await db.task.update({ where: { id: te.taskId }, data: { actualMinutes: agg._sum.durationMinutes ?? 0 } });
    const t = await db.task.findUnique({ where: { id: te.taskId }, select: { projectId: true } });
    revalidatePathsForTask(t?.projectId ?? null);
  }
}

export async function logTime(input: { taskId: string | null; projectId: string | null; durationMinutes: number; description?: string; billable?: boolean; startedAt?: string }): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const me = currentUserId() ?? "system";
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  const te = await db.timeEntry.create({
    data: {
      taskId: input.taskId,
      projectId: input.projectId,
      clerkUserId: me,
      description: input.description?.trim() || null,
      startedAt,
      endedAt: new Date(startedAt.getTime() + input.durationMinutes * 60_000),
      durationMinutes: Math.max(0, Math.round(input.durationMinutes)),
      billable: input.billable ?? false,
    },
  });
  if (input.taskId) {
    const agg = await db.timeEntry.aggregate({ where: { taskId: input.taskId }, _sum: { durationMinutes: true } });
    await db.task.update({ where: { id: input.taskId }, data: { actualMinutes: agg._sum.durationMinutes ?? 0 } });
  }
  revalidatePathsForTask(input.projectId);
  return te.id;
}

/* --------------------------------- Attachments --------------------------------- */

export async function attachFileToTask(taskId: string, fileId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.taskAttachment.create({ data: { taskId, fileId, attachedByClerkUserId: currentUserId() } });
  const t = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  revalidatePathsForTask(t?.projectId ?? null);
}

/* ----------------------------------- helpers ----------------------------------- */

function revalidatePathsForTask(projectId: string | null): void {
  revalidatePath("/app/tasks");
  if (projectId) revalidatePath(`/app/projects/${projectId}`);
}
