"use client";

/*
 * Tag management UI: list tenant tags with their usage count, a create form,
 * inline edit of name + color, and delete with confirmation. Color is a hex
 * string edited through a native color input.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { TagRow } from "@/lib/crm/record";
import { createTag, updateTag, deleteTag } from "./actions";

type TagWithUsage = TagRow & { usage: number };

const DEFAULT_COLOR = "#1d77bd";

export function TagsManager({ tags }: { tags: TagWithUsage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [editing, setEditing] = useState<TagWithUsage | null>(null);

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createTag({ name, color });
      setName("");
      setColor(DEFAULT_COLOR);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Tag name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="e.g. Hot"
            className="rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 200 }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Color</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded" style={{ border: "1px solid var(--kb-border)" }} />
        </label>
        <KbButton onClick={add} disabled={pending || !name.trim()}><Plus size={16} /> Add tag</KbButton>
      </div>

      <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        {tags.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No tags yet. Create one above.</div>
        ) : (
          tags.map((t) => (
            <TagRowItem key={t.id} tag={t} onEdit={() => setEditing(t)} />
          ))
        )}
      </div>

      {editing ? <EditModal tag={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function TagRowItem({ tag, onEdit }: { tag: TagWithUsage; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    const msg = tag.usage > 0
      ? `Delete "${tag.name}"? It is applied to ${tag.usage} record${tag.usage === 1 ? "" : "s"} and will be removed from them.`
      : `Delete "${tag.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await deleteTag(tag.id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 px-3" style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
      <span className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-medium" style={{ backgroundColor: `${tag.color}1a`, color: tag.color, borderRadius: "var(--kb-radius-sm)" }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
        {tag.name}
      </span>
      <span className="flex-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        {tag.usage} record{tag.usage === 1 ? "" : "s"}
      </span>
      <button type="button" onClick={onEdit} style={{ color: "var(--kb-text-secondary)" }}><Pencil size={15} /></button>
      <button type="button" onClick={onDelete} disabled={pending} style={{ color: "var(--kb-error)" }}><Trash2 size={15} /></button>
    </div>
  );
}

function EditModal({ tag, onClose }: { tag: TagWithUsage; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  function save() {
    if (!name.trim()) return;
    startTransition(async () => {
      await updateTag(tag.id, { name, color });
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm p-5" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Edit tag</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Name</span>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Color</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded" style={{ border: "1px solid var(--kb-border)" }} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving..." : "Save"}</KbButton>
        </div>
      </div>
    </div>
  );
}
