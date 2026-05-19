import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  logActivityAction,
  moveDealStageAction,
  updateDealAction,
} from "@/app/actions/crm-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  WON: "bg-emerald-100 text-emerald-800",
  LOST: "bg-rose-100 text-rose-800",
};

const ACTIVITY_TINT: Record<string, string> = {
  NOTE: "bg-slate-100 text-slate-700",
  CALL: "bg-sky-100 text-sky-800",
  EMAIL: "bg-indigo-100 text-indigo-800",
  MEETING: "bg-amber-100 text-amber-800",
  TASK: "bg-emerald-100 text-emerald-800",
};

function fmtMoney(cents: bigint): string {
  const n = Number(cents) / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString();
}

function fmtDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function DealDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const deal = await db.deal.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
    include: {
      stage: true,
      pipeline: {
        include: { stages: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!deal) notFound();

  const activities = await db.crmActivity.findMany({
    where: { tenantId: auth.tenant.id, dealId: deal.id },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  const originatingLead = await db.lead.findFirst({
    where: { tenantId: auth.tenant.id, convertedDealId: deal.id },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Deal · {deal.pipeline.name}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {deal.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {fmtMoney(deal.amountCents)} ·{" "}
            <span className="text-slate-500">
              {deal.probabilityPct ?? 50}% likely
            </span>
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-3 py-1 text-xs font-medium ${
            STATUS_BADGE[deal.status] ?? "bg-slate-100"
          }`}
        >
          {deal.status}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href={`/${params.tenant}/crm`}
          className="text-slate-600 hover:underline"
        >
          ← Pipeline
        </Link>
        {originatingLead && (
          <>
            <span className="text-slate-300">·</span>
            <Link
              href={`/${params.tenant}/crm/leads/${originatingLead.id}`}
              className="text-slate-600 hover:underline"
            >
              From lead: {originatingLead.name}
            </Link>
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Stage</h2>
          <form action={moveDealStageAction} className="mt-3 flex gap-2">
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={deal.id} />
            <select
              name="stageId"
              defaultValue={deal.stageId}
              className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              {deal.pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Move
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Current stage:{" "}
            <span className="font-medium text-slate-700">
              {deal.stage.name}
            </span>
          </p>
          {deal.wonAt && (
            <p className="mt-1 text-xs text-emerald-700">
              Won on {fmtDateTime(deal.wonAt)}
            </p>
          )}
          {deal.lostAt && (
            <p className="mt-1 text-xs text-rose-700">
              Lost on {fmtDateTime(deal.lostAt)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Edit deal</h2>
          <form action={updateDealAction} className="mt-3 space-y-3">
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={deal.id} />
            <div>
              <label className="block text-xs text-slate-600">Name</label>
              <input
                name="name"
                type="text"
                required
                defaultValue={deal.name}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600">
                  Amount ($)
                </label>
                <input
                  name="amount"
                  type="text"
                  defaultValue={(Number(deal.amountCents) / 100).toFixed(2)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600">
                  Probability %
                </label>
                <input
                  name="probabilityPct"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={deal.probabilityPct ?? 50}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600">
                Close date
              </label>
              <input
                name="closeDate"
                type="date"
                defaultValue={fmtDateInput(deal.closeDate)}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Notes</label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={deal.notes ?? ""}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            {deal.status === "LOST" && (
              <div>
                <label className="block text-xs text-slate-600">
                  Lost reason
                </label>
                <input
                  name="lostReason"
                  type="text"
                  defaultValue={deal.lostReason ?? ""}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Log activity</h2>
        <form
          action={logActivityAction}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <input type="hidden" name="dealId" value={deal.id} />
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
