import { listAutomations } from "./queries";
import { AutomationsClient } from "./AutomationsClient";
import { listTags } from "@/lib/crm/tags";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { requirePlan, PlanRequiredError } from "@/lib/billing/gates";
import { UpgradeBlocker } from "@/lib/billing/UpgradeBlocker";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  try {
    await requirePlan("automations");
    const { db } = getTenantDb();
    const [automations, tags, emailAccounts, emailTemplates, phoneNumbers] = await Promise.all([
      listAutomations(),
      listTags(),
      db.emailAccount.findMany({ orderBy: { address: "asc" }, select: { id: true, address: true } }),
      db.emailTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.phoneNumber.findMany({ where: { status: "ACTIVE" }, orderBy: { e164: "asc" }, select: { id: true, e164: true } }),
    ]);
    return (
      <AutomationsClient
        automations={automations}
        allTags={tags}
        emailAccounts={emailAccounts}
        emailTemplates={emailTemplates}
        phoneNumbers={phoneNumbers}
      />
    );
  } catch (err) {
    if (err instanceof PlanRequiredError) {
      return <UpgradeBlocker feature="Automations" required={err.required} current={err.current} />;
    }
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
