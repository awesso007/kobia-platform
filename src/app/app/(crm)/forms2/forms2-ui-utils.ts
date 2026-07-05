/*
 * Pure formatters and helpers for the Forms 2.0 admin UI (Sprint 19). No
 * "use client" so both server and client components import freely.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusColor(status: string): string {
  switch (status) {
    case "PUBLISHED":
    case "COMPLETED":
    case "PAID":
      return "#059669";
    case "DRAFT":
    case "PENDING":
      return "#d97706";
    case "FAILED":
      return "#dc2626";
    case "ARCHIVED":
      return "#9ca3af";
    default:
      return "#6b7280";
  }
}
