"use client";

import { useRouter } from "next/navigation";
import { MODULES } from "@/lib/modules-config";
import type { ModuleKey } from "@/lib/active-module";

export function ModuleRail({
  tenantSlug,
  activeModule,
}: {
  tenantSlug: string;
  activeModule: ModuleKey;
}) {
  const router = useRouter();

  async function switchModule(key: ModuleKey) {
    // Hit the server action endpoint to set the active module cookie, then refresh.
    await fetch(`/api/active-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: key, tenantSlug }),
    });
    router.refresh();
  }

  return (
    <nav
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-900 py-3"
      aria-label="Module switcher"
    >
      {MODULES.map((mod) => {
        const isActive = mod.key === activeModule;
        const Icon = mod.icon;
        const isLocked = mod.comingSoon;

        return (
          <button
            key={mod.key}
            type="button"
            onClick={() => !isLocked && switchModule(mod.key)}
            disabled={isLocked}
            title={`${mod.label}${isLocked ? " (Coming soon)" : ""}`}
            className={`group relative flex h-11 w-11 items-center justify-center rounded-lg transition ${
              isActive
                ? "bg-lime-400 text-slate-900 shadow-md"
                : isLocked
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={2.25} />

            {/* Active indicator stripe (left edge) */}
            {isActive && (
              <span
                className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-lime-400"
                aria-hidden="true"
              />
            )}

            {/* Tooltip */}
            <span
              className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100 z-50"
              role="tooltip"
            >
              {mod.label}
              {isLocked && (
                <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                  Soon
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
