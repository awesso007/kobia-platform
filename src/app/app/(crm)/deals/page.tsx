import { getDealBoard } from "./queries";
import { DealsBoard } from "./DealsBoard";
import { getCustomFieldsFor } from "@/lib/crm/custom-fields";
import { listTags } from "@/lib/crm/tags";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pipeline = Array.isArray(searchParams.pipeline)
    ? searchParams.pipeline[0]
    : searchParams.pipeline;
  try {
    const [board, customFields, tags] = await Promise.all([
      getDealBoard(pipeline),
      getCustomFieldsFor("DEAL"),
      listTags(),
    ]);
    return <DealsBoard board={board} allTags={tags} customFields={customFields} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
