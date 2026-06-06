import { getDealBoard } from "./queries";
import { DealsBoard } from "./DealsBoard";
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
    const board = await getDealBoard(pipeline);
    return <DealsBoard board={board} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
