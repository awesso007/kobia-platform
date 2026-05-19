import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantBySlug } from "@/lib/tenant";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RightRail } from "@/components/layout/RightRail";
import { PoweredByKobia } from "@/components/branding/PoweredByKobia";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { getActiveEntity, listEntitiesForSwitcher } from "@/lib/active-entity";
import { getActiveModule } from "@/lib/active-module";
import { getModuleByKey } from "@/lib/modules-config";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  const tenant = await getTenantBySlug(params.tenant);
  if (!tenant) notFound();

  // Detect whether we're inside the /welcome flow.
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  const isOnWelcome = pathname.includes(`/${tenant.slug}/welcome`);

  // Route guard: send new tenants through /welcome before they hit the app shell.
  if (!tenant.onboardingCompleted && !isOnWelcome) {
    redirect(`/${tenant.slug}/welcome`);
  }

  // Welcome flow renders full-screen — no sidebar/header chrome.
  if (isOnWelcome) {
    return (
      <div
        style={
          {
            "--primary": tenant.primaryColor,
            "--secondary": tenant.secondaryColor,
          } as React.CSSProperties
        }
      >
        <TRPCProvider>{children}</TRPCProvider>
      </div>
    );
  }

  const [entities, activeEntity, activeModule] = await Promise.all([
    listEntitiesForSwitcher(tenant.id),
    getActiveEntity({ tenantId: tenant.id, tenantSlug: tenant.slug }),
    getActiveModule(tenant.slug),
  ]);

  const mod = getModuleByKey(activeModule);

  return (
    <div
      className="flex h-screen bg-slate-50"
      style={
        {
          "--primary": tenant.primaryColor,
          "--secondary": tenant.secondaryColor,
        } as React.CSSProperties
      }
    >
      <TRPCProvider>
        {/* LEFT: Module sidebar (220px, dark, labeled) */}
        <ModuleSidebar tenantSlug={tenant.slug} activeModule={activeModule} />

        {/* CENTER: top bar + main canvas */}
        <div className="flex flex-1 min-w-0 flex-col">
          <TopBar
            tenant={tenant}
            entities={entities}
            activeEntityId={activeEntity?.id ?? null}
            tabs={mod.topTabs}
          />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <PoweredByKobia tenant={tenant} />
        </div>

        {/* RIGHT: slim quick-tools rail */}
        <RightRail />
      </TRPCProvider>
    </div>
  );
}
