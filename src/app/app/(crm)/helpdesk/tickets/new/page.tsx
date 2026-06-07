/*
 * New ticket (Sprint 15). Server component loads the option lists and hands them
 * to the client NewTicketForm, which calls the createTicket server action.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listTeams, listCategories, listSlaPolicies } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { PageHeader, NewTicketForm } from "../../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  try {
    const [teams, categories, slaPolicies] = await Promise.all([
      listTeams(),
      listCategories(),
      listSlaPolicies(),
    ]);
    return (
      <div className="p-6">
        <Link href="/app/helpdesk/tickets" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
          Back to tickets
        </Link>
        <PageHeader title="New ticket" subtitle="Open a ticket on behalf of a customer." />
        <NewTicketForm
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          slaPolicies={slaPolicies.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
