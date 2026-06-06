/*
 * Project + Task query helpers (server-only). All reads go through
 * getTenantDb(). Returns plain serializable shapes for the client components.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { computeProjectProgress } from "./shared";

export type ProjectListRow = {
  id: string;
  key: string;
  name: string;
  status: string;
  visibility: string;
  ownerClerkUserId: string | null;
  startDate: string | null;
  endDate: string | null;
  color: string | null;
  progressPct: number;
  memberCount: number;
  taskCount: number;
};

export type ProjectMemberRow = {
  clerkUserId: string;
  role: string;
  displayName: string | null;
  email: string | null;
};

export type TaskRow = {
  id: string;
  projectId: string | null;
  listId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeClerkUserId: string | null;
  reporterClerkUserId: string | null;
  dueAt: string | null;
  startAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number;
  progressPct: number;
  sortOrder: number;
  completedAt: string | null;
  subtaskCount: number;
  commentCount: number;
};

export type TaskListRow = { id: string; name: string; sortOrder: number; color: string | null; isDefault: boolean };

export type ProjectDetail = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  ownerClerkUserId: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  color: string | null;
  progressPct: number;
  members: ProjectMemberRow[];
  lists: TaskListRow[];
  tasks: TaskRow[];
  dependencies: Array<{ id: string; predecessorTaskId: string; successorTaskId: string; type: string; lagMinutes: number }>;
  timeEntries: Array<{ id: string; clerkUserId: string; description: string | null; startedAt: string; endedAt: string | null; durationMinutes: number; billable: boolean }>;
};

function memberMap(members: Array<{ clerkUserId: string; displayName: string | null; email: string | null }>) {
  const m = new Map<string, { displayName: string | null; email: string | null }>();
  for (const x of members) m.set(x.clerkUserId, { displayName: x.displayName, email: x.email });
  return m;
}

/** All tenant members, used to resolve owner/assignee display names. */
export async function getMembersLite(): Promise<Array<{ clerkUserId: string; displayName: string | null; email: string | null }>> {
  const { db } = getTenantDb();
  const rows = await db.membership.findMany({ select: { clerkUserId: true, displayName: true, email: true } });
  return rows;
}

export async function listProjects(): Promise<ProjectListRow[]> {
  const { db } = getTenantDb();
  const projects = await db.project.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { members: true, tasks: true } },
      tasks: { where: { deletedAt: null }, select: { status: true, progressPct: true } },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    status: p.status,
    visibility: p.visibility,
    ownerClerkUserId: p.ownerClerkUserId,
    startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
    endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
    color: p.color,
    progressPct: computeProjectProgress(p.tasks),
    memberCount: p._count.members,
    taskCount: p._count.tasks,
  }));
}

export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  const { db } = getTenantDb();
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return null;

  const [memberRows, lists, tasks, deps, timeEntries, members] = await Promise.all([
    db.projectMember.findMany({ where: { projectId: id } }),
    db.taskList.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
    db.task.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { subtasks: true, comments: true } } },
    }),
    db.taskDependency.findMany({
      where: { OR: [{ predecessor: { projectId: id } }, { successor: { projectId: id } }] },
    }),
    db.timeEntry.findMany({
      where: { OR: [{ projectId: id }, { task: { projectId: id } }] },
      orderBy: { startedAt: "desc" },
    }),
    getMembersLite(),
  ]);

  const mm = memberMap(members);
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    status: project.status,
    visibility: project.visibility,
    ownerClerkUserId: project.ownerClerkUserId,
    startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
    endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : null,
    budget: project.budget == null ? null : Number(project.budget),
    color: project.color,
    progressPct: computeProjectProgress(tasks),
    members: memberRows.map((m) => ({
      clerkUserId: m.clerkUserId,
      role: m.role,
      displayName: mm.get(m.clerkUserId)?.displayName ?? null,
      email: mm.get(m.clerkUserId)?.email ?? null,
    })),
    lists: lists.map((l) => ({ id: l.id, name: l.name, sortOrder: l.sortOrder, color: l.color, isDefault: l.isDefault })),
    tasks: tasks.map(serializeTask),
    dependencies: deps.map((d) => ({
      id: d.id,
      predecessorTaskId: d.predecessorTaskId,
      successorTaskId: d.successorTaskId,
      type: d.type,
      lagMinutes: d.lagMinutes,
    })),
    timeEntries: timeEntries.map((te) => ({
      id: te.id,
      clerkUserId: te.clerkUserId,
      description: te.description,
      startedAt: te.startedAt.toISOString(),
      endedAt: te.endedAt ? te.endedAt.toISOString() : null,
      durationMinutes: te.durationMinutes,
      billable: te.billable,
    })),
  };
}

type RawTask = {
  id: string;
  projectId: string | null;
  listId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeClerkUserId: string | null;
  reporterClerkUserId: string | null;
  dueAt: Date | null;
  startAt: Date | null;
  estimatedMinutes: number | null;
  actualMinutes: number;
  progressPct: number;
  sortOrder: number;
  completedAt: Date | null;
  _count?: { subtasks: number; comments: number };
};

function serializeTask(t: RawTask): TaskRow {
  return {
    id: t.id,
    projectId: t.projectId,
    listId: t.listId,
    parentTaskId: t.parentTaskId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeClerkUserId: t.assigneeClerkUserId,
    reporterClerkUserId: t.reporterClerkUserId,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    startAt: t.startAt ? t.startAt.toISOString() : null,
    estimatedMinutes: t.estimatedMinutes,
    actualMinutes: t.actualMinutes,
    progressPct: t.progressPct,
    sortOrder: t.sortOrder,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    subtaskCount: t._count?.subtasks ?? 0,
    commentCount: t._count?.comments ?? 0,
  };
}

/** Tasks assigned to a user across all projects + their personal tasks. */
export async function getMyTasks(clerkUserId: string): Promise<TaskRow[]> {
  const { db } = getTenantDb();
  const tasks = await db.task.findMany({
    where: {
      deletedAt: null,
      OR: [{ assigneeClerkUserId: clerkUserId }, { projectId: null, reporterClerkUserId: clerkUserId }],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { subtasks: true, comments: true } } },
  });
  return tasks.map(serializeTask);
}

export type TaskFullDetail = TaskRow & {
  checklists: Array<{ id: string; title: string; sortOrder: number; items: Array<{ id: string; title: string; done: boolean; sortOrder: number }> }>;
  comments: Array<{ id: string; clerkUserId: string; body: string; mentions: string[]; createdAt: string; authorName: string | null }>;
  attachments: Array<{ id: string; fileId: string; name: string | null; createdAt: string }>;
  timeEntries: Array<{ id: string; clerkUserId: string; description: string | null; startedAt: string; endedAt: string | null; durationMinutes: number; billable: boolean }>;
  predecessors: Array<{ id: string; predecessorTaskId: string; type: string; lagMinutes: number }>;
  successors: Array<{ id: string; successorTaskId: string; type: string; lagMinutes: number }>;
};

export async function getTaskDetail(id: string): Promise<TaskFullDetail | null> {
  const { db } = getTenantDb();
  const task = await db.task.findUnique({
    where: { id },
    include: {
      _count: { select: { subtasks: true, comments: true } },
      checklists: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
      comments: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      timeEntries: { orderBy: { startedAt: "desc" } },
      predecessors: true,
      successors: true,
    },
  });
  if (!task) return null;

  const members = await getMembersLite();
  const mm = memberMap(members);

  const fileIds = task.attachments.map((a) => a.fileId);
  const files = fileIds.length
    ? await db.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, name: true } })
    : [];
  const fileName = new Map(files.map((f) => [f.id, f.name]));

  return {
    ...serializeTask(task),
    checklists: task.checklists.map((c) => ({
      id: c.id,
      title: c.title,
      sortOrder: c.sortOrder,
      items: c.items.map((i) => ({ id: i.id, title: i.title, done: i.done, sortOrder: i.sortOrder })),
    })),
    comments: task.comments.map((c) => ({
      id: c.id,
      clerkUserId: c.clerkUserId,
      body: c.body,
      mentions: Array.isArray(c.mentions) ? (c.mentions as string[]) : [],
      createdAt: c.createdAt.toISOString(),
      authorName: mm.get(c.clerkUserId)?.displayName ?? mm.get(c.clerkUserId)?.email ?? null,
    })),
    attachments: task.attachments.map((a) => ({
      id: a.id,
      fileId: a.fileId,
      name: fileName.get(a.fileId) ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    timeEntries: task.timeEntries.map((te) => ({
      id: te.id,
      clerkUserId: te.clerkUserId,
      description: te.description,
      startedAt: te.startedAt.toISOString(),
      endedAt: te.endedAt ? te.endedAt.toISOString() : null,
      durationMinutes: te.durationMinutes,
      billable: te.billable,
    })),
    predecessors: task.predecessors.map((d) => ({ id: d.id, predecessorTaskId: d.predecessorTaskId, type: d.type, lagMinutes: d.lagMinutes })),
    successors: task.successors.map((d) => ({ id: d.id, successorTaskId: d.successorTaskId, type: d.type, lagMinutes: d.lagMinutes })),
  };
}
