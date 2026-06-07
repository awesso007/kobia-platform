/*
 * Server-safe utility functions for the Documents module (Sprint 14). These are
 * imported by BOTH server components/pages and client components, so this file
 * MUST NOT carry a "use client" directive: a util exported from a client module
 * becomes a client-reference proxy in production and crashes ("(0, x.Y) is not a
 * function") when called during SSR. Keep pure helpers here; keep React
 * components in DocumentsUI.tsx.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
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

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** Split a folder path into breadcrumb segments with their cumulative paths. */
export function pathCrumbs(path: string | null | undefined): Array<{ name: string; path: string }> {
  if (!path || path === "/") return [];
  const parts = path.split("/").filter(Boolean);
  const out: Array<{ name: string; path: string }> = [];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    out.push({ name: p, path: acc });
  }
  return out;
}
