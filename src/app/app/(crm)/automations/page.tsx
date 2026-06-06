import { listAutomations } from "./queries";
import { AutomationsClient } from "./AutomationsClient";
import { listTags } from "@/lib/crm/tags";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { requirePlan, PlanRequiredError } from "@/lib/billing/gates";
import { UpgradeBlocker } from "@/lib/billing/UpgradeBlocker";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  try {
    await requirePlan("automations");
    const [automations, tags] = await Promise.all([listAutomations(), listTags()]);
    return <AutomationsClient automations={automations} allTags={tags} />;
  } catch (err) {
    if (err instanceof PlanRequiredError) {
      return <UpgradeBlocker feature="Automations" required={err.required} current={err.current} />;
    }
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
