"use client";

/*
 * Workgroup settings form (Sprint 22). "use client" and exports ONLY React
 * components. OWNER/MODERATOR can edit name/description/visibility/icon/color
 * and archive the group. PATCH/DELETE hit /api/workgroups/[id].
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { visibilityLabel, type WorkgroupVisibility } from "@/lib/workgroups/workgroup-utils";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return res.json().catch(() => ({ ok: false }));
}

const input = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", backgroundColor: "var(--kb-bg)", color: "var(--kb-text-primary)" } as const;
const VIS: WorkgroupVisibility[] = ["PUBLIC", "PRIVATE", "SECRET"];

export function SettingsForm({
  group,
}: {
  group: { id: string; name: string; description: string | null; visibility: string; icon: string | null; coverColor: string; status: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [visibility, setVisibility] = useState<WorkgroupVisibility>(group.visibility as WorkgroupVisibility);
  const [icon, setIcon] = useState(group.icon ?? "");
  const [coverColor, setCoverColor] = useState(group.coverColor || "#4f46e5");
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    start(async () => {
      const res = await api(`/api/workgroups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, visibility, icon: icon.trim() || null, coverColor }),
      });
      setMsg(res.ok ? "Saved." : res.error || "Could not save.");
      router.refresh();
    });
  }

  function archive() {
    if (!confirm("Archive this group? It will be hidden from discovery.")) return;
    start(async () => {
      await api(`/api/workgroups/${group.id}`, { method: "DELETE" });
      router.push("/app/workgroups");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className="p-2 text-sm" style={input} />

      <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="p-2 text-sm" style={input} />

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as WorkgroupVisibility)} className="p-2 text-sm" style={input}>
            {VIS.map((v) => <option key={v} value={v}>{visibilityLabel(v)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Icon</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} className="w-20 p-2 text-sm" style={input} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Cover color</label>
          <input type="color" value={coverColor} onChange={(e) => setCoverColor(e.target.value)} className="h-9 w-16 p-1" style={input} />
        </div>
      </div>

      {msg && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>{msg}</p>}

      <div className="flex items-center justify-between">
        <button type="button" onClick={save} disabled={pending} className="rounded px-4 py-2 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Saving..." : "Save changes"}
        </button>
        {group.status !== "ARCHIVED" && (
          <button type="button" onClick={archive} disabled={pending} className="rounded px-4 py-2 text-sm" style={{ ...input, color: "var(--kb-danger, #dc2626)" }}>
            Archive group
          </button>
        )}
      </div>
    </div>
  );
}
