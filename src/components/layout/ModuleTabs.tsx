"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchModule } from "@/app/actions/module-actions";
import type { ModuleKey } from "@/lib/active-module";

type ModuleTab = {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  comingSoon: boolean;
};

export function ModuleTabs({
  tenantSlug,
  modules,
  activeModule,
}: {
  tenantSlug: string;
  modules: ModuleTab[];
  activeModule: ModuleKey;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSwitch(key: ModuleKey) {
    if (key === activeModule) return;
    startTransition(async () => {
      await switchModule(tenantSlug, key);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      {modules.map((m) => {
        const isActive = m.key === activeModule;
        return (
          <button
            key={m.key}
            onClick={() => handleSwitch(m.key)}
            disabled={isPending}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-slate-600 hover:bg-muted"
            } ${isPending ? "opacity-50" : ""}`}
            style={isActive ? { backgroundColor: "var(--primary, #0f172a)", color: "white" } : undefined}
          >
            <span>{m.label}</span>
            {m.comingSoon && (
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
