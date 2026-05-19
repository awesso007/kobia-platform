import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantBySlug } from "@/lib/tenant";
import { TenantSidebar } from "@/components/layout/TenantSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ModuleRail } from "@/components/layout/ModuleRail";
import { PoweredByKobia } from "@/components/branding/PoweredByKobia";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { getActiveEntity, listEntitiesForSwitcher } from "@/lib/active-entity";
import { getActiveModule } from "@/lib/active-module";

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

  return (
    <div
      className="flex h-screen flex-col bg-slate-50"
      style={
        {
          "--primary": tenant.primaryColor,
          "--secondary": tenant.secondaryColor,
        } as React.CSSProperties
      }
    >
      <TRPCProvider>
        {/* Top bar — spans full width */}
        <TopBar
          tenant={tenant}
          entities={entities}
          activeEntityId={activeEntity?.id ?? null}
        />

        {/* Body: ModuleRail | Sidebar | Main */}
        <div className="flex flex-1 min-h-0">
          <ModuleRail tenantSlug={tenant.slug} activeModule={activeModule} />
          <TenantSidebar tenantSlug={tenant.slug} activeModule={activeModule} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
            <PoweredByKobia tenant={tenant} />
          </div>
        </div>
      </TRPCProvider>
    </div>
  );
}
