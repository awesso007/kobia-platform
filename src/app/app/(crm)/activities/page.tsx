/*
 * Activities page (Sprint 4). Server component: resolves filters from the URL,
 * queries the list and (when the calendar view is active) the month grid, then
 * hands everything to the client shell which toggles List / Calendar.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listActivities, listActivitiesForMonth, listRelatedOptions } from "./queries";
import { ActivitiesClient } from "./ActivitiesClient";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const get = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const view = get("view") === "calendar" ? "calendar" : "list";

  const now = new Date();
  const year = get("year") ? Number(get("year")) : now.getUTCFullYear();
  const month = get("month") !== undefined ? Number(get("month")) : now.getUTCMonth();

  const filters = {
    type: get("type"),
    owner: get("owner"),
    status: get("status"),
    relatedType: get("relatedType"),
    from: get("from"),
    to: get("to"),
    sort: get("sort"),
    dir: get("dir"),
    page: get("page") ? Number(get("page")) : 1,
  };

  try {
    const [list, related, calendar] = await Promise.all([
      listActivities(filters),
      listRelatedOptions(),
      view === "calendar"
        ? listActivitiesForMonth(year, month, {
            type: filters.type,
            owner: filters.owner,
            status: filters.status,
            relatedType: filters.relatedType,
          })
        : Promise.resolve([]),
    ]);

    return (
      <ActivitiesClient
        view={view}
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageCount={list.pageCount}
        owners={list.owners}
        related={related}
        calendarRows={calendar}
        year={year}
        month={month}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
