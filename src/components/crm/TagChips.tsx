"use client";

/*
 * TagChips - render a row of tag chips for a record (used in list views and the
 * RecordPane Details tab). Read-only. Uses each tag's color at low alpha for
 * the background, full color for the text, matching the StatusBadge pattern.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { TagRow } from "@/lib/crm/record";

export function TagChips({ tags }: { tags: TagRow[] }) {
  if (!tags || tags.length === 0) {
    return <span style={{ color: "var(--kb-text-secondary)" }}>-</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: `${t.color}1a`, color: t.color, borderRadius: "var(--kb-radius-sm)" }}
        >
          {t.name}
        </span>
      ))}
    </span>
  );
}
