"use client";

/*
 * Tenant switcher (Sprint 5). Lists the tenants the signed-in user belongs to
 * and switches the active CRM workspace by navigating with ?tenant=<slug>
 * (middleware updates the kb-tenant cookie). Includes a "Create workspace" entry
 * pointing to /onboarding.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { UserTenant } from "@/lib/tenancy/user-tenants";

export function TenantSwitcher({ tenants }: { tenants: UserTenant[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = tenants[0];
  const label = active?.displayName || active?.slug || "Select workspace";
  const initial = (label[0] ?? "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded px-2 py-1 text-sm"
        style={{ color: "var(--kb-text-primary)" }}
      >
        <span className="grid h-6 w-6 place-items-center rounded text-xs font-semibold text-white" style={{ backgroundColor: "var(--kb-primary)" }}>
          {initial}
        </span>
        <span>{label}</span>
        <ChevronDown size={14} style={{ color: "var(--kb-text-secondary)" }} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-10 z-50 overflow-hidden rounded"
          style={{ width: "240px", backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}
        >
          {tenants.length === 0 ? (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No workspaces yet</div>
          ) : (
            tenants.map((t) => (
              <a
                key={t.slug}
                href={`/app/deals?tenant=${t.slug}`}
                className="flex items-center justify-between px-3 py-2 text-sm"
                style={{ color: "var(--kb-text-primary)", borderBottom: "1px solid var(--kb-border)" }}
              >
                <span>{t.displayName || t.slug}</span>
                <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{t.role}</span>
              </a>
            ))
          )}
          <a
            href="/onboarding"
            className="flex items-center gap-2 px-3 py-2 text-sm"
            style={{ color: "var(--kb-primary)" }}
          >
            <Plus size={14} /> Create workspace
          </a>
        </div>
      )}
    </div>
  );
}
