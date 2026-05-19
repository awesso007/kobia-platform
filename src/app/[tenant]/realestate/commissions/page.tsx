import { ComingSoon } from "@/components/ComingSoon";

export default function RealEstateCommissionsPage({ params }: { params: { tenant: string } }) {
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
