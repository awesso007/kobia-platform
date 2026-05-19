import { ModuleShell } from "@/components/layout/ModuleShell";

export default function SettingsPage({ params }: { params: { tenant: string } }) {
  return (
    <ModuleShell
      tenantSlug={params.tenant}
      module="Settings"
      cycle="Cycle 1 — basic branding controls ship next"
    />
  );
}
