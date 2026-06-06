import { getLeadBoard } from "./queries";
import { LeadsBoard } from "./LeadsBoard";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";

export const dynamic = "force-dynamic";

export default async function LeadsKanbanPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pipeline = Array.isArray(searchParams.pipeline) ? searchParams.pipeline[0] : searchParams.pipeline;
  try {
    const board = await getLeadBoard(pipeline);
    return <LeadsBoard board={board} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
