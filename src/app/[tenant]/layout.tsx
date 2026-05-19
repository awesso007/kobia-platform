import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenant";
import { TenantSidebar } from "@/components/layout/TenantSidebar";
import { TenantHeader } from "@/components/layout/TenantHeader";
import { PoweredByKobia } from "@/components/branding/PoweredByKobia";
import { TRPCProvider } from "@/components/providers/TRPCProvider";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  const tenant = await getTenantBySlug(params.tenant);
  if (!tenant) notFound();

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
        <TenantSidebar tenant={tenant} />
        <div className="flex flex-1 flex-col">
          <TenantHeader tenant={tenant} />
          <main className="flex-1 p-8">{children}</main>
          <PoweredByKobia tenant={tenant} />
        </div>
      </TRPCProvider>
    </div>
  );
}
