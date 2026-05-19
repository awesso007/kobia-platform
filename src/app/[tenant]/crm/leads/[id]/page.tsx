import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  convertLeadToDealAction,
  logActivityAction,
  updateLeadStatusAction,
} from "@/app/actions/crm-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  NEW: "bg-sky-100 text-sky-800",
  CONTACTED: "bg-indigo-100 text-indigo-800",
  QUALIFIED: "bg-amber-100 text-amber-800",
  CONVERTED: "bg-emerald-100 text-emerald-800",
  UNQUALIFIED: "bg-slate-200 text-slate-700",
};

const ACTIVITY_TINT: Record<string, string> = {
  NOTE: "bg-slate-100 text-slate-700",
  CALL: "bg-sky-100 text-sky-800",
  EMAIL: "bg-indigo-100 text-indigo-800",
  MEETING: "bg-amber-100 text-amber-800",
  TASK: "bg-emerald-100 text-emerald-800",
};

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString();
}

export default async function LeadDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const lead = await db.lead.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
  });
  if (!lead) notFound();

  const activities = await db.crmActivity.findMany({
    where: { tenantId: auth.tenant.id, leadId: lead.id },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Lead
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {lead.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {lead.companyName ?? "—"} · {lead.source}
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-3 py-1 text-xs font-medium ${
            STATUS_BADGE[lead.status] ?? "bg-slate-100"
          }`}
        >
          {lead.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Contact</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Email</dt>
              <dd className="text-slate-800">{lead.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Phone</dt>
              <dd className="text-slate-800">{lead.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Added</dt>
              <dd className="text-slate-800">{fmtDateTime(lead.createdAt)}</dd>
            </div>
          </dl>
          {lead.notes && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {lead.notes}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          <form action={updateLeadStatusAction} className="mt-3 flex gap-2">
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={lead.id} />
            <select
              name="status"
              defaultValue={lead.status}
              className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              disabled={lead.status === "CONVERTED"}
            >
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="UNQUALIFIED">Unqualified</option>
            </select>
            <button
              type="submit"
              disabled={lead.status === "CONVERTED"}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Update
            </button>
          </form>

          {lead.status === "CONVERTED" && lead.convertedDealId ? (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
              Converted to a deal.{" "}
              <Link
                href={`/${params.tenant}/crm/deals/${lead.convertedDealId}`}
                className="underline"
              >
                Open deal →
              </Link>
            </div>
          ) : (
            <form
              action={convertLeadToDealAction}
              className="mt-4 space-y-2 border-t border-slate-100 pt-4"
            >
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <input type="hidden" name="leadId" value={lead.id} />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Convert to deal
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-600">
                    Amount ($)
                  </label>
                  <input
                    name="amount"
                    type="text"
                    placeholder="0"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600">
                    Close date
                  </label>
                  <input
                    name="closeDate"
                    type="date"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Convert to deal →
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Log activity</h2>
        <form
          action={logActivityAction}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <input type="hidden" name="leadId" value={lead.id} />
          <div>
            <label className="block text-xs text-slate-600">Type</label>
            <select
              name="type"
              defaultValue="NOTE"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="NOTE">Note</option>
              <option value="CALL">Call</option>
              <option value="EMAIL">Email</option>
              <option value="MEETING">Meeting</option>
              <option value="TASK">Task</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-600">Subject *</label>
            <input
              required
              name="subject"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Date</label>
            <input
              name="occurredAt"
              type="date"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-slate-600">Body</label>
            <textarea
              name="body"
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Log activity
            </button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {activities.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              No activity yet.
            </div>
          ) : (
            activities.map((a) => (
              <div
                key={a.id}
                className="rounded-md border border-slate-100 bg-white p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs ${
                        ACTIVITY_TINT[a.type] ?? "bg-slate-100"
                      }`}
                    >
                      {a.type}
                    </span>
                    <span className="font-medium text-slate-900">
                      {a.subject}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {fmtDateTime(a.occurredAt)}
                  </span>
                </div>
                {a.body && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                    {a.body}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
