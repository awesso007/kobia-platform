import { ComingSoon } from "@/components/ComingSoon";
import { requireFeature } from "@/lib/feature-gate";

export default async function RealEstateCompliancePage({ params }: { params: { tenant: string } }) {
  await requireFeature(params.tenant, "realestate");
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
