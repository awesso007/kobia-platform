/*
 * Workflows list page (Sprint 18). Server component; lists workflows for the
 * active tenant with status, last run, and success rate.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { listWorkflows } from "@/lib/workflows/queries";
import { PageHeader, Card, EmptyState, StatusBadge, Th, Td } from "./WorkflowsUI";
import { fmtDate } from "./workflow-ui-utils";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  try {
    const { db } = getTenantDb();
    const workflows = await listWorkflows(db);
    return (
      <div className="p-6">
        <PageHeader
          title="Workflows"
          subtitle="Visual automation on top of the automations engine. Drag nodes, wire them up, publish."
          action={
            <Link
              href="/app/workflows/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New workflow
            </Link>
          }
        />
        <Card>
          {workflows.length === 0 ? (
            <EmptyState message="No workflows yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Trigger</Th>
                  <Th>Status</Th>
                  <Th>Runs</Th>
                  <Th>Success</Th>
                  <Th>Last run</Th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <Link href={`/app/workflows/${w.id}`} style={{ color: "var(--kb-primary)" }}>
                        {w.name}
                      </Link>
                    </Td>
                    <Td>
                      <code className="text-xs">{w.entryTriggerType}</code>
                    </Td>
                    <Td>
                      <StatusBadge status={w.status} />
                    </Td>
                    <Td>{w.runCount}</Td>
                    <Td>{w.successRate === null ? "-" : `${Math.round(w.successRate * 100)}%`}</Td>
                    <Td>{fmtDate(w.lastRunAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
