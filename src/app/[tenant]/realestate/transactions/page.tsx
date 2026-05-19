import { ComingSoon } from "@/components/ComingSoon";
import { requireFeature } from "@/lib/feature-gate";

export default async function RealEstateTransactionsPage({ params }: { params: { tenant: string } }) {
  await requireFeature(params.tenant, "realestate");
  return (
    <ComingSoon
      module="Real Estate · Brokerage"
      feature="Transactions"
      description="Transaction coordination — contracts, contingencies, escrow milestones, and closing checklists."
      eta="Phase 4 (2027)"
      backHref={`/${params.tenant}/realestate`}
    />
  );
}
