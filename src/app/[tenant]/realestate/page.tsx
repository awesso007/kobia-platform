import { ComingSoon } from "@/components/ComingSoon";

export default function RealEstateListingsPage({ params }: { params: { tenant: string } }) {
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
