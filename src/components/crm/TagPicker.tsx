"use client";

/*
 * TagPicker - multi-select tag chooser used on create + edit forms for every
 * CRM entity. Controlled: parent owns the selected tag id list. Clicking a tag
 * toggles it. Shows a hint when the tenant has no tags yet.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { TagRow } from "@/lib/crm/record";

export function TagPicker({
  all,
  selected,
  onChange,
}: {
  all: TagRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (all.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        No tags yet. Create tags in Settings / Tags.
      </p>
    );
  }
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className="rounded px-2 py-1 text-xs font-medium"
            style={{
              borderRadius: "var(--kb-radius-sm)",
              border: `1px solid ${on ? t.color : "var(--kb-border)"}`,
              backgroundColor: on ? `${t.color}1a` : "var(--kb-surface)",
              color: on ? t.color : "var(--kb-text-secondary)",
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
