"use client";

/*
 * Sticky bottom bar shown when one or more list rows are selected. Offers
 * Delete, Add tag, Remove tag, Change owner, and Export CSV across the selected
 * ids for a single entity type. All mutations call the shared bulk server
 * actions; CSV export turns the returned string into a client download.
 *
 * Mount this once per list view, passing the selected id set + the entity type.
 * No em-dashes in copy (use hyphens).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Tag, Trash2, UserCog, X } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { TagRow } from "@/lib/crm/record";
import {
  bulkAddTag,
  bulkChangeOwner,
  bulkDelete,
  bulkExportCsv,
  bulkRemoveTag,
} from "@/app/app/(crm)/bulk/actions";

type Entity = "LEAD" | "DEAL" | "CONTACT" | "COMPANY";

export function BulkActionBar({
  entityType,
  ids,
  allTags,
  owners,
  onClear,
}: {
  entityType: Entity;
  ids: string[];
  allTags: TagRow[];
  owners: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState<null | "addTag" | "removeTag" | "owner">(null);

  if (ids.length === 0) return null;
  const count = ids.length;

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      setMenu(null);
      onClear();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!window.confirm(`Delete ${count} ${count === 1 ? "record" : "records"}? This cannot be undone.`)) return;
    run(() => bulkDelete({ entityType, ids }));
  }

  function exportCsv() {
    startTransition(async () => {
      const csv = await bulkExportCsv({ entityType, ids });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entityType.toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 px-4 py-3 sm:left-auto sm:right-4 sm:bottom-4 sm:rounded"
      style={{
        backgroundColor: "var(--kb-surface)",
        border: "1px solid var(--kb-border)",
        borderRadius: "var(--kb-radius)",
        boxShadow: "var(--kb-shadow-modal)",
      }}
    >
      <span style={{ color: "var(--kb-text-primary)", fontWeight: 600 }}>
        {count} selected
      </span>

      <div className="relative">
        <KbButton variant="outline" disabled={pending} onClick={() => setMenu(menu === "addTag" ? null : "addTag")}>
          <Tag size={14} /> Add tag
        </KbButton>
        {menu === "addTag" ? (
          <TagMenu tags={allTags} onPick={(tagId) => run(() => bulkAddTag({ entityType, ids, tagId }))} />
        ) : null}
      </div>

      <div className="relative">
        <KbButton variant="outline" disabled={pending} onClick={() => setMenu(menu === "removeTag" ? null : "removeTag")}>
          <Tag size={14} /> Remove tag
        </KbButton>
        {menu === "removeTag" ? (
          <TagMenu tags={allTags} onPick={(tagId) => run(() => bulkRemoveTag({ entityType, ids, tagId }))} />
        ) : null}
      </div>

      <div className="relative">
        <KbButton variant="outline" disabled={pending} onClick={() => setMenu(menu === "owner" ? null : "owner")}>
          <UserCog size={14} /> Change owner
        </KbButton>
        {menu === "owner" ? (
          <OwnerMenu owners={owners} onPick={(ownerUserId) => run(() => bulkChangeOwner({ entityType, ids, ownerUserId }))} />
        ) : null}
      </div>

      <KbButton variant="outline" disabled={pending} onClick={exportCsv}>
        <Download size={14} /> Export CSV
      </KbButton>

      <KbButton variant="outline" disabled={pending} onClick={confirmDelete}>
        <Trash2 size={14} /> Delete
      </KbButton>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="grid h-9 w-9 place-items-center rounded"
        style={{ color: "var(--kb-text-secondary)" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function MenuShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-1 max-h-64 w-56 overflow-auto rounded p-1"
      style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", boxShadow: "var(--kb-shadow-card)" }}
    >
      {children}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:opacity-80"
      style={{ color: "var(--kb-text-primary)", minHeight: 36 }}
    >
      {children}
    </button>
  );
}

function TagMenu({ tags, onPick }: { tags: TagRow[]; onPick: (tagId: string) => void }) {
  return (
    <MenuShell>
      {tags.length === 0 ? (
        <p className="px-2 py-1.5 text-xs" style={{ color: "var(--kb-text-secondary)" }}>No tags.</p>
      ) : (
        tags.map((t) => (
          <MenuItem key={t.id} onClick={() => onPick(t.id)}>
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
            {t.name}
          </MenuItem>
        ))
      )}
    </MenuShell>
  );
}

function OwnerMenu({ owners, onPick }: { owners: string[]; onPick: (ownerUserId: string | null) => void }) {
  return (
    <MenuShell>
      <MenuItem onClick={() => onPick(null)}>
        <span style={{ color: "var(--kb-text-secondary)" }}>Unassign</span>
      </MenuItem>
      {owners.map((o) => (
        <MenuItem key={o} onClick={() => onPick(o)}>{o}</MenuItem>
      ))}
    </MenuShell>
  );
}
