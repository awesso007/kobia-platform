import Link from "next/link";
import type { Tenant } from "@prisma/client";
import { EntitySwitcher } from "./EntitySwitcher";
import { ModuleTabs } from "./ModuleTabs";
import { MODULES, getModuleByKey } from "@/lib/modules-config";
import type { ModuleKey } from "@/lib/active-module";

type SwitcherEntity = {
  id: string;
  name: string;
  industry: string | null;
  baseCurrency: string | null;
};

export function TenantSidebar({
  tenant,
  entities,
  activeEntityId,
  activeModule,
}: {
  tenant: Tenant;
  entities: SwitcherEntity[];
  activeEntityId: string | null;
  activeModule: ModuleKey;
}) {
  const base = `/${tenant.slug}`;
  const mod = getModuleByKey(activeModule);

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-6">
        {tenant.logoUrl ? (
          <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-auto" />
        ) : (
          <div className="text-lg font-semibold">{tenant.name}</div>
        )}
      </div>

      {entities.length > 0 && activeEntityId && (
        <div className="border-b border-border p-3">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Active Entity
          </p>
          <EntitySwitcher
            tenantSlug={tenant.slug}
            entities={entities}
            activeEntityId={activeEntityId}
          />
        </div>
      )}

      <div className="border-b border-border p-2">
        <ModuleTabs
          tenantSlug={tenant.slug}
          modules={MODULES.map((m) => ({
            key: m.key,
            label: m.label,
            shortLabel: m.shortLabel ?? m.label,
            comingSoon: m.comingSoon ?? false,
          }))}
          activeModule={activeModule}
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {mod.groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = `${base}${item.href}`;
                const isLocked = !!item.badge;
                return (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition hover:bg-muted"
                  >
                    <span className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4 text-slate-500" />
                      {item.label}
                    </span>
                    {isLocked && (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
