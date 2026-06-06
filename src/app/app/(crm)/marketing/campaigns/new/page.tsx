/*
 * New campaign page (Sprint 13). Renders the builder in create mode.
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listSegmentsLite } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { CampaignBuilder } from "../CampaignBuilder";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  try {
    const segments = await listSegmentsLite();
    return <CampaignBuilder segments={segments} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
