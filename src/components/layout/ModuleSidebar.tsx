"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { MODULES, type ModuleDefinition } from "@/lib/modules-config";
import type { ModuleKey } from "@/lib/active-module";

export function ModuleSidebar({
  tenantSlug,
  activeModule,
  modules = MODULES,
}: {
  tenantSlug: string;
  activeModule: ModuleKey;
  modules?: ModuleDefinition[];
}) {
  const router = useRouter();

  async function switchModule(modKey: ModuleKey, defaultHref: string) {
    await fetch(`/api/active-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: modKey, tenantSlug }),
    });
    router.push(`/${tenantSlug}${defaultHref}`);
    router.refresh();
  }

  return (
    <aside
      className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300"
      aria-label="Module navigation"
    >
      <Link
        href={`/${tenantSlug}/dashboard`}
        className="flex items-center justify-start gap-2 px-4 py-3 border-b border-slate-800 hover:bg-slate-800/50"
        title="Back to dashboard"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-64.png"
          alt="KOBIA"
          className="h-8 w-auto"
        />
      </Link>

      <nav className="flex-1 overflow-y-auto py-2">
        {modules.map((mod) => {
          const isActive = mod.key === activeModule;
          const isLocked = mod.comingSoon;
          const Icon = mod.icon;
          return (
            <button
              key={mod.key}
              type="button"
              onClick={() => !isLocked && switchModule(mod.key, mod.defaultHref)}
              disabled={isLocked}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-left transition ${
                isActive
                  ? "bg-lime-400/10 text-white border-l-2 border-lime-400 pl-[14px]"
                  : isLocked
                    ? "text-slate-600 cursor-not-allowed"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? "text-lime-400" : isLocked ? "text-slate-600" : "text-slate-400"
                }`}
                strokeWidth={2.25}
              />
              <span className="flex-1">{mod.label}</span>
              {isLocked && (
                <span className="rounded-sm bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Upgrade pill — bottom */}
      <div className="border-t border-slate-800 p-3">
        <Link
          href={`/${tenantSlug}/settings/billing`}
          className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-orange-400 hover:to-pink-400"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Upgrade your plan
        </Link>
      </div>
    </aside>
  );
}
