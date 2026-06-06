import { listAutomations } from "./queries";
import { AutomationsClient } from "./AutomationsClient";
import { listTags } from "@/lib/crm/tags";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  try {
    const [automations, tags] = await Promise.all([listAutomations(), listTags()]);
    return <AutomationsClient automations={automations} allTags={tags} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
