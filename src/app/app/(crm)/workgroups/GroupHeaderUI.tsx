"use client";

/*
 * Workgroup header + tab nav (Sprint 22). "use client" and exports ONLY React
 * components. Renders the group identity, a Join/Leave action, and the segment
 * tab bar [Feed|Tasks|Files|Calendar|Members|Settings]. The active tab is
 * derived from the current pathname.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { canManage, initialFromName, visibilityLabel } from "@/lib/workgroups/workgroup-utils";

export type GroupHeaderData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  icon: string | null;
  coverColor: string;
  status: string;
  memberCount: number;
  myRole: string | null;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return res.json().catch(() => ({ ok: false }));
}

export function GroupHeader({ group }: { group: GroupHeaderData }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const base = `/app/workgroups/${group.slug}`;
  const isMember = Boolean(group.myRole);
  const manages = canManage(group.myRole);

  const tabs: { key: string; label: string; href: string }[] = [
    { key: "feed", label: "Feed", href: base },
    { key: "tasks", label: "Tasks", href: `${base}/tasks` },
    { key: "files", label: "Files", href: `${base}/files` },
    { key: "calendar", label: "Calendar", href: `${base}/calendar` },
    { key: "members", label: "Members", href: `${base}/members` },
    { key: "settings", label: "Settings", href: `${base}/settings` },
  ];

  function active(href: string): boolean {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  function leave() {
    if (!confirm("Leave this group?")) return;
    start(async () => {
      await api(`/api/workgroups/${group.id}/leave`, { method: "POST" });
      router.push("/app/workgroups");
      router.refresh();
    });
  }
  function join() {
    start(async () => {
      await api(`/api/workgroups/${group.id}/join`, { method: "POST", body: JSON.stringify({}) });
      router.refresh();
    });
  }

  return (
    <div className="mb-4">
      <Link href="/app/workgroups" className="mb-2 inline-block text-sm underline" style={{ color: "var(--kb-text-secondary)" }}>
        All groups
      </Link>
      <div className="flex items-start gap-3">
        <span className="flex shrink-0 items-center justify-center font-semibold text-white" style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: group.coverColor || "#4f46e5", fontSize: 20 }}>
          {group.icon?.trim() ? group.icon.trim().slice(0, 2) : initialFromName(group.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>{group.name}</h1>
            <span className="rounded px-1 text-xs" style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>{visibilityLabel(group.visibility)}</span>
            {group.status === "ARCHIVED" && <span className="rounded px-1 text-xs" style={{ border: "1px solid var(--kb-border)", color: "var(--kb-danger, #dc2626)" }}>Archived</span>}
          </div>
          {group.description && <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{group.description}</p>}
          <p className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{group.memberCount} member{group.memberCount === 1 ? "" : "s"}</p>
        </div>
        {isMember ? (
          <button type="button" onClick={leave} disabled={pending} className="rounded px-3 py-1 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", color: "var(--kb-text-secondary)" }}>Leave</button>
        ) : (
          <button type="button" onClick={join} disabled={pending} className="rounded px-3 py-1 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff" }}>
            {group.visibility === "PUBLIC" ? "Join" : "Request"}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {tabs.map((t) => {
          if (t.key === "settings" && !manages) return null;
          return (
            <Link
              key={t.key}
              href={t.href}
              className="rounded px-3 py-1"
              style={{
                border: "1px solid var(--kb-border)",
                borderRadius: "var(--kb-radius)",
                backgroundColor: active(t.href) ? "var(--kb-bg-hover, #eef2ff)" : "transparent",
                color: active(t.href) ? "var(--kb-text-primary)" : "var(--kb-text-secondary)",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
