/*
 * mail-utils.ts (Sprint 23) - pure, client-safe helpers for the Webmail UI.
 * NO "use client" and NO server-only imports, so both server pages and client
 * components can import these.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type ParsedAddress = { name: string; email: string };

/** Relative time like "just now", "5m", "3h", "2d", else a short date. */
export function fmtRelativeTime(input: Date | string | number | null | undefined): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return fmtDate(d);
}

/** Short, locale-independent date like "Jul 12" or "Jul 12, 2025". */
export function fmtDate(input: Date | string | number | null | undefined): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const base = `${months[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/**
 * Parse an address header. Accepts a raw string (comma separated) or an array
 * of strings, and returns {name, email}[]. Handles `"Alice" <a@x.com>`,
 * `Alice <a@x.com>`, and bare `a@x.com`.
 */
export function formatAddresses(input: string | string[] | null | undefined): ParsedAddress[] {
  if (!input) return [];
  const parts = Array.isArray(input) ? input : splitAddressList(input);
  const out: ParsedAddress[] = [];
  for (const raw of parts) {
    const s = String(raw).trim();
    if (!s) continue;
    const m = s.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>]+?)\s*>\s*$/);
    if (m) {
      const email = (m[2] ?? "").trim();
      const name = (m[1] ?? "").trim() || email;
      out.push({ name, email });
    } else {
      out.push({ name: s, email: s });
    }
  }
  return out;
}

/** Split a comma-separated address list, ignoring commas inside quotes. */
function splitAddressList(s: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of s) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === "," && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) result.push(cur);
  return result;
}

/** Display name for a single address string (first parsed name). */
export function displayNameOf(input: string | null | undefined): string {
  const [first] = formatAddresses(input ?? "");
  return first?.name ?? "";
}

/**
 * Sanitize an HTML email body for rendering. Regex-based (no npm dependency):
 * strips <script>/<style>/<iframe>/<object> blocks and any on* event handlers
 * and javascript: URLs, keeping basic formatting tags. Not a substitute for a
 * full sanitizer, but safe enough to render trusted-ish mailbox content.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = html;
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "");
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  return out;
}
