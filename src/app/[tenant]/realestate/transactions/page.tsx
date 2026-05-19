import { ComingSoon } from "@/components/ComingSoon";

export default function RealEstateTransactionsPage({ params }: { params: { tenant: string } }) {
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
