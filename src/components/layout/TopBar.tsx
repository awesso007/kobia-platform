import Link from "next/link";
import type { Tenant } from "@prisma/client";
import { UserButton } from "@clerk/nextjs";
import { Search, Clock } from "lucide-react";
import { EntitySwitcher } from "./EntitySwitcher";

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
}: {
  tenant: Tenant;
  entities: SwitcherEntity[];
  activeEntityId: string | null;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 text-slate-100">
      {/* Brand */}
      <Link
        href={`/${tenant.slug}`}
        className="flex items-center gap-2 pr-4 border-r border-slate-700/60"
      >
        {tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logoUrl} alt={tenant.name} className="h-7 w-auto" />
        ) : (
          <>
            <span className="text-base font-semibold tracking-tight">KOBIA</span>
            <Clock className="h-3.5 w-3.5 text-lime-400" />
          </>
        )}
        <span className="ml-2 hidden text-xs font-medium text-slate-300 sm:inline">
          {tenant.name}
        </span>
      </Link>

      {/* Global search */}
      <div className="relative flex-1 max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Find clients, invoices, transactions, documents..."
          className="h-9 w-full rounded-md border border-slate-700 bg-slate-800/70 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
        />
      </div>

      {/* Entity switcher */}
      {entities.length > 0 && activeEntityId && (
        <div className="hidden md:block min-w-[180px]">
          <EntitySwitcher
            tenantSlug={tenant.slug}
            entities={entities}
            activeEntityId={activeEntityId}
          />
        </div>
      )}

      {/* User menu */}
      <div className="flex items-center gap-3">
        <UserButton afterSignOutUrl={`/${tenant.slug}/login`} />
      </div>
    </header>
  );
}
