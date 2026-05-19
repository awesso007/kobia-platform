import { ModuleShell } from "@/components/layout/ModuleShell";

export default function PayrollPage({ params }: { params: { tenant: string } }) {
  return <ModuleShell tenantSlug={params.tenant} module="Payroll" cycle="Cycle 3 (Sep-Oct 2026)" />;
}
