"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { ChevronsUpDown, Check, Building2 } from "lucide-react";
import { switchEntityAction } from "@/app/[tenant]/actions/switch-entity";

type Entity = {
  id: string;
  name: string;
  industry: string | null;
  baseCurrency: string | null;
};

export function EntitySwitcher({
  tenantSlug,
  entities,
  activeEntityId,
}: {
  tenantSlug: string;
  entities: Entity[];
  activeEntityId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const active = entities.find((e) => e.id === activeEntityId) ?? entities[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!active || entities.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500">
        No entities yet
      </div>
    );
  }

  function pick(entityId: string) {
    if (entityId === activeEntityId) {
      setOpen(false);
      return;
    }
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("entityId", entityId);
    startTransition(async () => {
      await switchEntityAction(fd);
      setOpen(false);
      // Force a reload so all server components re-render with new entity.
      window.location.reload();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 flex-shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900">{active.name}</span>
            {active.industry && (
              <span className="block truncate text-xs text-slate-500">{active.industry}</span>
            )}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {entities.map((e) => {
            const selected = e.id === activeEntityId;
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(e.id)}
                disabled={isPending}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 ${
                  selected ? "bg-blue-50" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{e.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {e.industry ?? "—"}
                    {e.baseCurrency && ` · ${e.baseCurrency}`}
                  </span>
                </span>
                {selected && <Check className="h-4 w-4 flex-shrink-0 text-blue-600" />}
              </button>
            );
          })}
          <a
            href={`/${tenantSlug}/entities/new`}
            className="mt-1 flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            + New entity
          </a>
          <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
            {entities.length} {entities.length === 1 ? "entity" : "entities"}
          </div>
        </div>
      )}
    </div>
  );
}
