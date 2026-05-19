import { ComingSoon } from "@/components/ComingSoon";
import { requireFeature } from "@/lib/feature-gate";

export default async function RealEstateListingsPage({ params }: { params: { tenant: string } }) {
  await requireFeature(params.tenant, "realestate");
  return (
    <ComingSoon
      module="Real Estate · Brokerage"
      feature="Listings"
      description="Active and pending listings, MLS sync, showings, offers, and seller communications."
      eta="Phase 4 (2027)"
      backHref={`/${params.tenant}/dashboard`}
    />
  );
}
