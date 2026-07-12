/*
 * Pure, client-safe feed helpers (Sprint 21). No "use client" directive and no
 * server-only imports, so both the feed UI ("use client" components) and the
 * server lib can import these. Keep this file free of React and of
 * getTenantDb/next-headers.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export const REACTION_KINDS = ["LIKE", "LOVE", "LAUGH", "WOW", "SAD", "THANKS"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_LABELS: Record<ReactionKind, string> = {
  LIKE: "Like",
  LOVE: "Love",
  LAUGH: "Haha",
  WOW: "Wow",
  SAD: "Sad",
  THANKS: "Thanks",
};

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

/**
 * Extract @mention tokens from a post/comment body. A mention is "@" followed
 * by a run of [a-z0-9_-] characters (a clerk user id or handle). Returns the
 * unique raw tokens (without the leading "@").
 */
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|\s)@([a-z0-9_-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out);
}

export type ReactionGroupInput = { kind: string; userIds: string[] };
export type ReactionSummaryRow = { kind: ReactionKind; label: string; count: number };

/**
 * Summarize reaction groups into an ordered list (by the canonical kind order),
 * dropping empties. Input is an array of {kind, userIds}.
 */
export function summarizeReactions(input: ReactionGroupInput[]): ReactionSummaryRow[] {
  const counts = new Map<string, number>();
  for (const g of input) {
    const prev = counts.get(g.kind) ?? 0;
    counts.set(g.kind, prev + g.userIds.length);
  }
  const rows: ReactionSummaryRow[] = [];
  for (const kind of REACTION_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count > 0) rows.push({ kind, label: REACTION_LABELS[kind], count });
  }
  return rows;
}

/** Total reactions across a summary. */
export function totalReactions(rows: ReactionSummaryRow[]): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

/** Truncate a body to at most `max` chars, appending an ellipsis when cut. */
export function truncateBody(body: string, max = 280): string {
  const s = body.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}...`;
}

/** Human label for a post type. */
export function postTypeLabel(type: string): string {
  switch (type) {
    case "ANNOUNCEMENT":
      return "Announcement";
    case "POLL":
      return "Poll";
    case "QUESTION":
      return "Question";
    case "EVENT_SHARE":
      return "Event";
    case "RECORD_SHARE":
      return "Shared record";
    case "SYSTEM":
      return "System";
    default:
      return "Post";
  }
}

/** Compute poll percentages from option vote counts (integer percents). */
export function pollPercentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  return counts.map((c) => Math.round((c / total) * 100));
}
