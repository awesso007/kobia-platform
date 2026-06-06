/*
 * Client-safe shared types and pure helpers for the Tasks + Projects module
 * (Sprint 11). No server-only imports here so both the builder UI and server
 * code can use it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatusKind = (typeof PROJECT_STATUSES)[number];

export const PROJECT_VISIBILITIES = ["PRIVATE", "TEAM", "TENANT"] as const;
export type ProjectVisibilityKind = (typeof PROJECT_VISIBILITIES)[number];

export const PROJECT_MEMBER_ROLES = ["OWNER", "LEAD", "MEMBER", "VIEWER"] as const;
export type ProjectMemberRoleKind = (typeof PROJECT_MEMBER_ROLES)[number];

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "CANCELED"] as const;
export type TaskStatusKind = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TaskPriorityKind = (typeof TASK_PRIORITIES)[number];

export const TASK_DEPENDENCY_TYPES = ["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"] as const;
export type TaskDependencyTypeKind = (typeof TASK_DEPENDENCY_TYPES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatusKind, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  BLOCKED: "Blocked",
  CANCELED: "Canceled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriorityKind, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatusKind, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

/** Statuses that count a task as closed for progress purposes. */
export const CLOSED_TASK_STATUSES: TaskStatusKind[] = ["DONE", "CANCELED"];

/**
 * Derive a project key from a name: uppercase, alphanumerics joined by single
 * hyphens, trimmed to a sane length. "Website Redesign!" -> "WEBSITE-REDESIGN".
 */
export function projectKeyFromName(name: string): string {
  const key = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return key || "PROJECT";
}

/**
 * Compute a project's progress percentage from its task statuses. DONE tasks
 * count fully; otherwise we average each task's progressPct. Returns 0..100.
 */
export function computeProjectProgress(
  tasks: Array<{ status: string; progressPct: number }>,
): number {
  if (tasks.length === 0) return 0;
  let total = 0;
  for (const t of tasks) {
    if (t.status === "DONE") total += 100;
    else if (t.status === "CANCELED") total += 0;
    else total += Math.max(0, Math.min(100, t.progressPct));
  }
  return Math.round(total / tasks.length);
}
