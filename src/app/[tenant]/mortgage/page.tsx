import { ComingSoon } from "@/components/ComingSoon";
import { requireFeature } from "@/lib/feature-gate";

export default async function MortgagePipelinePage({ params }: { params: { tenant: string } }) {
  await requireFeature(params.tenant, "mortgage");
  return (
    <ComingSoon
      module="Mortgage · Origination"
      feature="Loan Pipeline"
      description="End-to-end loan origination — application intake, doc collection, AUS submission, conditions tracking, and closing. RESPA / TRID compliant."
      eta="Phase 3 (2027)"
      backHref={`/${params.tenant}/dashboard`}
    />
  );
}
