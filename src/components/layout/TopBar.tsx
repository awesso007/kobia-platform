import type { Tenant } from "@prisma/client";
import { UserButton } from "@clerk/nextjs";
import { Search, Clock } from "lucide-react";
import { EntitySwitcher } from "./EntitySwitcher";
import { TopTabBar } from "./TopTabBar";
import type { TopTab } from "@/lib/modules-config";

type SwitcherEntity = {
  id: string;
  name: string;
  industry: string | null;
  baseCurrency: string | null;
};

export function TopBar({
  tenant,
  entities,
  activeEntityId,
  tabs,
}: {
  tenant: Tenant;
  entities: SwitcherEntity[];
  activeEntityId: string | null;
  tabs: TopTab[];
}) {
  return (
    <header className="flex h-12 items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 text-slate-100">
      {/* Top tab bar — fills remaining space */}
      <div className="flex-1 min-w-0">
        <TopTabBar tenantSlug={tenant.slug} tabs={tabs} />
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Compact search button — Bitrix opens search via icon */}
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Quick search"
          aria-label="Quick search"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Search</span>
        </button>

        {/* Tenant name pill */}
        <div className="hidden md:flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-300">
          <span className="font-semibold text-white">{tenant.name}</span>
        </div>

        {/* Entity switcher */}
        {entities.length > 0 && activeEntityId && (
          <div className="hidden md:block min-w-[160px]">
            <EntitySwitcher
              tenantSlug={tenant.slug}
              entities={entities}
              activeEntityId={activeEntityId}
            />
          </div>
        )}

        {/* Clock placeholder (Bitrix shows work-clock here) */}
        <div className="hidden lg:flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5 text-lime-400" />
        </div>

        {/* User menu */}
        <UserButton afterSignOutUrl={`/${tenant.slug}/login`} />
      </div>
    </header>
  );
}
