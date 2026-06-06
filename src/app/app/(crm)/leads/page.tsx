import { listLeads } from "./queries";
import { LeadsTable } from "./LeadsTable";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const get = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  try {
    const data = await listLeads({
      status: get("status"),
      source: get("source"),
      owner: get("owner"),
      search: get("search"),
      sort: get("sort"),
      dir: get("dir"),
      page: get("page") ? Number(get("page")) : 1,
    });
    return (
      <LeadsTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        owners={data.owners}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
