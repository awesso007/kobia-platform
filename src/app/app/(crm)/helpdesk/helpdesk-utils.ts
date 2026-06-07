/*
 * Server-safe utility functions for the Helpdesk module (Sprint 15). Imported by
 * BOTH server pages and client components, so this file MUST NOT carry a "use
 * client" directive: a util exported from a client module becomes a
 * client-reference proxy in production and crashes ("(0, x.Y) is not a function")
 * when called during SSR. Keep pure helpers here; keep React components in
 * HelpdeskUI.tsx.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export type TicketStatus = "NEW" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact relative-ish duration between now and a target ("in 3h", "2d ago"). */
export function fmtDueIn(due: Date | string | null | undefined): string {
  if (!due) return "-";
  const target = typeof due === "string" ? new Date(due) : due;
  const ms = target.getTime() - Date.now();
  const past = ms < 0;
  const mins = Math.round(Math.abs(ms) / 60000);
  const label =
    mins < 60 ? `${mins}m` : mins < 60 * 24 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / (60 * 24))}d`;
  return past ? `${label} ago` : `in ${label}`;
}

/** True when an SLA target is in the past (used to color-flag breaches). */
export function isOverdue(due: Date | string | null | undefined): boolean {
  if (!due) return false;
  const target = typeof due === "string" ? new Date(due) : due;
  return target.getTime() < Date.now();
}

const STATUS_CLASSES: Record<TicketStatus, string> = {
  NEW: "bg-blue-100 text-blue-800",
  OPEN: "bg-amber-100 text-amber-800",
  PENDING: "bg-purple-100 text-purple-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
};

export function statusClass(status: string): string {
  return STATUS_CLASSES[status as TicketStatus] ?? "bg-slate-100 text-slate-700";
}

const PRIORITY_CLASSES: Record<TicketPriority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  NORMAL: "bg-sky-100 text-sky-700",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800",
};

export function priorityClass(priority: string): string {
  return PRIORITY_CLASSES[priority as TicketPriority] ?? "bg-slate-100 text-slate-600";
}

export const TICKET_STATUSES: TicketStatus[] = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"];
export const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

/** Strip HTML to a short plain-text preview for list rows. */
export function htmlPreview(html: string | null | undefined, max = 140): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
