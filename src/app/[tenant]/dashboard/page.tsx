import { getTenantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";

export default async function DashboardPage({ params }: { params: { tenant: string } }) {
  const tenant = await getTenantBySlug(params.tenant);
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome to {tenant.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cycle 1 scaffold. Modules light up as we ship them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ModuleCard title="Bookkeeping" status="Cycle 2" href={`/${tenant.slug}/books`} />
        <ModuleCard title="Payroll" status="Cycle 3" href={`/${tenant.slug}/payroll`} />
        <ModuleCard title="Invoicing" status="Cycle 4" href={`/${tenant.slug}/invoicing`} />
        <ModuleCard title="Bill Pay" status="Cycle 4" href={`/${tenant.slug}/bills`} />
      </div>
    </div>
  );
}

function ModuleCard({ title, status, href }: { title: string; status: string; href: string }) {
  return (
    <a
      href={href}
      className="rounded-lg border border-border bg-card p-6 transition hover:border-primary hover:shadow-md"
    >
      <div className="text-sm font-medium text-muted-foreground">{status}</div>
      <div className="mt-2 text-xl font-semibold">{title}</div>
    </a>
  );
}
