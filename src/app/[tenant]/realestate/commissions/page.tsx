import { ComingSoon } from "@/components/ComingSoon";
import { requireFeature } from "@/lib/feature-gate";

export default async function RealEstateCommissionsPage({ params }: { params: { tenant: string } }) {
  await requireFeature(params.tenant, "realestate");
  return (
    <ComingSoon
      module="Real Estate · Brokerage"
      feature="Commissions"
      description="Commission splits, broker bonuses, agent payouts, and integration with Accounting for clean ledger postings."
      eta="Phase 4 (2027)"
      backHref={`/${params.tenant}/realestate`}
    />
  );
}
