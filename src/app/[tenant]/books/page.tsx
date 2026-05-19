export default function BooksPage({ params }: { params: { tenant: string } }) {
  return <ModuleShell tenantSlug={params.tenant} module="Bookkeeping" cycle="Cycle 2 (Jul-Aug 2026)" />;
}

import { ModuleShell } from "@/components/layout/ModuleShell";
