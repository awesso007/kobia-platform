import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
} from "@/lib/workflow-runner";
import {
  toggleWorkflowRule,
  deleteWorkflowRule,
} from "@/app/actions/workflow-actions";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  const { tenant } = auth;

  const rules = await db.workflowRule
    .findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const recentRuns = await db.workflowRun
    .findMany({
      where: { tenantId: tenant.id },
      orderBy: { runAt: "desc" },
      take: 20,
      include: { rule: { select: { name: true } } },
    })
    .catch(() => []);

  const active = rules.filter((r) => r.isActive).length;
  const totalRuns = rules.reduce((acc, r) => acc + (r.runCount ?? 0), 0);

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Workflow Automation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Automate repetitive work. When something happens, KOBIA does the
            next thing for you.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/workflows/new`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New rule
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total rules" value={rules.length} />
        <KpiCard label="Active" value={active} />
        <KpiCard label="Total runs" value={totalRuns} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Rules
        </h2>
        {rules.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No rules yet. Create your first one to automate routine work.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Rule</th>
                  <th className="px-4 py-2">Trigger</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Runs</th>
                  <th className="px-4 py-2">Last run</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.name}</div>
                      {r.description ? (
                        <div className="text-xs text-slate-500">
                          {r.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {TRIGGER_LABELS[r.trigger]}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {ACTION_LABELS[r.actionType] ?? r.actionType}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{r.runCount}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.lastRunAt
                        ? new Date(r.lastRunAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          r.isActive
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        }
                      >
                        {r.isActive ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form
                        action={toggleWorkflowRule.bind(null, params.tenant)}
                        className="inline"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {r.isActive ? "Pause" : "Activate"}
                        </button>
                      </form>
                      <form
                        action={deleteWorkflowRule.bind(null, params.tenant)}
                        className="ml-2 inline"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent runs
        </h2>
        {recentRuns.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No runs yet. Once your triggers fire, you&apos;ll see the activity
            here.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Rule</th>
                  <th className="px-4 py-2">Trigger</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(run.runAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{run.rule?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {TRIGGER_LABELS[run.trigger]}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          run.status === "SUCCEEDED"
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : run.status === "FAILED"
                            ? "rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {run.message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
