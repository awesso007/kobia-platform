/*
 * New broadcast page (Sprint 13). Renders the editor in create mode.
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listSegmentsLite } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { BroadcastEditor } from "../BroadcastEditor";

export const dynamic = "force-dynamic";

export default async function NewBroadcastPage() {
  try {
    const segments = await listSegmentsLite();
    return <BroadcastEditor segments={segments} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
