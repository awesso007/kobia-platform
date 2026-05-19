import { ComingSoon } from "@/components/ComingSoon";

export default function MortgageBorrowersPage({ params }: { params: { tenant: string } }) {
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
