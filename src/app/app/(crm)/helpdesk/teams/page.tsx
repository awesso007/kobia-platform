/*
 * Teams admin (Sprint 15). Lists support teams and lets agents add or remove
 * them via the client TeamManager (createTeam / deleteTeam server actions).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listTeams } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { HelpdeskTabs, PageHeader, TeamManager } from "../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  try {
    const teams = await listTeams();
    return (
      <div className="p-6">
        <PageHeader title="Teams" subtitle="Group agents so tickets route to the right place." />
        <HelpdeskTabs active="/app/helpdesk/teams" />
        <TeamManager
          teams={teams.map((t) => ({ id: t.id, name: t.name, description: t.description }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
