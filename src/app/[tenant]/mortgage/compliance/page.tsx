import { ComingSoon } from "@/components/ComingSoon";

export default function MortgageCompliancePage({ params }: { params: { tenant: string } }) {
  return (
    <ComingSoon
      module="Mortgage · Compliance"
      feature="RESPA / TRID"
      description="Disclosure timing, LE/CD tolerance tracking, ECOA adverse-action, HMDA reporting, and audit trails."
      eta="Phase 3 (2027)"
      backHref={`/${params.tenant}/mortgage`}
    />
  );
}
