import type { Tenant } from "@prisma/client";
import { UserButton } from "@clerk/nextjs";

export function TenantHeader({ tenant }: { tenant: Tenant }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Tenant</p>
        <p className="text-sm font-medium">{tenant.name}</p>
      </div>
      <UserButton afterSignOutUrl={`/${tenant.slug}/login`} />
    </header>
  );
}
