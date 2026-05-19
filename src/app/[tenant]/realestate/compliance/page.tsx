import { ComingSoon } from "@/components/ComingSoon";

export default function RealEstateCompliancePage({ params }: { params: { tenant: string } }) {
  return (
    <ComingSoon
      module="Real Estate · Compliance"
      feature="DRE / NMLS"
      description="License renewals, CE tracking, trust account reconciliation, and DRE audit readiness."
      eta="Phase 4 (2027)"
      backHref={`/${params.tenant}/realestate`}
    />
  );
}
