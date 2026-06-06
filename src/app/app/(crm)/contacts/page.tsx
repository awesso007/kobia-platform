import { listContacts } from "./queries";
import { ContactsTable } from "./ContactsTable";
import { getCustomFieldsFor } from "@/lib/crm/custom-fields";
import { listTags } from "@/lib/crm/tags";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const get = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  try {
    const [data, customFields, tags] = await Promise.all([
      listContacts({
        company: get("company"),
        owner: get("owner"),
        tag: get("tag"),
        search: get("search"),
        sort: get("sort"),
        dir: get("dir"),
        page: get("page") ? Number(get("page")) : 1,
      }),
      getCustomFieldsFor("CONTACT"),
      listTags(),
    ]);
    return (
      <ContactsTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        owners={data.owners}
        companies={data.companies}
        allTags={tags}
        customFields={customFields}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
