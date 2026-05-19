import { ModuleShell } from "@/components/layout/ModuleShell";

export default function InvoicingPage({ params }: { params: { tenant: string } }) {
  return <ModuleShell tenantSlug={params.tenant} module="Invoicing (AR)" cycle="Cycle 4 (Nov-Dec 2026)" />;
}
