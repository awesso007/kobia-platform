/*
 * Campaign detail / step builder page (Sprint 13).
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getCampaign, listSegmentsLite } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { CampaignBuilder } from "../CampaignBuilder";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  try {
    const [campaign, segments] = await Promise.all([getCampaign(params.id), listSegmentsLite()]);
    if (!campaign) notFound();
    return (
      <CampaignBuilder
        segments={segments}
        campaign={{
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          triggerType: campaign.triggerType,
          segmentId: campaign.segmentId,
          steps: campaign.steps.map((s) => ({ type: s.type, config: s.config })),
        }}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
