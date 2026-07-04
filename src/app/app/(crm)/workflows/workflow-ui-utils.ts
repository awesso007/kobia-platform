/*
 * Pure formatters and helpers for the Workflows UI (Sprint 18). No "use client"
 * so both server and client components can import from here freely.
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

export function fmtDuration(startedAt: Date | string, completedAt: Date | string | null): string {
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const end = completedAt ? (typeof completedAt === "string" ? new Date(completedAt) : completedAt) : new Date();
  const ms = Math.max(0, end.getTime() - start.getTime());
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
    case "SUCCESS":
      return "#059669";
    case "DRAFT":
    case "WAITING":
      return "#d97706";
    case "PAUSED":
    case "SKIPPED":
      return "#6b7280";
    case "FAILED":
    case "CANCELED":
      return "#dc2626";
    case "RUNNING":
      return "#2563eb";
    case "ARCHIVED":
      return "#9ca3af";
    default:
      return "#6b7280";
  }
}
