import { ComingSoon } from "@/components/ComingSoon";
import { requireFeature } from "@/lib/feature-gate";

export default async function MortgageBorrowersPage({ params }: { params: { tenant: string } }) {
  await requireFeature(params.tenant, "mortgage");
  return (
    <ComingSoon
      module="Mortgage · Origination"
      feature="Borrowers"
      description="Borrower CRM — co-borrowers, employment history, income, assets, REO, and loan history."
      eta="Phase 3 (2027)"
      backHref={`/${params.tenant}/mortgage`}
    />
  );
}
