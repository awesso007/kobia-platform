import { ComingSoon } from "@/components/ComingSoon";

export default function MortgageLoansPage({ params }: { params: { tenant: string } }) {
  return (
    <ComingSoon
      module="Mortgage · Origination"
      feature="Loans"
      description="Loan files with full URLA (1003), AUS findings, condition tracking, and disclosure timestamps."
      eta="Phase 3 (2027)"
      backHref={`/${params.tenant}/mortgage`}
    />
  );
}
