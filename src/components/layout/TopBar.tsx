import Link from "next/link";
import type { Tenant } from "@prisma/client";
import { UserButton } from "@clerk/nextjs";
import { Search, Bell, LayoutDashboard } from "lucide-react";
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
    <header
      className="flex h-12 items-center gap-3 border-b border-white/10 px-3 text-white shadow-sm"
      style={{
        background:
          "linear-gradient(90deg, var(--kobia-primary, #0F172A) 0%, var(--kobia-secondary, #3B82F6) 100%)",
      }}
    >
      {/* Home / Dashboard link */}
      <Link
        href={`/${tenant.slug}/dashboard`}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white/90 hover:bg-white/10 hover:text-white"
        title="Dashboard"
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>

      {/* Top tab bar — fills remaining space */}
      <div className="flex-1 min-w-0">
        <TopTabBar tenantSlug={tenant.slug} tabs={tabs} />
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Tenant pill */}
        <Link
          href={`/${tenant.slug}/dashboard`}
          className="hidden md:flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          title="Go to dashboard"
        >
          <span className="font-semibold text-white">{tenant.name}</span>
        </Link>

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

        {/* Search */}
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white"
          title="Quick search"
          aria-label="Quick search"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        {/* Notifications */}
        <button
          type="button"
          className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
        </button>

        {/* User menu */}
        <UserButton afterSignOutUrl={`/${tenant.slug}/login`} />
      </div>
    </header>
  );
}
