/*
 * Workflow runs list (Sprint 18).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getWorkflow, listRuns } from "@/lib/workflows/queries";
import { PageHeader, Card, EmptyState, StatusBadge, Th, Td } from "../../WorkflowsUI";
import { fmtDate, fmtDuration } from "../../workflow-ui-utils";

export const dynamic = "force-dynamic";

export default async function WorkflowRunsPage({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const workflow = await getWorkflow(db, params.id);
    if (!workflow) notFound();
    const runs = await listRuns(db, params.id);
    return (
      <div className="p-6">
        <div className="mb-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/workflows">Workflows</Link>
          {" / "}
          <Link href={`/app/workflows/${workflow.id}`}>{workflow.name}</Link>
          {" / Runs"}
        </div>
        <PageHeader title={`${workflow.name} - Runs`} subtitle="Recent runs and their step logs." />
        <Card>
          {runs.length === 0 ? (
            <EmptyState message="No runs yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Started</Th>
                  <Th>Status</Th>
                  <Th>Duration</Th>
                  <Th>Completed</Th>
                  <Th>{" "}</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>{fmtDate(r.startedAt)}</Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td>{fmtDuration(r.startedAt, r.completedAt)}</Td>
                    <Td>{fmtDate(r.completedAt)}</Td>
                    <Td>
                      <Link
                        href={`/app/workflows/${workflow.id}/runs/${r.id}`}
                        style={{ color: "var(--kb-primary)" }}
                      >
                        View
                      </Link>
                    </Td>
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
