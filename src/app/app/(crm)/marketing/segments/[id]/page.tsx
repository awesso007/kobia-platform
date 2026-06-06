/*
 * Edit segment page (Sprint 13). Loads the segment and renders the builder.
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getSegment } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { SegmentBuilder } from "../SegmentBuilder";

export const dynamic = "force-dynamic";

export default async function EditSegmentPage({ params }: { params: { id: string } }) {
  try {
    const segment = await getSegment(params.id);
    if (!segment) notFound();
    return (
      <SegmentBuilder
        segment={{
          id: segment.id,
          name: segment.name,
          description: segment.description,
          entityType: segment.entityType,
          filterJson: segment.filterJson,
          recipientCountCache: segment.recipientCountCache,
        }}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
