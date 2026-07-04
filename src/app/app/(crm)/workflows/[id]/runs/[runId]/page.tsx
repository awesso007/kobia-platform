/*
 * Workflow run detail (Sprint 18). Timeline of step logs.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { getRun } from "@/lib/workflows/queries";
import { PageHeader, Card, StatusBadge, CancelRunButton } from "../../../WorkflowsUI";
import { fmtDate, fmtDuration } from "../../../workflow-ui-utils";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: { id: string; runId: string };
}) {
  try {
    const { db } = getTenantDb();
    const run = await getRun(db, params.id, params.runId);
    if (!run) notFound();
    return (
      <div className="p-6">
        <div className="mb-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/workflows">Workflows</Link>
          {" / "}
          <Link href={`/app/workflows/${params.id}`}>{run.workflowName}</Link>
          {" / "}
          <Link href={`/app/workflows/${params.id}/runs`}>Runs</Link>
          {" / Detail"}
        </div>
        <PageHeader
          title={`Run - ${run.workflowName}`}
          subtitle={`Started ${fmtDate(run.startedAt)}`}
          action={
            run.status === "RUNNING" || run.status === "WAITING" ? (
              <CancelRunButton workflowId={params.id} runId={run.id} />
            ) : null
          }
        />
        <div className="mb-4 flex gap-4 text-sm">
          <div>
            <span style={{ color: "var(--kb-text-secondary)" }}>Status: </span>
            <StatusBadge status={run.status} />
          </div>
          <div>
            <span style={{ color: "var(--kb-text-secondary)" }}>Duration: </span>
            <span style={{ color: "var(--kb-text-primary)" }}>
              {fmtDuration(run.startedAt, run.completedAt)}
            </span>
          </div>
          {run.currentNodeId ? (
            <div>
              <span style={{ color: "var(--kb-text-secondary)" }}>Current node: </span>
              <code>{run.currentNodeId}</code>
            </div>
          ) : null}
        </div>
        {run.error ? (
          <div
            className="mb-4 rounded p-3 text-sm"
            style={{ backgroundColor: "#fef2f2", border: "1px solid #dc2626", color: "#7f1d1d" }}
          >
            <strong>Error:</strong> {run.error}
          </div>
        ) : null}
        <Card>
          <div className="p-4">
            <p className="mb-3 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
              Steps ({run.steps.length})
            </p>
            {run.steps.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                No steps recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {run.steps.map((s, i) => (
                  <li
                    key={s.id}
                    className="rounded p-3"
                    style={{ border: "1px solid var(--kb-border)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs"
                          style={{ backgroundColor: "var(--kb-primary)", color: "white" }}
                        >
                          {i + 1}
                        </span>
                        <code className="text-xs">{s.nodeType}</code>
                        <span
                          className="text-xs"
                          style={{ color: "var(--kb-text-secondary)" }}
                        >
                          ({s.nodeId})
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <StatusBadge status={s.status} />
                        <span style={{ color: "var(--kb-text-secondary)" }}>
                          {fmtDuration(s.startedAt, s.completedAt)}
                        </span>
                      </div>
                    </div>
                    {s.error ? (
                      <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>
                        {s.error}
                      </p>
                    ) : null}
                    {s.output ? (
                      <details className="mt-2">
                        <summary
                          className="cursor-pointer text-xs"
                          style={{ color: "var(--kb-text-secondary)" }}
                        >
                          Output
                        </summary>
                        <pre
                          className="mt-1 overflow-auto rounded p-2 text-xs"
                          style={{ backgroundColor: "var(--kb-bg)" }}
                        >
                          {JSON.stringify(s.output, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
