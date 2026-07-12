"use client";

/*
 * Workgroups list + create client components (Sprint 22). "use client" and
 * exports ONLY React components; pure helpers live in
 * src/lib/workgroups/workgroup-utils.ts. Interactions POST to /api/workgroups/**
 * and refresh the route so server-rendered data stays the source of truth.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { initialFromName, visibilityLabel, type WorkgroupVisibility } from "@/lib/workgroups/workgroup-utils";

export type GroupCardData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  icon: string | null;
  coverColor: string;
  memberCount: number;
  myRole?: string | null;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return res.json().catch(() => ({ ok: false }));
}

const input = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius)",
  backgroundColor: "var(--kb-bg)",
  color: "var(--kb-text-primary)",
} as const;

function GroupIcon({ group, size = 40 }: { group: GroupCardData; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center font-semibold text-white"
      style={{ width: size, height: size, borderRadius: 8, backgroundColor: group.coverColor || "#4f46e5", fontSize: size * 0.4 }}
    >
      {group.icon?.trim() ? group.icon.trim().slice(0, 2) : initialFromName(group.name)}
    </span>
  );
}

function GroupCard({ group, joined }: { group: GroupCardData; joined: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function join() {
    start(async () => {
      const res = await api(`/api/workgroups/${group.id}/join`, { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) {
        setMsg(res.error || "Could not join.");
        return;
      }
      setMsg(res.joined ? null : "Request sent.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-3 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <GroupIcon group={group} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {joined ? (
            <Link href={`/app/workgroups/${group.slug}`} className="truncate font-medium hover:underline" style={{ color: "var(--kb-text-primary)" }}>
              {group.name}
            </Link>
          ) : (
            <span className="truncate font-medium" style={{ color: "var(--kb-text-primary)" }}>{group.name}</span>
          )}
          <span className="rounded px-1 text-xs" style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>
            {visibilityLabel(group.visibility)}
          </span>
        </div>
        {group.description && <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{group.description}</p>}
        <p className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          {group.myRole ? ` - you are ${group.myRole.toLowerCase()}` : ""}
        </p>
        {msg && <p className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{msg}</p>}
      </div>
      {joined ? (
        <Link href={`/app/workgroups/${group.slug}`} className="rounded px-3 py-1 text-sm" style={input}>Open</Link>
      ) : (
        <button type="button" onClick={join} disabled={pending} className="rounded px-3 py-1 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending ? 0.6 : 1 }}>
          {group.visibility === "PUBLIC" ? "Join" : "Request"}
        </button>
      )}
    </div>
  );
}

export function WorkgroupsList({ mine, discover }: { mine: GroupCardData[]; discover: GroupCardData[] }) {
  const [tab, setTab] = useState<"mine" | "discover">(mine.length > 0 ? "mine" : "discover");
  const list = tab === "mine" ? mine : discover;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2 text-sm">
          {(["mine", "discover"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded px-3 py-1"
              style={{
                border: "1px solid var(--kb-border)",
                borderRadius: "var(--kb-radius)",
                backgroundColor: tab === t ? "var(--kb-bg-hover, #eef2ff)" : "transparent",
                color: tab === t ? "var(--kb-text-primary)" : "var(--kb-text-secondary)",
              }}
            >
              {t === "mine" ? "My groups" : "Discover"}
            </button>
          ))}
        </div>
        <Link href="/app/workgroups/new" className="rounded px-3 py-1 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff" }}>
          New group
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {tab === "mine" ? "You have not joined any groups yet." : "No groups to discover."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((g) => (
            <GroupCard key={g.id} group={g} joined={tab === "mine"} />
          ))}
        </div>
      )}
    </div>
  );
}

const VIS: WorkgroupVisibility[] = ["PUBLIC", "PRIVATE", "SECRET"];

export function NewGroupForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<WorkgroupVisibility>("PUBLIC");
  const [icon, setIcon] = useState("");
  const [coverColor, setCoverColor] = useState("#4f46e5");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    start(async () => {
      const res = await api("/api/workgroups", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, visibility, icon: icon.trim() || null, coverColor }),
      });
      if (!res.ok) {
        setError(res.error || "Could not create group.");
        return;
      }
      router.push(res.slug ? `/app/workgroups/${res.slug}` : "/app/workgroups");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="p-2 text-sm" style={input} />

      <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group about?" rows={3} className="p-2 text-sm" style={input} />

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as WorkgroupVisibility)} className="p-2 text-sm" style={input}>
            {VIS.map((v) => <option key={v} value={v}>{visibilityLabel(v)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Icon (1-2 chars)</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} placeholder="P" className="w-20 p-2 text-sm" style={input} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Cover color</label>
          <input type="color" value={coverColor} onChange={(e) => setCoverColor(e.target.value)} className="h-9 w-16 p-1" style={input} />
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--kb-danger, #dc2626)" }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <Link href="/app/workgroups" className="rounded px-3 py-2 text-sm" style={input}>Cancel</Link>
        <button type="button" onClick={submit} disabled={pending} className="rounded px-4 py-2 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Creating..." : "Create group"}
        </button>
      </div>
    </div>
  );
}
