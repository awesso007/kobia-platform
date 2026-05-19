import { ModuleShell } from "@/components/layout/ModuleShell";

export default function BillsPage({ params }: { params: { tenant: string } }) {
  return <ModuleShell tenantSlug={params.tenant} module="Bill Pay (AP)" cycle="Cycle 4 (Nov-Dec 2026)" />;
}
