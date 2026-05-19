import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenant";
import { TenantSidebar } from "@/components/layout/TenantSidebar";
import { TenantHeader } from "@/components/layout/TenantHeader";
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

  const [entities, activeEntity, activeModule] = await Promise.all([
    listEntitiesForSwitcher(tenant.id),
    getActiveEntity({ tenantId: tenant.id, tenantSlug: tenant.slug }),
    getActiveModule(tenant.slug),
  ]);

  return (
    <div
      className="flex min-h-screen"
      style={
        {
          "--primary": tenant.primaryColor,
          "--secondary": tenant.secondaryColor,
        } as React.CSSProperties
      }
    >
      <TRPCProvider>
        <TenantSidebar
          tenant={tenant}
          entities={entities}
          activeEntityId={activeEntity?.id ?? null}
          activeModule={activeModule}
        />
        <div className="flex flex-1 flex-col">
          <TenantHeader tenant={tenant} />
          <main className="flex-1 p-8">{children}</main>
          <PoweredByKobia tenant={tenant} />
        </div>
      </TRPCProvider>
    </div>
  );
}
