/*
 * Pure, client-safe chat helpers (Sprint 16). No "use client" directive and no
 * server-only imports, so both the chat UI ("use client" components) and the
 * server lib can import these without turning them into client-reference
 * proxies. Keep this file free of React and of getTenantDb/next-headers.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

/** A DM channel slug is derived from the two member ids, sorted + joined. */
export function dmSlug(userIdA: string, userIdB: string): string {
  const [a, b] = [userIdA, userIdB].sort();
  return `dm-${a}-${b}`;
}

/** Slugify a channel name to a url-safe handle (lowercase, hyphenated). */
export function channelSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "channel";
}

/** True if the channel has unread messages for a member given their lastReadAt. */
export function isUnread(lastMessageAt: Date | string | null | undefined, lastReadAt: Date | string | null | undefined): boolean {
  if (!lastMessageAt) return false;
  if (!lastReadAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(lastReadAt).getTime();
}

/** Short relative time label ("just now", "5m", "3h", "2d", or a date). */
export function fmtRelativeTime(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now.getTime() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(value).toLocaleDateString();
}

/** Clock time label for a message row (HH:MM, local). */
export function fmtClock(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Extract @mention tokens from message body. A mention is "@" followed by a
 * run of word characters (a clerk user id, or a handle). Returns the unique
 * raw tokens (without the leading "@").
 */
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|\s)@([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out);
}

/** Default DM display name from the other member's name/email, or a fallback. */
export function dmDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  return (name && name.trim()) || (email && email.trim()) || "Direct message";
}

/** Sum unread counts into a single badge number, capped for display ("99+"). */
export function unreadBadge(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}
